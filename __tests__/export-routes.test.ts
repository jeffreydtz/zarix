import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET as backup } from '@/app/api/export/backup/route';
import { GET as transactions } from '@/app/api/export/transactions/route';
import { collectExportRows, createExportBudget } from '@/lib/export-pagination';

const state = vi.hoisted(() => ({
  tables: {} as Record<string, Record<string, any>[]>,
  calls: [] as { table: string; filters: [string, string, unknown][] }[],
  cap: 2, failPage: 0, signedIn: true, profileAbort: null as AbortController | null,
}));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: state.signedIn ? { id: 'owner', email: 'owner@example.test' } : null } }) },
    from: (table: string) => {
      const filters: [string, string, unknown][] = [];
      let limit = 1000;
      const query = {
        select: () => query,
        order: () => query,
        limit: (n: number) => { limit = n; return query; },
        abortSignal: () => query,
        eq: (key: string, value: unknown) => { filters.push(['eq', key, value]); return query; },
        is: (key: string, value: unknown) => { filters.push(['eq', key, value]); return query; },
        gt: (key: string, value: unknown) => { filters.push(['gt', key, value]); return query; },
        gte: (key: string, value: unknown) => { filters.push(['gte', key, value]); return query; },
        lt: (key: string, value: unknown) => { filters.push(['lt', key, value]); return query; },
        lte: (key: string, value: unknown) => { filters.push(['lte', key, value]); return query; },
        single: async () => { state.profileAbort?.abort(); return { data: { default_currency: 'ARS', timezone: 'America/Argentina/Buenos_Aires' }, error: null }; },
        then: (resolve: (value: unknown) => unknown) => {
          state.calls.push({ table, filters });
          if (state.failPage === state.calls.length) return Promise.resolve(resolve({ data: null, error: { message: 'private db error' } }));
          const data = (state.tables[table] || []).filter(row => filters.every(([op, key, value]) => {
            if (op === 'eq') return row[key] === value;
            if (op === 'gt') return row[key] > value!;
            if (op === 'gte') return row[key] >= value!;
            if (op === 'lt') return row[key] < value!;
            return row[key] <= value!;
          })).sort((a, b) => a.id.localeCompare(b.id)).slice(0, Math.min(limit, state.cap));
          return Promise.resolve(resolve({ data, error: null }));
        },
      };
      return query;
    },
  }),
}));

function row(n: number, extra = {}) {
  return { id: String(n).padStart(8, '0'), user_id: 'owner', type: 'expense', amount: 12,
    currency: 'ARS', amount_in_account_currency: 12, transaction_date: '2026-09-14',
    account_id: 'archived', category_id: null, account: { name: 'Cuenta "USD", vieja', is_archived: true }, ...extra };
}
const request = (query = '') => new NextRequest(`http://localhost/api/export/transactions?${query}`);
beforeEach(() => {
  vi.restoreAllMocks(); state.profileAbort = null;
  state.tables = {}; state.calls = []; state.cap = 2; state.failPage = 0; state.signedIn = true;
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('complete user exports', () => {
  it('paginates every backup dataset even when the server returns fewer rows than requested', async () => {
    for (const name of ['accounts', 'transactions', 'categories', 'budgets', 'investments']) {
      state.tables[name] = [row(1), row(2), row(3), row(4, { user_id: 'other', is_system: true })];
    }
    const response = await backup();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.version).toBe('1.0');
    for (const [name, data] of Object.entries(body.data)) {
      expect(data).toHaveLength(3);
      expect(body.stats[`${name}Count`]).toBe(3);
    }
    expect(state.calls).toHaveLength(15);
    for (const call of state.calls) expect(call.filters).toContainEqual(['eq', 'user_id', 'owner']);
  });

  it('exports over 10,000 transactions, including archived accounts, with stable date ties and user isolation', async () => {
    state.cap = 700;
    state.tables.transactions = Array.from({ length: 10_005 }, (_, i) => row(i));
    state.tables.transactions.push(row(20_000, { user_id: 'other' }));
    const response = await transactions(request('format=json'));
    const body = await response.json();
    expect(body).toHaveLength(10_005);
    expect(body[0].id).toBe('00010004');
    expect(new Set(body.map((tx: any) => tx.id)).size).toBe(10_005);
    for (const call of state.calls) expect(call.filters).toContainEqual(['eq', 'user_id', 'owner']);
  });

  it('keeps all filters across pages, including uncategorized and a transfer to an archived destination', async () => {
    state.tables.transactions = [row(1), row(2), row(3)].map(tx => ({ ...tx, type: 'transfer', destination_account: { name: 'Archivada' } }));
    state.tables.transactions.push(row(4, { account_id: 'different' }), row(5, { category_id: 'category' }));
    const response = await transactions(request('format=json&accountId=archived&categoryId=uncategorized&type=transfer&startDate=2026-09-01&endDate=2026-09-30'));
    expect(await response.json()).toHaveLength(3);
    for (const call of state.calls) {
      expect(call.filters).toEqual(expect.arrayContaining([
        ['eq', 'account_id', 'archived'], ['eq', 'category_id', null], ['eq', 'type', 'transfer'],
        ['gte', 'transaction_date', '2026-09-01'], ['lt', 'transaction_date', '2026-10-01T00:00:00.000Z'],
      ]));
    }
  });

  it('includes the last fractional second of endDate but excludes the next day', async () => {
    state.tables.transactions = [row(1, { transaction_date: '2026-09-30T23:59:59.999Z' }), row(2, { transaction_date: '2026-10-01T00:00:00.000Z' })];
    const response = await transactions(request('format=json&endDate=2026-09-30'));
    expect((await response.json()).map((tx: any) => tx.id)).toEqual(['00000001']);
  });

  it.each(['startDate=2026-02-30', 'endDate=nonsense', 'startDate=2026-09-30&endDate=2026-09-01'])('rejects invalid date filters: %s', async query => {
    const response = await transactions(request(query));
    expect(response.status).toBe(400);
    expect(state.calls).toHaveLength(0);
  });

  it.each(['backup', 'transactions'])('returns no partial attachment when %s fails on a later page', async endpoint => {
    state.tables.accounts = [row(1), row(2), row(3)];
    state.tables.transactions = [row(1), row(2), row(3)];
    state.failPage = 2;
    const response = endpoint === 'backup' ? await backup() : await transactions(request());
    expect(response.status).toBe(500);
    expect(response.headers.has('content-disposition')).toBe(false);
    expect(await response.text()).not.toContain('private db error');
  });

  it('preserves CSV cells and date-only values independently of server timezone', async () => {
    state.tables.transactions = [row(1, { description: '=1+1', notes: 'linea1\nlinea2' })];
    const response = await transactions(request());
    const body = await response.text();
    expect(body).toContain('"14/9/2026"');
    expect(body).toContain('"Cuenta ""USD"", vieja"');
    expect(body).toContain('"\'=1+1"');
    expect(body).toContain('"linea1\nlinea2"');
  });

  it('requires authentication before querying datasets', async () => {
    state.signedIn = false;
    expect((await backup()).status).toBe(401);
    expect((await transactions(request())).status).toBe(401);
    expect(state.calls).toHaveLength(0);
  });

  it('rejects oversized downloads and broken cursor pages instead of returning partial rows', async () => {
    const budget = createExportBudget();
    expect(() => budget.add(Array(100_001).fill(null))).toThrow('100.000');
    expect(() => createExportBudget().add(['x'.repeat(32 * 1024 * 1024)])).toThrow('32 MiB');
    await expect(collectExportRows(async () => ({ data: [{ id: 'same' }], error: null }), createExportBudget())).rejects.toThrow('cursor');
  });

  it('returns504 without attachment if the final backup profile query exceeds its deadline', async () => {
    state.profileAbort = new AbortController();
    vi.spyOn(AbortSignal, 'timeout').mockReturnValue(state.profileAbort.signal);
    const response = await backup();
    expect(response.status).toBe(504);
    expect(response.headers.has('content-disposition')).toBe(false);
  });

  it('returns a timeout error when the database response arrives after the deadline', async () => {
    const controller = new AbortController();
    await expect(collectExportRows(async () => {
      controller.abort();
      return { data: [], error: { message: 'aborted' } };
    }, { signal: controller.signal, add: () => {} })).rejects.toMatchObject({ status: 504 });
  });
});
