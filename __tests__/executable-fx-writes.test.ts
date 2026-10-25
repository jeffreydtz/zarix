import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const fixture = vi.hoisted(() => ({
  writes: vi.fn(),
  importBatches: vi.fn(),
  type: 'expense',
  rates: {} as Record<string, { rate: number; timestamp: string }>,
}));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'viewer' } }, error: null }) } }),
  createServiceClientSync: () => ({
    rpc: (name: string, args: { p_context?: unknown }) => name === 'begin_import_batch'
      ? fixture.importBatches(args) : fixture.writes(args),
    from: (table: string) => {
      let source = '', sample = '', id = '';
      const account = (accountId = id) => ({ id: accountId, user_id: 'viewer', name: accountId,
        currency: accountId === 'usd-account' ? 'USD' : 'ARS', is_active: true });
      const transaction = () => ({ id: 'transaction', user_id: 'viewer', account_id: 'ars-account',
        type: fixture.type, amount: 100, currency: 'USD', amount_in_account_currency: 120000 });
      const query = {
        select: () => query, order: () => query, limit: () => query,
        or: () => query, like: () => query, range: () => query,
        gte: () => query, lte: () => query, in: () => query,
        eq: (key: string, value: string) => {
          if (key === 'source') source = value;
          if (key === 'timestamp') sample = value;
          if (key === 'id') id = value;
          return query;
        },
        insert: (row: unknown) => { fixture.writes(row); return query; },
        update: (row: unknown) => { fixture.writes(row); return query; },
        single: async () => ({ data: table === 'exchange_rates' ? fixture.rates[source] ?? null :
          table === 'accounts' ? account() : table === 'investments'
            ? { id: 'investment', user_id: 'viewer', quantity: 10, purchase_price: 100,
              purchase_currency: 'USD', type: 'stock_us' } : transaction(), error: null }),
        maybeSingle: async () => ({ data: fixture.rates[source]?.timestamp === sample ? fixture.rates[source] : null, error: null }),
        then: (resolve: (result: unknown) => unknown) => Promise.resolve({
          data: table === 'transactions' ? [transaction()] : table === 'accounts'
            ? [account('ars-account'), account('usd-account')] : [], error: null,
        }).then(resolve),
      };
      return query;
    },
  }),
}));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-25T12:00:00Z'));
  vi.stubEnv('EXCHANGE_RATE_MAX_AGE_SECONDS', '86400');
  fixture.importBatches.mockImplementation(async ({ p_context }) => ({ data: p_context, error: null }));
  fixture.type = 'expense';
  fixture.rates = {
    blue: { rate: 1300, timestamp: '2026-10-01T12:00:00Z' },
    blue_buy: { rate: 1290, timestamp: '2026-10-01T12:00:00Z' },
  };
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('fixture outage')));
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe.each([
  ['expired fallback', '2026-10-01T12:00:00Z', '86400'],
  ['10h forced-stale DB fallback', '2026-10-25T02:00:00Z', '86400'],
  ['30h fallback with 96h display override', '2026-10-24T06:00:00Z', '345600'],
])('%s cannot reach monetary writes', (_label, timestamp, displayAge) => {
  beforeEach(() => {
    for (const rate of Object.values(fixture.rates)) rate.timestamp = timestamp;
    vi.stubEnv('EXCHANGE_RATE_MAX_AGE_SECONDS', displayAge);
  });

  it.each(['expense', 'income', 'transfer'] as const)('rejects %s creation before persistence', async type => {
    const { transactionsService } = await import('@/lib/services/transactions');
    await expect(transactionsService.create({ userId: 'viewer', accountId: 'ars-account',
      destinationAccountId: type === 'transfer' ? 'usd-account' : undefined,
      type, amount: 100, currency: 'USD' })).rejects.toThrow('vencida');
    expect(fixture.writes).not.toHaveBeenCalled();
  });

  it.each(['expense', 'income', 'transfer'])('rejects %s update with a Spanish error before persistence', async type => {
    fixture.type = type;
    const { PATCH } = await import('@/app/api/transactions/[id]/route');
    const response = await PATCH(new NextRequest('http://localhost/api/transactions/transaction', {
      method: 'PATCH', body: JSON.stringify({ account_id: 'ars-account',
        destination_account_id: type === 'transfer' ? 'usd-account' : undefined,
        amount: 101, currency: 'USD' }),
    }), { params: Promise.resolve({ id: 'transaction' }) });
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: expect.stringMatching(/^Cotización .* vencida$/) });
    expect(fixture.writes).not.toHaveBeenCalled();
  });

  it('rejects account conversion recomputation before any ledger row changes', async () => {
    const { transactionsService } = await import('@/lib/services/transactions');
    await expect(transactionsService.repairCrossCurrencyInDateRange('viewer', 'ars-account',
      '2026-10-01', '2026-10-25', { force: true })).rejects.toThrow('vencida');
    expect(fixture.writes).not.toHaveBeenCalled();
  });

  it('rejects an investment sale before recording P&L or reducing the quantity', async () => {
    const { investmentsService } = await import('@/lib/services/investments');
    await expect(investmentsService.sell({ userId: 'viewer', investmentId: 'investment',
      quantity: 1, price: 130000, currency: 'ARS' })).rejects.toThrow('vencida');
    expect(fixture.writes).not.toHaveBeenCalled();
  });

  it.each(['expense', 'income'])('leaves an imported %s pending without a monetary write', async type => {
    const { POST } = await import('@/app/api/import/transactions/route');
    const body = new FormData();
    body.set('file', new File([JSON.stringify([{ type, date: '2026-10-25', amount: 100,
      currency: 'USD', account: 'ars-account',
    }])], 'fixture.json'));
    body.set('batchId', '11111111-1111-4111-8111-111111111111');
    body.set('ownerId', 'viewer');
    const response = await POST(new NextRequest('http://localhost/api/import/transactions', { method: 'POST', body }));
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ imported: 0, pending: 1, skipped: 0 });
    expect(fixture.writes).not.toHaveBeenCalled();
  });
});

describe('executable FX boundaries', () => {

  it('allows an explicit manual transfer rate without requesting unavailable live FX', async () => {
    const { computeTransferAmounts } = await import('@/lib/services/transactions');
    expect(await computeTransferAmounts(100, 'USD', 'USD', 'ARS', 1400)).toEqual({
      amountInSource: 100, amountInDestination: 140000, exchangeRate: 1400,
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('rejects stale rates of every type, independently of display age overrides', async () => {
    const { isExecutableDolarQuote } = await import('@/lib/executable-fx');
    vi.stubEnv('EXCHANGE_RATE_MAX_AGE_SECONDS', '345600');
    vi.stubEnv('EXCHANGE_RATE_MARKET_MAX_AGE_SECONDS', '345600');
    for (const type of ['blue', 'mep', 'oficial', 'ccl'] as const) {
      const quote = { type, buy: 1290, sell: 1300, timestamp: new Date(), stale: false };
      expect(isExecutableDolarQuote(quote)).toBe(true);
      expect(isExecutableDolarQuote({ ...quote, stale: true })).toBe(false);
      expect(isExecutableDolarQuote({ ...quote, timestamp: new Date(Date.now() - 30 * 60 * 60 * 1000) })).toBe(false);
    }
  });
});
