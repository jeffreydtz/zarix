import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
const mocks = vi.hoisted(() => ({ user: { id: 'user-a' } as { id: string } | null, excluded: [] as string[], accountError: null as object | null, bounds: [] as unknown[][] }));
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({
  auth: { getUser: async () => ({ data: { user: mocks.user } }) },
  from: (table: string) => {
    const query: Record<string, unknown> = {};
    for (const name of ['select', 'eq', 'in', 'gte', 'lt']) query[name] = (...args: unknown[]) => { if (name === 'gte' || name === 'lt') mocks.bounds.push([name, ...args]); return query; };
    query.then = (resolve: (x: unknown) => unknown) => resolve({ data: table === 'transactions' ? [{ type: 'income', amount: 100, transaction_date: '2026-09-30T12:00:00Z' }] : [{ balance: 1000, currency: 'ARS', is_debt: false }], error: table === 'accounts' ? mocks.accountError : null });
    return query;
  },
}) }));
vi.mock('@/lib/services/accounts', () => ({ accountsService: { getActiveAccountIds: async () => ['own'] } }));
vi.mock('@/lib/services/transactions', () => ({
  applyArchivedAccountsTransactionFilter: (q: unknown) => q,
  buildToArsConverter: async () => ({ toArs: (t: { amount: number }) => t.amount, excludedCurrencies: mocks.excluded }),
}));
import { GET } from '@/app/api/ai/projections/route';
describe('projection API calendar and completeness', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-06T12:00:00Z')); mocks.user = { id: 'user-a' }; mocks.excluded = []; mocks.accountError = null; mocks.bounds = []; });
  afterEach(() => vi.useRealTimers());
  it('queries the closed months at Argentina midnight instead of UTC midnight', async () => {
    const response = await GET(new NextRequest('http://localhost/api/ai/projections'));
    expect(response.status).toBe(200);
    expect(mocks.bounds).toEqual([['gte', 'transaction_date', '2026-07-01T03:00:00.000Z'], ['lt', 'transaction_date', '2026-10-01T03:00:00.000Z']]);
    expect(await response.json()).toMatchObject({ hasData: true, avgIncome: 100, projection3m: 1300 });
  });
  it('does not project an inflated saving when a currency could not be converted', async () => {
    mocks.excluded = ['USD'];
    const response = await GET(new NextRequest('http://localhost/api/ai/projections'));
    expect(await response.json()).toMatchObject({ hasData: false, excludedCurrencies: ['USD'] });
  });
  it('reports an account query failure instead of a zero balance', async () => {
    mocks.accountError = { message: 'controlled failure' };
    expect((await GET(new NextRequest('http://localhost/api/ai/projections'))).status).toBe(500);
  });
  it('rejects an unauthenticated caller', async () => {
    mocks.user = null;
    expect((await GET(new NextRequest('http://localhost/api/ai/projections'))).status).toBe(401);
    expect(mocks.bounds).toEqual([]);
  });
});
