// Synthetic PostgREST double enforces the isolated environment's 1000-row cap.
// It applies filters and order before range; no database or financial write occurs.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  rows: [] as Record<string, any>[], rules: [] as Record<string, any>[],
  queries: [] as Record<string, any>[], writes: [] as Record<string, any>[],
  failPage: null as null | ((query: Record<string, any>) => boolean), active: vi.fn(),
}));
vi.mock('@/lib/supabase/server', () => ({ createServiceClientSync: () => ({ from: query }) }));
vi.mock('@/lib/services/accounts', () => ({ accountsService: { getActiveAccountIds: mocks.active }, normalizeDebtBalanceForStorage: vi.fn() }));
vi.mock('@/lib/services/cotizaciones', () => ({ cotizacionesService: { getExchangeRate: vi.fn().mockResolvedValue(1300) } }));
import { transactionsService } from '@/lib/services/transactions';
import { getMonthFlow } from '@/lib/services/month-flow';

const accountId = '00000000-0000-0000-0000-000000000001';
const destinationId = '00000000-0000-0000-0000-000000000002';
const archivedId = '00000000-0000-0000-0000-000000000003';
const account = { id: accountId, user_id: 'U1', balance: 123, type: 'bank', currency: 'ARS', is_active: true };
function quotedIds(value: string): string[] { return [...value.matchAll(/"([^"\n]+)"/g)].map(match => match[1]); }
function query(table: string) {
  const state: Record<string, any> = { table, filters: [], orders: [], from: 0, to: 999, ranged: false };
  mocks.queries.push(state);
  const builder: Record<string, any> = {};
  for (const key of ['select', 'eq', 'gte', 'lte', 'in', 'filter', 'or']) {
    builder[key] = (...args: unknown[]) => { state.filters.push([key, ...args]); return builder; };
  }
  builder.order = (key: string, options: { ascending: boolean }) => { state.orders.push([key, options.ascending]); return builder; };
  builder.range = (from: number, to: number) => { state.from = from; state.to = to; state.ranged = true; return builder; };
  builder.update = (values: Record<string, any>) => { state.update = values; return builder; };
  const execute = () => {
    if (mocks.failPage?.(state)) return { data: null, error: { message: 'synthetic page failure' } };
    if (state.update) { mocks.writes.push(state.update); return { data: [], error: null }; }
    let rows = table === 'accounts' ? [account] : table === 'transactions' ? [...mocks.rows] : [...mocks.rules];
    for (const [op, key, value, extra] of state.filters) {
      if (op === 'eq') rows = rows.filter(row => row[key] === value);
      if (op === 'gte') rows = rows.filter(row => row[key] >= value);
      if (op === 'lte') rows = rows.filter(row => row[key] <= value);
      if (op === 'in') rows = rows.filter(row => value.includes(row[key]));
      if (op === 'filter' && value === 'in') rows = rows.filter(row => quotedIds(extra).includes(row[key]));
      if (op === 'or') {
        if (key.startsWith('destination_account_id.is.null')) rows = rows.filter(row => row.destination_account_id == null || quotedIds(key).includes(row.destination_account_id));
        else rows = rows.filter(row => row.account_id === accountId || row.destination_account_id === accountId);
      }
    }
    rows.sort((left, right) => {
      for (const [key, ascending] of state.orders) {
        if (left[key] !== right[key]) return (left[key] < right[key] ? -1 : 1) * (ascending ? 1 : -1);
      }
      return 0;
    });
    return { data: rows.slice(state.from, Math.min(state.to + 1, state.from + 1000)), error: null };
  };
  builder.single = async () => { const result = execute(); return { ...result, data: result.data?.[0] ?? null }; };
  builder.then = (resolve: (reply: unknown) => unknown, reject: (reason: unknown) => unknown) => Promise.resolve(execute()).then(resolve, reject);
  return builder;
}
function expenseRows(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    id: `row-${String(index).padStart(5, '0')}`, user_id: 'U1', account_id: accountId, destination_account_id: null,
    type: 'expense', amount: 2, currency: 'ARS', amount_in_account_currency: 2,
    transaction_date: '2026-10-13T12:00:00.000Z', category: { name: 'Sintética', icon: 'X' },
  }));
}
beforeEach(() => {
  vi.clearAllMocks(); mocks.rows = []; mocks.rules = []; mocks.queries = []; mocks.writes = []; mocks.failPage = null;
  mocks.active.mockResolvedValue([accountId, destinationId]);
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-14T12:00:00.000Z'));
});
afterEach(() => { vi.useRealTimers(); });

describe('financial aggregate reads beyond PostgREST max_rows', () => {
  it('reads every month-summary row while retaining owner, date and archived-account filters', async () => {
    mocks.rows = expenseRows(1505);
    mocks.rows.push({ ...mocks.rows[0], id: 'foreign', user_id: 'U2', amount: 99999 },
      { ...mocks.rows[0], id: 'archived', account_id: archivedId, amount: 99999 },
      { ...mocks.rows[0], id: 'foreign-destination', destination_account_id: archivedId, amount: 99999 },
      // Away from the local-calendar month boundary preserved by this service.
      { ...mocks.rows[0], id: 'future', transaction_date: '2026-11-02T12:00:00.000Z', amount: 99999 });
    const result = await transactionsService.getMonthSummary('U1', new Date('2026-10-14T12:00:00.000Z'));
    expect(result.transactionCount).toBe(1505);
    expect(result.totalExpenses).toBe(3010);
    expect(result.topCategories[0].amount).toBe(3010);
    const pages = mocks.queries.filter(query => query.table === 'transactions');
    expect(pages.map(query => [query.from, query.to])).toEqual([[0, 999], [1000, 1999]]);
    for (const page of pages) {
      expect(page.orders).toEqual([['transaction_date', true], ['id', true]]);
      expect(page.filters).toEqual(pages[0].filters);
    }
  });
  it('reads all MTD, trailing and pending-rule rows instead of projecting truncated subsets', async () => {
    mocks.rows = expenseRows(1505);
    mocks.rules = Array.from({ length: 1005 }, (_, index) => ({
      id: `rule-${index}`, user_id: 'U1', is_active: true, type: 'expense', frequency: 'monthly',
      amount: 3, currency: 'ARS', start_date: '2026-10-01', end_date: null, last_executed_date: null,
    }));
    const result = await getMonthFlow('U1');
    expect(result.incomeARS).toBe(0);
    expect(result.spentARS).toBe(3010);
    expect(result.daysLeft).toBe(17);
    expect(result.projectedSpendARS).toBeCloseTo(3010 + 3010 / 14 * 17 + 3015, 8);
  });
  it('reconstruction completes the ledger before issuing the mocked account update', async () => {
    mocks.rows = [{ ...expenseRows(1)[0], id: 'initial', type: 'income', amount: 10000, amount_in_account_currency: 10000,
      transaction_date: '2026-10-01T00:00:00.000Z' }, ...expenseRows(1505)];
    expect(await transactionsService.recomputeAccountBalanceFromLedger('U1', accountId)).toEqual({ before: 123, after: 6990 });
    expect(mocks.writes).toEqual([expect.objectContaining({ balance: 6990 })]);
  });
  it('reconstruction preserves the authoritative destination amount and owner/account scope across pages', async () => {
    mocks.rows = [{ ...expenseRows(1)[0], id: 'initial', type: 'income', amount: 10000, amount_in_account_currency: 10000,
      transaction_date: '2026-10-01T00:00:00.000Z' }, ...expenseRows(1505)];
    mocks.rows.push({ ...mocks.rows[0], id: 'foreign', user_id: 'U2', amount_in_account_currency: 99999 },
      { ...mocks.rows[0], id: 'unrelated', account_id: destinationId, amount_in_account_currency: 99999 },
      { ...mocks.rows[0], id: 'incoming', account_id: destinationId, destination_account_id: accountId, type: 'transfer',
        transaction_date: '2026-10-15T12:00:00.000Z', amount: 888, exchange_rate: 0.004,
        amount_in_account_currency: 888, destination_amount_in_account_currency: 7.33 });
    const result = await transactionsService.recomputeAccountBalanceFromLedger('U1', accountId);
    expect(result.after).toBeCloseTo(6997.33, 8);
    expect(mocks.writes).toHaveLength(1);
    const pages = mocks.queries.filter(query => query.table === 'transactions');
    expect(pages).toHaveLength(2);
    expect(pages[1].filters).toEqual(pages[0].filters);
    expect(pages[1].orders).toEqual([['transaction_date', true], ['id', true]]);
  });
  it('handles an exact 5000-row dataset and an empty final page without duplicates', async () => {
    mocks.rows = expenseRows(5000).reverse();
    const result = await transactionsService.getMonthSummary('U1', new Date('2026-10-14T12:00:00.000Z'));
    expect(result.totalExpenses).toBe(10000);
    expect(result.transactionCount).toBe(5000);
    expect(mocks.queries.filter(query => query.table === 'transactions').map(query => query.from)).toEqual([0, 1000, 2000, 3000, 4000, 5000]);
  });
  it('rejects an intermediate summary page instead of returning the first page total', async () => {
    mocks.rows = expenseRows(1505);
    mocks.failPage = state => state.table === 'transactions' && state.from === 1000;
    await expect(transactionsService.getMonthSummary('U1', new Date('2026-10-14T12:00:00.000Z')))
      .rejects.toMatchObject({ message: 'synthetic page failure' });
  });
  it('never updates an account after an intermediate reconstruction page fails', async () => {
    mocks.rows = expenseRows(1505);
    mocks.failPage = state => state.table === 'transactions' && state.from === 1000;
    await expect(transactionsService.recomputeAccountBalanceFromLedger('U1', accountId))
      .rejects.toMatchObject({ message: 'synthetic page failure' });
    expect(mocks.writes).toEqual([]);
  });
  it.each(['mtd', 'trailing', 'rules'])('rejects an intermediate %s month-flow page without partial projections', async section => {
    mocks.rows = expenseRows(1505);
    mocks.rules = Array.from({ length: 1505 }, (_, index) => ({ id: `rule-${index}`, user_id: 'U1', is_active: true,
      type: 'expense', frequency: 'monthly', amount: 3, currency: 'ARS', start_date: '2026-10-01', end_date: null, last_executed_date: null }));
    mocks.failPage = state => state.from === 1000 && (section === 'rules' ? state.table === 'recurring_rules'
      : state.table === 'transactions' && state.filters.some((filter: unknown[]) => filter[0] === 'eq' && filter[1] === 'type') === (section === 'trailing'));
    await expect(getMonthFlow('U1')).rejects.toMatchObject({ message: 'synthetic page failure' });
  });
  it('retains owner, active frequency and trailing-period selection on every month-flow page', async () => {
    mocks.rows = expenseRows(1505);
    mocks.rows.push({ ...mocks.rows[0], id: 'foreign', user_id: 'U2', amount: 99999 },
      { ...mocks.rows[0], id: 'archived', account_id: archivedId, amount: 99999 },
      { ...mocks.rows[0], id: 'future', transaction_date: '2026-11-02T12:00:00.000Z', amount: 99999 });
    mocks.rules = Array.from({ length: 1005 }, (_, index) => ({ id: `rule-${index}`, user_id: 'U1', is_active: true,
      type: 'expense', frequency: 'monthly', amount: 3, currency: 'ARS', start_date: '2026-10-01', end_date: null, last_executed_date: null }));
    mocks.rules.push({ ...mocks.rules[0], id: 'foreign-rule', user_id: 'U2', amount: 99999 },
      { ...mocks.rules[0], id: 'inactive-rule', is_active: false, amount: 99999 },
      { ...mocks.rules[0], id: 'yearly-rule', frequency: 'yearly', amount: 99999 });
    const result = await getMonthFlow('U1');
    expect(result.projectedSpendARS).toBeCloseTo(3010 + 3010 / 14 * 17 + 3015, 8);
    const groups = [
      mocks.queries.filter(query => query.table === 'transactions' && !query.filters.some((filter: unknown[]) => filter[0] === 'eq' && filter[1] === 'type')),
      mocks.queries.filter(query => query.table === 'transactions' && query.filters.some((filter: unknown[]) => filter[0] === 'eq' && filter[1] === 'type')),
      mocks.queries.filter(query => query.table === 'recurring_rules'),
    ];
    for (const group of groups) {
      expect(group.length).toBe(2);
      expect(group[1].filters).toEqual(group[0].filters);
      expect(group[1].orders).toEqual(group[0].orders);
    }
  });
});
