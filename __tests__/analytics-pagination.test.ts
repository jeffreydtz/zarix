import { beforeEach, describe, expect, it, vi } from 'vitest';

type Row = {
  id: string;
  user_id: string;
  type: string;
  amount: number;
  currency: string;
  transaction_date: string;
  category_id: string | null;
  category: { name: string; icon: string } | null;
  account_id: string;
  account: { name: string; icon: string; color: string; is_active: boolean } | null;
};
type QueryCall = {
  filters: Array<[string, string, unknown]>;
  orders: Array<[string, boolean]>;
  range: [number, number] | null;
};
const mocks = vi.hoisted(() => ({
  from: vi.fn(), rpc: vi.fn(), converter: vi.fn(), rows: [] as Row[],
  calls: [] as QueryCall[], failFrom: null as number | null,
}));
vi.mock('@/lib/supabase/server', () => ({ createServiceClientSync: () => ({ from: mocks.from, rpc: mocks.rpc }) }));
vi.mock('@/lib/services/transactions', () => ({ buildToArsConverter: mocks.converter }));
import { analyticsService } from '@/lib/services/analytics';
import { ymdToQueryEndIso, ymdToQueryStartIso } from '@/lib/transaction-date';

const OWNER = 'synthetic-owner';
const START = '2026-10-01';
const END = '2026-10-03';
const pageError = { message: 'Controlled second-page read failure', code: 'TEST_PAGE_ERROR' };
function row(id: string, overrides: Partial<Row> = {}): Row {
  return {
    id, user_id: OWNER, type: 'expense', amount: 1, currency: 'ARS',
    transaction_date: '2026-10-01T12:00:00.000Z', category_id: 'category-a',
    category: { name: 'Category A', icon: 'A' }, account_id: 'account-a',
    account: { name: 'Account A', icon: 'A', color: '#111111', is_active: true },
    ...overrides,
  };
}
function fullFixture(): Row[] {
  const b = {
    transaction_date: '2026-10-02T12:00:00.000Z', category_id: 'category-b',
    category: { name: 'Category B', icon: 'B' }, account_id: 'account-b',
    account: { name: 'Account B', icon: 'B', color: '#222222', is_active: true },
  };
  return [
    ...Array.from({ length: 1100 }, (_, index) => row(`a-${String(index).padStart(4, '0')}`)),
    ...Array.from({ length: 200 }, (_, index) => row(`b-ars-${String(index).padStart(4, '0')}`, { ...b, amount: 2 })),
    ...Array.from({ length: 100 }, (_, index) => row(`b-usd-${String(index).padStart(4, '0')}`, { ...b, currency: 'USD' })),
    ...Array.from({ length: 100 }, (_, index) => row(`income-${String(index).padStart(4, '0')}`, {
      type: 'income', amount: 5, transaction_date: '2026-10-03T12:00:00.000Z',
    })),
    row('other-owner', { user_id: 'synthetic-other-owner', amount: 999999 }),
    row('before-period', { transaction_date: '2026-09-30T12:00:00.000Z', amount: 999999 }),
    row('after-period', { transaction_date: '2026-10-04T12:00:00.000Z', amount: 999999 }),
    row('archived', { amount: 999999, account: { name: 'Archived', icon: 'X', color: '#333333', is_active: false } }),
    row('transfer', { type: 'transfer', amount: 999999 }),
    row('adjustment', { type: 'adjustment', amount: 999999 }),
  ];
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.rows = fullFixture();
  mocks.calls = [];
  mocks.failFrom = null;
  mocks.rpc.mockResolvedValue({ data: [], error: null });
  mocks.converter.mockResolvedValue({
    toArs: (transaction: { amount: number; currency: string }) =>
      transaction.amount * (transaction.currency === 'USD' ? 1300 : 1),
    excludedCurrencies: [],
  });
  mocks.from.mockImplementation((table: string) => {
    if (table !== 'transactions') throw new Error(`Unexpected synthetic table ${table}`);
    const call: QueryCall = { filters: [], orders: [], range: null };
    const query = {
      select: () => query,
      eq: (field: string, value: unknown) => { call.filters.push(['eq', field, value]); return query; },
      in: (field: string, value: unknown) => { call.filters.push(['in', field, value]); return query; },
      gte: (field: string, value: unknown) => { call.filters.push(['gte', field, value]); return query; },
      lte: (field: string, value: unknown) => { call.filters.push(['lte', field, value]); return query; },
      order: (field: string, options?: { ascending?: boolean }) => {
        call.orders.push([field, options?.ascending !== false]); return query;
      },
      range: (from: number, to: number) => { call.range = [from, to]; return query; },
      then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => {
        mocks.calls.push({ filters: [...call.filters], orders: [...call.orders], range: call.range });
        const from = call.range?.[0] ?? 0;
        if (mocks.failFrom !== null && from >= mocks.failFrom) {
          return Promise.resolve({ data: null, error: pageError }).then(resolve, reject);
        }
        let filtered = mocks.rows.filter(transaction => call.filters.every(([operator, field, value]) => {
          const actual = transaction[field as keyof Row];
          if (operator === 'eq') return actual === value;
          if (operator === 'in') return (value as unknown[]).includes(actual);
          if (operator === 'gte') return String(actual) >= String(value);
          if (operator === 'lte') return String(actual) <= String(value);
          throw new Error(`Unsupported synthetic filter ${operator}`);
        }));
        if (call.orders.length) filtered = [...filtered].sort((a, b) => {
          for (const [field, ascending] of call.orders) {
            const left = String(a[field as keyof Row]);
            const right = String(b[field as keyof Row]);
            if (left !== right) return (left < right ? -1 : 1) * (ascending ? 1 : -1);
          }
          return 0;
        });
        // Simulated PostgREST max_rows=1000; missing .range silently truncates.
        const requestedSize = call.range ? call.range[1] - from + 1 : 1000;
        const data = filtered.slice(from, from + Math.min(1000, requestedSize));
        return Promise.resolve({ data, error: null }).then(resolve, reject);
      },
    };
    return query;
  });
});

describe('bounded top-expense reads preserve error visibility', () => {
  it('rejects a failed top-expenses RPC instead of presenting an empty list', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'Synthetic top RPC failure' } });
    await expect(analyticsService.getTopExpenses(OWNER, START, END, 10))
      .rejects.toMatchObject({ message: 'Synthetic top RPC failure' });
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it('rejects a failed hydration page instead of presenting a partial or empty list', async () => {
    mocks.rpc.mockResolvedValue({ data: [{ id: 'a-0000' }], error: null });
    mocks.failFrom = 0;
    await expect(analyticsService.getTopExpenses(OWNER, START, END, 10)).rejects.toMatchObject(pageError);
  });
  it('preserves a legitimate successful empty top-expenses result', async () => {
    expect(await analyticsService.getTopExpenses(OWNER, START, END, 10)).toEqual([]);
    expect(mocks.from).not.toHaveBeenCalled();
  });
});

function expectPagedFilters(types: string[], start = START) {
  expect(mocks.calls.map(call => call.range)).toEqual([[0, 999], [1000, 1999]]);
  for (const call of mocks.calls) {
    expect(call.orders).toEqual([['transaction_date', true], ['id', true]]);
    expect(call.filters).toContainEqual(['eq', 'user_id', OWNER]);
    expect(call.filters).toContainEqual(['gte', 'transaction_date', ymdToQueryStartIso(start)]);
    expect(call.filters).toContainEqual(['lte', 'transaction_date', ymdToQueryEndIso(END)]);
    expect(call.filters).toContainEqual(types.length === 1
      ? ['eq', 'type', types[0]] : ['in', 'type', types]);
  }
}

// Constants form the oracle independently of the implementation: 1100×ARS1
// +200×ARS2 +100×USD1×1300 = ARS131500; 100×ARS5 income = ARS500.
describe('analytics full reads with a 1000-row server cap', () => {
  it('sums every eligible expense and category count, preserving owner/date/archived filters', async () => {
    const result = await analyticsService.getCategoryBreakdown(OWNER, START, END);
    expect(result.map(({ name, amount, count }) => ({ name, amount, count }))).toEqual([
      { name: 'Category B', amount: 130400, count: 300 },
      { name: 'Category A', amount: 1100, count: 1100 },
    ]);
    expect(result[0].percent).toBeCloseTo(130400 / 131500 * 100, 10);
    expect(result.reduce((sum, category) => sum + category.amount, 0)).toBe(131500);
    expect(mocks.converter).toHaveBeenCalledOnce();
    expect(mocks.converter.mock.calls[0][0]).toHaveLength(1400);
    expectPagedFilters(['expense']);
  });

  it('reads every month row and preserves expansion of the start date to the month first', async () => {
    const result = await analyticsService.getMonthlyTrend(OWNER, '2026-10-02', END);
    expect(result).toEqual([{
      month: '2026-10', monthLabel: 'Oct 26', expenses: 131500, income: 500, balance: -131000,
    }]);
    expect(analyticsService.getAveragesFromMonthly(result)).toEqual({
      avgExpenses: 131500, avgIncome: 500, avgBalance: -131000,
    });
    expectPagedFilters(['expense', 'income']);
  });

  it('reads every row before grouping income and expenses by civil day', async () => {
    expect(await analyticsService.getDailyTrend(OWNER, START, END)).toEqual([
      { date: START, dayLabel: '1/10', expenses: 1100, income: 0 },
      { date: '2026-10-02', dayLabel: '2/10', expenses: 130400, income: 0 },
      { date: END, dayLabel: '3/10', expenses: 0, income: 500 },
    ]);
    expectPagedFilters(['expense', 'income']);
  });

  it('includes expenses past the first page in account amounts and percentages', async () => {
    const result = await analyticsService.getAccountBreakdown(OWNER, START, END);
    expect(result.map(({ name, amount }) => ({ name, amount }))).toEqual([
      { name: 'Account B', amount: 130400 }, { name: 'Account A', amount: 1100 },
    ]);
    expect(result[0].percent).toBeCloseTo(130400 / 131500 * 100, 10);
    expectPagedFilters(['expense']);
  });

  it.each(['category', 'monthly', 'daily', 'account'] as const)('rejects a second-page error instead of returning partial or zero %s totals', async method => {
    mocks.failFrom = 1000;
    const read = {
      category: () => analyticsService.getCategoryBreakdown(OWNER, START, END),
      monthly: () => analyticsService.getMonthlyTrend(OWNER, START, END),
      daily: () => analyticsService.getDailyTrend(OWNER, START, END),
      account: () => analyticsService.getAccountBreakdown(OWNER, START, END),
    }[method];
    await expect(read()).rejects.toMatchObject(pageError);
    expect(mocks.calls).toHaveLength(2);
    expect(mocks.converter).not.toHaveBeenCalled();
  });

  it('preserves the existing null-account inclusion and archived-account exclusion', async () => {
    mocks.rows = [row('null', { amount: 7, account: null }), row('active', { amount: 11 }),
      row('archived', { amount: 999999, account: { name: 'Archived', icon: 'X', color: '#333333', is_active: false } })];
    const result = await analyticsService.getCategoryBreakdown(OWNER, START, END);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ amount: 18, count: 2, percent: 100 });
  });

  it('retains legitimate empty results and zero buckets without confusing them with read failures', async () => {
    mocks.rows = [];
    expect(await analyticsService.getCategoryBreakdown(OWNER, START, END)).toEqual([]);
    expect(await analyticsService.getAccountBreakdown(OWNER, START, END)).toEqual([]);
    expect(await analyticsService.getMonthlyTrend(OWNER, START, END)).toEqual([{
      month: '2026-10', monthLabel: 'Oct 26', expenses: 0, income: 0, balance: 0,
    }]);
    expect(await analyticsService.getDailyTrend(OWNER, START, END)).toEqual([
      { date: START, dayLabel: '1/10', expenses: 0, income: 0 },
      { date: '2026-10-02', dayLabel: '2/10', expenses: 0, income: 0 },
      { date: END, dayLabel: '3/10', expenses: 0, income: 0 },
    ]);
  });
});


describe('analytics FX outage does not present unknown aggregates as zero', () => {
  it.each(['category', 'monthly', 'daily', 'account'] as const)('rejects incomplete %s aggregates with a clear FX reason', async method => {
    mocks.converter.mockResolvedValue({
      toArs: (transaction: { amount: number; currency: string }) => transaction.currency === 'USD' ? null : transaction.amount,
      excludedCurrencies: ['USD'],
    });
    const read = {
      category: () => analyticsService.getCategoryBreakdown(OWNER, START, END),
      monthly: () => analyticsService.getMonthlyTrend(OWNER, START, END),
      daily: () => analyticsService.getDailyTrend(OWNER, START, END),
      account: () => analyticsService.getAccountBreakdown(OWNER, START, END),
    }[method];
    await expect(read()).rejects.toThrow('Cotizaciones no disponibles para USD');
  });
});
