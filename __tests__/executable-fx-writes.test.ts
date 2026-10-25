import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const fixture = vi.hoisted(() => ({
  writes: vi.fn(),
  type: 'expense',
  rates: {} as Record<string, { rate: number; timestamp: string }>,
}));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'viewer' } }, error: null }) } }),
  createServiceClientSync: () => ({
    rpc: fixture.writes,
    from: (table: string) => {
      let source = '', sample = '', id = '';
      const account = () => ({ id, user_id: 'viewer', currency: id === 'usd-account' ? 'USD' : 'ARS', is_active: true });
      const transaction = () => ({ id: 'transaction', user_id: 'viewer', account_id: 'ars-account',
        type: fixture.type, amount: 100, currency: 'USD', amount_in_account_currency: 120000 });
      const query = {
        select: () => query, order: () => query, limit: () => query,
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
          table === 'accounts' ? account() : transaction(), error: null }),
        maybeSingle: async () => ({ data: fixture.rates[source]?.timestamp === sample ? fixture.rates[source] : null, error: null }),
        then: (resolve: (result: unknown) => unknown) => Promise.resolve({
          data: table === 'transactions' ? [transaction()] : [], error: null,
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

describe('expired display FX cannot reach monetary writes', () => {
  it.each(['expense', 'income', 'transfer'] as const)('rejects %s creation before persistence', async type => {
    const { transactionsService } = await import('@/lib/services/transactions');
    await expect(transactionsService.create({ userId: 'viewer', accountId: 'ars-account',
      destinationAccountId: type === 'transfer' ? 'usd-account' : undefined,
      type, amount: 100, currency: 'USD' })).rejects.toThrow('vencida');
    expect(fixture.writes).not.toHaveBeenCalled();
  });

  it.each(['expense', 'transfer'])('rejects %s update with a Spanish error before persistence', async type => {
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

  it('allows an explicit manual transfer rate without requesting unavailable live FX', async () => {
    const { computeTransferAmounts } = await import('@/lib/services/transactions');
    expect(await computeTransferAmounts(100, 'USD', 'USD', 'ARS', 1400)).toEqual({
      amountInSource: 100, amountInDestination: 140000, exchangeRate: 1400,
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('uses each executable rate age limit, including the strict 24h MEP limit', async () => {
    const { isExecutableDolarQuote } = await import('@/lib/executable-fx');
    const quote = { buy: 1290, sell: 1300, timestamp: new Date(Date.now() - 30 * 60 * 60 * 1000), stale: true };
    expect(isExecutableDolarQuote({ ...quote, type: 'blue' })).toBe(false);
    expect(isExecutableDolarQuote({ ...quote, type: 'mep' })).toBe(false);
    expect(isExecutableDolarQuote({ ...quote, type: 'oficial' })).toBe(true);
    expect(isExecutableDolarQuote({ ...quote, type: 'ccl' })).toBe(true);
    vi.stubEnv('EXCHANGE_RATE_MARKET_MAX_AGE_SECONDS', '3600');
    expect(isExecutableDolarQuote({ ...quote, type: 'oficial' })).toBe(false);
    expect(isExecutableDolarQuote({ ...quote, type: 'ccl' })).toBe(false);
  });
});
