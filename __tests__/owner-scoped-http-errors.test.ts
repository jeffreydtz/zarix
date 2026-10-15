import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn(), quotes: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'owner-a' } } }) }, from: mocks.from }),
  createServiceClientSync: () => ({ from: mocks.from, rpc: mocks.rpc }),
}));
vi.mock('@/lib/services/cotizaciones', () => ({ cotizacionesService: { getDolarQuotes: mocks.quotes } }));
vi.mock('@/lib/yahoo-finance-quotes', () => ({ fetchYahooStockQuotesMap: vi.fn() }));
vi.mock('@/lib/stooq-us-quote', () => ({ fetchStooqUsQuote: vi.fn() }));
vi.mock('@/lib/market-data/data912-client', () => ({ loadArgentineQuotes: vi.fn() }));
vi.mock('@/lib/services/notification-outbox', () => ({ enqueueNotification: vi.fn() }));

import { PATCH as investmentPatch } from '@/app/api/investments/[id]/route';
import { POST as investmentCreate } from '@/app/api/investments/route';
import { PUT as recurringPut } from '@/app/api/recurring/[id]/route';
import { PUT as budgetPut } from '@/app/api/budgets/[id]/route';
import { GET as transactionGet, PATCH as transactionPatch } from '@/app/api/transactions/[id]/route';

type Reply = { data: unknown; error?: { code: string; message: string } };
type Query = { table: string; eq: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn>; single: ReturnType<typeof vi.fn> };
let replies: Reply[];
let queries: Query[];
const noRow = { code: 'PGRST116', message: 'SYNTHETIC_RAW_NO_ROW_DETAIL' };
const unavailable = { code: 'PGRST205', message: 'SYNTHETIC_BACKEND_DETAIL' };
const props = { params: Promise.resolve({ id: 'fixture-b' }) };
const generic = { error: 'Ocurrió un error procesando la solicitud.' };
const movement = { id: 'fixture-a', type: 'expense', amount: 1, currency: 'ARS', account_id: 'account-a',
  amount_in_account_currency: 1, destination_account_id: null, destination_amount_in_account_currency: null, exchange_rate: null };
const transactionBody = { account_id: 'account-a', currency: 'ARS', amount: 1, transaction_date: '2026-10-15' };
const investmentBody = { accountId: 'account-a', type: 'stock_us', name: 'Synthetic position', quantity: 1,
  purchasePrice: 1, purchaseCurrency: 'USD', purchaseDate: '2026-10-15' };

beforeEach(() => {
  vi.clearAllMocks(); replies = []; queries = [];
  vi.spyOn(console, 'error').mockImplementation(() => {});
  mocks.from.mockImplementation((table: string) => {
    const reply = replies.shift();
    if (!reply) throw new Error('Unexpected fixture query');
    const query = { table } as Query & Record<string, unknown>;
    for (const key of ['select', 'eq', 'update']) query[key] = vi.fn(() => query);
    query.single = vi.fn(async () => reply);
    query.maybeSingle = query.single;
    queries.push(query);
    return query;
  });
});
afterEach(() => vi.restoreAllMocks());

function request(path: string, method: string, body?: unknown) {
  return new NextRequest(`http://localhost/api/${path}`, { method,
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'synthetic:request:1' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
function scoped(query: Query, id: string) {
  expect(query.eq.mock.calls).toEqual([['id', id], ['user_id', 'owner-a']]);
}
async function masked(response: Response) {
  expect(response.status).toBe(500);
  expect(await response.json()).toEqual(generic);
}

describe('single-row owner-scoped UPDATE contracts', () => {
  const cases = [
    { name: 'investment PATCH', table: 'investments', handler: investmentPatch, method: 'PATCH', path: 'investments/fixture-b', body: { name: 'Synthetic changed' } },
    { name: 'recurring PUT', table: 'recurring_rules', handler: recurringPut, method: 'PUT', path: 'recurring/fixture-b', body: { description: 'Synthetic changed' } },
    { name: 'budget PUT', table: 'budgets', handler: budgetPut, method: 'PUT', path: 'budgets/fixture-b', body: { amount: 2 } },
  ];
  for (const entry of cases) {
    it(`${entry.name}: zero matched foreign rows returns 404 without an unscoped retry`, async () => {
      replies = [{ data: null, error: noRow }];
      const response = await entry.handler(request(entry.path, entry.method, entry.body), props);
      expect(response.status).toBe(404);
      expect(queries).toHaveLength(1); expect(queries[0].table).toBe(entry.table);
      scoped(queries[0], 'fixture-b'); expect(mocks.rpc).not.toHaveBeenCalled();
      expect(JSON.stringify(await response.json())).not.toContain(noRow.message);
    });
    it(`${entry.name}: unknown backend failure stays masked 500`, async () => {
      replies = [{ data: null, error: unavailable }];
      await masked(await entry.handler(request(entry.path, entry.method, entry.body), props));
      expect(queries).toHaveLength(1); scoped(queries[0], 'fixture-b');
      expect(mocks.rpc).not.toHaveBeenCalled();
    });
    it(`${entry.name}: successful own-row response remains unchanged`, async () => {
      const ownRow = { id: 'fixture-b', user_id: 'owner-a', synthetic: true };
      replies = [{ data: ownRow }];
      const response = await entry.handler(request(entry.path, entry.method, entry.body), props);
      expect(response.status).toBe(200); expect(await response.json()).toEqual(ownRow);
      scoped(queries[0], 'fixture-b');
    });
  }
});

describe('existing investment account eligibility rejects before mutation', () => {
  it.each([
    ['bank account', { id: 'account-a', type: 'bank', is_active: true }, 400],
    ['missing/foreign account', null, 404],
    ['archived account', { id: 'account-a', type: 'investment', is_active: false }, 404],
  ])('%s returns a known domain rejection before mutation', async (_name, data, status) => {
    replies = [{ data: null }, { data }]; // durable receipt read precedes account eligibility
    const response = await investmentCreate(request('investments', 'POST', investmentBody));
    expect(response.status).toBe(status); scoped(queries[1], 'account-a');
    expect(queries).toHaveLength(2); expect(queries.every(q => q.update.mock.calls.length === 0)).toBe(true);
    expect(mocks.rpc).not.toHaveBeenCalled(); expect(mocks.quotes).not.toHaveBeenCalled();
  });
  it.each([unavailable, noRow])('maybeSingle account errors are not globally reclassified ($code)', async error => {
    replies = [{ data: null }, { data: null, error }];
    await masked(await investmentCreate(request('investments', 'POST', investmentBody)));
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it('a bank-account reassignment is rejected before the investment UPDATE', async () => {
    replies = [{ data: { id: 'account-a', type: 'bank', is_active: true } }];
    const response = await investmentPatch(request('investments/fixture-b', 'PATCH', { accountId: 'account-a' }), props);
    expect(response.status).toBe(400); scoped(queries[0], 'account-a');
    expect(queries[0].update).not.toHaveBeenCalled(); expect(mocks.rpc).not.toHaveBeenCalled();
  });
});

describe('movement singleton errors distinguish absence from outages', () => {
  it('GET missing foreign movement remains 404 with a scoped query', async () => {
    replies = [{ data: null, error: noRow }];
    expect((await transactionGet(request('transactions/fixture-b', 'GET'), props)).status).toBe(404);
    scoped(queries[0], 'fixture-b');
  });
  it('GET backend outage returns masked 500 instead of false 404', async () => {
    replies = [{ data: null, error: unavailable }];
    await masked(await transactionGet(request('transactions/fixture-b', 'GET'), props));
    expect(queries[0].update).not.toHaveBeenCalled();
  });
  it.each(['movement', 'source account', 'destination account'])('PATCH %s outage returns 500 without an UPDATE', async step => {
    const transfer = { ...movement, type: 'transfer', destination_account_id: 'destination-a' };
    replies = step === 'movement' ? [{ data: null, error: unavailable }]
      : step === 'source account' ? [{ data: movement }, { data: null, error: unavailable }]
        : [{ data: transfer }, { data: { currency: 'ARS', is_active: true } }, { data: null, error: unavailable }];
    const body = { ...transactionBody, ...(step === 'destination account' ? { amount: 2 } : {}) };
    await masked(await transactionPatch(request('transactions/fixture-b', 'PATCH', body), props));
    expect(queries.every(q => q.update.mock.calls.length === 0)).toBe(true);
    scoped(queries[0], 'fixture-b'); expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it('PATCH missing movement retains 404 and skips account lookups and UPDATE', async () => {
    replies = [{ data: null, error: noRow }];
    expect((await transactionPatch(request('transactions/fixture-b', 'PATCH', transactionBody), props)).status).toBe(404);
    expect(queries).toHaveLength(1); expect(queries[0].update).not.toHaveBeenCalled();
  });
  it('PATCH missing source account retains the existing 400 contract without UPDATE', async () => {
    replies = [{ data: movement }, { data: null, error: noRow }];
    expect((await transactionPatch(request('transactions/fixture-b', 'PATCH', transactionBody), props)).status).toBe(400);
    expect(queries.every(q => q.update.mock.calls.length === 0)).toBe(true); scoped(queries[1], 'account-a');
  });
  it('PATCH lost row at the final scoped UPDATE returns 404 without retrying', async () => {
    replies = [{ data: movement }, { data: { currency: 'ARS', is_active: true } }, { data: null, error: noRow }];
    expect((await transactionPatch(request('transactions/fixture-b', 'PATCH', transactionBody), props)).status).toBe(404);
    expect(queries).toHaveLength(3); scoped(queries[2], 'fixture-b'); expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
