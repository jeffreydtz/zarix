import { FxUnavailableError } from '@/lib/executable-fx';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  from: vi.fn(), rpc: vi.fn(), dolar: vi.fn(), exchange: vi.fn(),
  rows: [] as Array<Record<string, unknown>>, dbError: null as Error | null,
}));
vi.mock('@/lib/supabase/server', () => ({ createServiceClientSync: () => ({ from: mocks.from, rpc: mocks.rpc }) }));
vi.mock('@/lib/services/cotizaciones', () => ({ cotizacionesService: {
  getDolarQuotes: mocks.dolar, getExchangeRate: mocks.exchange,
} }));
import { accountsService } from '@/lib/services/accounts';

const account = (id: string, currency: string, balance: number) => ({
  id, name: `Cuenta ${id}`, user_id: 'fixture-user', type: 'bank', currency, balance,
  include_in_total: true, include_in_liquid: true, is_multicurrency: false,
});

beforeEach(() => {
  vi.resetAllMocks();
  mocks.dbError = null;
  mocks.rows = [];
  mocks.dolar.mockResolvedValue({ status: 'available', missing: [], blue: {
    type: 'blue', buy: 1290, sell: 1300, timestamp: new Date('2026-10-25T12:00:00Z'),
    stale: false, asOf: new Date('2026-10-25T12:00:00Z'),
  } });
  mocks.exchange.mockRejectedValue(new FxUnavailableError('EUR/USD'));
  mocks.rpc.mockResolvedValue({ data: [{ account_id: 'card', primary_balance: -13000, secondary_balance: -200 }], error: null });
  mocks.from.mockImplementation(() => {
    const query = {
      select: () => query, eq: () => query, neq: () => query,
      order: async () => ({ data: mocks.rows, error: mocks.dbError }),
    };
    return query;
  });
});

describe('account valuation failures remain isolated from native balances', () => {
  it('keeps ARS/USD valuations when only EUR is unavailable and no MEP exists', async () => {
    mocks.rows = [account('ars', 'ARS', 130000), account('usd', 'USD', 50), account('eur', 'EUR', 75)];
    const rows = await accountsService.list('fixture-user');
    expect(rows[0]).toMatchObject({ balance: 130000, balance_usd: 100, balance_ars_blue: 130000, fxUnavailable: false });
    expect(rows[1]).toMatchObject({ balance: 50, balance_usd: 50, balance_ars_blue: 65000, fxUnavailable: false });
    expect(rows[2]).toMatchObject({ balance: 75, currency: 'EUR', balance_usd: null, balance_ars_blue: null, fxUnavailable: true });
    expect(mocks.dolar).toHaveBeenCalledWith({ require: ['blue'] });
  });

  it('preserves both native card balances during a typed FX outage', async () => {
    mocks.rows = [{ ...account('card', 'ARS', -13200), type: 'credit_card', is_multicurrency: true, secondary_currency: 'USD' }];
    mocks.dolar.mockRejectedValue(new FxUnavailableError('blue'));
    const rows = await accountsService.list('fixture-user');
    expect(rows[0]).toMatchObject({
      balance: -13200, currency: 'ARS', secondary_currency: 'USD',
      multicurrency_balance_primary: -13000, multicurrency_balance_secondary: -200,
      multicurrency_total_usd: null, multicurrency_total_ars_blue: null, fxUnavailable: true,
    });
    expect(await accountsService.getTotalBalance('fixture-user')).toMatchObject({ totalUSD: null, totalARSBlue: null, fxUnavailable: true });
  });

  it('propagates account query errors before attempting FX', async () => {
    mocks.dbError = new Error('Fixture account DB failure');
    await expect(accountsService.list('fixture-user')).rejects.toBe(mocks.dbError);
    expect(mocks.dolar).not.toHaveBeenCalled();
  });

  it.each(['dolar', 'exchange'] as const)('rethrows non-FX %s failures instead of returning unavailable balances', async source => {
    mocks.rows = [account('eur', 'EUR', 75)];
    const failure = Object.assign(new Error('Fixture permission failure'), { code: '42501' });
    mocks[source].mockRejectedValue(failure);
    await expect(accountsService.list('fixture-user')).rejects.toBe(failure);
  });

  it('preserves framework redirects from FX dependencies', async () => {
    mocks.rows = [account('ars', 'ARS', 130000)];
    const redirect = Object.assign(new Error('Fixture redirect'), { digest: 'NEXT_REDIRECT;replace;/login;307;' });
    mocks.dolar.mockRejectedValue(redirect);
    await expect(accountsService.list('fixture-user')).rejects.toBe(redirect);
  });

  it('propagates multicurrency DB errors rather than inventing missing native balances', async () => {
    mocks.rows = [{ ...account('card', 'ARS', -13200), type: 'credit_card', is_multicurrency: true, secondary_currency: 'USD' }];
    const failure = new Error('Fixture multicurrency DB failure');
    mocks.rpc.mockResolvedValue({ data: null, error: failure });
    await expect(accountsService.list('fixture-user')).rejects.toBe(failure);
  });
});
