import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  investments: [] as Array<Record<string, unknown>>,
  from: vi.fn(),
  update: vi.fn(),
  upsert: vi.fn(),
  crypto: vi.fn(),
  stock: vi.fn(),
  dolar: vi.fn(),
  alert: vi.fn(),
}));
vi.mock('@/lib/supabase/server', () => ({ createServiceClientSync: () => ({ from: mocks.from }) }));
vi.mock('@/lib/observability/alert', () => ({ alertAdmin: mocks.alert }));
vi.mock('@/lib/services/cotizaciones', () => ({ cotizacionesService: {
  getCryptoQuote: mocks.crypto, getStockQuote: mocks.stock, getDolarQuotes: mocks.dolar,
} }));
vi.mock('@/lib/market-data/quote-refresh', () => {
  const quoteCacheKeyForPosition = (inv: {
    type: string; ticker: string | null; market_currency?: string | null;
  }) => {
    if (!inv.ticker) return null;
    const ticker = inv.ticker.trim().toUpperCase();
    const ccy = inv.type === 'crypto'
      ? 'USD'
      : (inv.market_currency || '').trim().toUpperCase() || 'NATIVE';
    return `${inv.type}:${ticker}:${ccy}`;
  };
  return {
    quoteCacheKeyForPosition,
    refreshQuotesForInvestments: async (investments: Array<{
      type: string; ticker: string | null; market_currency?: string | null;
    }>) => {
      const map = new Map<string, { price: number; changePct: number | null; currency: string; timestamp: string | null; fxStale?: boolean }>();
      for (const inv of investments) {
        const key = quoteCacheKeyForPosition(inv);
        if (!key) continue;
        const ticker = inv.ticker!.toUpperCase();
        if (inv.type === 'crypto') {
          const quote = await mocks.crypto(ticker);
          const price = Number(quote?.priceUSD);
          if (Number.isFinite(price) && price > 0) {
            map.set(key, { price, changePct: null, currency: 'USD', timestamp: null, fxStale: quote.fxStale });
          }
        } else {
          const quote = await mocks.stock(ticker);
          const price = Number(quote?.price);
          if (Number.isFinite(price) && price > 0) {
            map.set(key, { price, changePct: null, currency: 'USD', timestamp: null, fxStale: quote.fxStale });
          }
        }
      }
      return map;
    },
  };
});
import { GET } from '@/app/api/cron/update-prices/route';

const request = () => new NextRequest('http://localhost/api/cron/update-prices', {
  headers: { authorization: 'Bearer synthetic-cron-secret' },
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('CRON_SECRET', 'synthetic-cron-secret');
  vi.spyOn(console, 'error').mockImplementation(() => {});
  mocks.investments = [{ id: 'investment-1', type: 'crypto', ticker: 'BTC', purchase_currency: 'USD' }];
  mocks.crypto.mockResolvedValue({ priceUSD: 100 });
  mocks.stock.mockResolvedValue({ price: 100 });
  mocks.dolar.mockResolvedValue({ blue: { timestamp: new Date(), buy: 1200, sell: 1200  }, mep: { timestamp: new Date(), buy: 1200, sell: 1200  } });
  mocks.alert.mockResolvedValue(undefined);
  mocks.upsert.mockResolvedValue({ error: null });
  mocks.update.mockImplementation(() => ({ eq: vi.fn().mockResolvedValue({ error: null }) }));
  mocks.from.mockImplementation((table: string) => {
    if (table === 'exchange_rates') return { upsert: mocks.upsert };
    const query = {
      select: () => query,
      eq: () => query,
      in: async () => ({ data: mocks.investments, error: null }),
      update: mocks.update,
    };
    return query;
  });
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe('quote cron provider failure reporting', () => {
  it.each(['crypto', 'stock_us', 'stock_arg', 'cedear'])('counts %s fetch failures and alerts admin', async (type) => {
    mocks.investments[0].type = type;
    mocks.crypto.mockRejectedValue(new Error('synthetic provider outage'));
    mocks.stock.mockRejectedValue(new Error('synthetic provider outage'));
    const response = await GET(request());
    expect(await response.json()).toMatchObject({ total: 1, processed: 0, errors: 1 });
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.alert).toHaveBeenCalledWith('Cron "update-prices" terminó con 1 ítem(es) fallido(s).');
  });

  it('reports an FX failure even if an investment price updates', async () => {
    mocks.dolar.mockRejectedValue(new Error('synthetic FX outage'));
    const response = await GET(request());
    expect(await response.json()).toMatchObject({ total: 1, processed: 1, errors: 1 });
    expect(mocks.alert).toHaveBeenCalledOnce();
  });

  it.each(['crypto', 'stock_us'])('rejects a %s quote flagged fxStale at the write boundary', async (type) => {
    mocks.investments[0].type = type;
    mocks.crypto.mockResolvedValue({ priceUSD: 100, fxStale: true });
    mocks.stock.mockResolvedValue({ price: 100, fxStale: true });
    const response = await GET(request());
    expect(await response.json()).toMatchObject({ total: 1, processed: 0, errors: 1 });
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it.each([0, -1, NaN, Infinity])('counts invalid crypto price %s without overwriting the investment', async (priceUSD) => {
    mocks.crypto.mockResolvedValue({ priceUSD });
    const response = await GET(request());
    expect(await response.json()).toMatchObject({ total: 1, processed: 0, errors: 1 });
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.alert).toHaveBeenCalledOnce();
  });

  it('counts an invalid MEP quote as a provider failure without blocking native refresh', async () => {
    mocks.dolar.mockResolvedValue({ blue: { timestamp: new Date(), buy: 1200, sell: 1200  }, mep: { timestamp: new Date(), sell: 0  } });
    const response = await GET(request());
    expect(await response.json()).toMatchObject({ processed: 1, errors: 1 });
    expect(mocks.alert).toHaveBeenCalledOnce();
  });

  it('reports exchange-rate persistence errors returned by Supabase', async () => {
    mocks.upsert.mockResolvedValue({ error: new Error('synthetic database failure') });
    const response = await GET(request());
    expect(await response.json()).toMatchObject({ total: 1, processed: 1, errors: 1 });
    expect(mocks.alert).toHaveBeenCalledOnce();
  });

  it('adds provider failures to individual investment update failures', async () => {
    mocks.dolar.mockRejectedValue(new Error('synthetic FX outage'));
    mocks.update.mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: new Error('synthetic write failure') }) });
    const response = await GET(request());
    expect(await response.json()).toMatchObject({ total: 1, processed: 0, errors: 2 });
  });

  it('does not carry failure counts across invocations', async () => {
    mocks.crypto.mockRejectedValueOnce(new Error('temporary synthetic outage'));
    expect(await (await GET(request())).json()).toMatchObject({ errors: 1 });
    mocks.alert.mockClear();
    expect(await (await GET(request())).json()).toMatchObject({ processed: 1, errors: 0 });
    expect(mocks.alert).not.toHaveBeenCalled();
  });
});

describe('FX refresh is independent of investment count', () => {
  it('refreshes FX even when no investments need quotes', async () => {
    mocks.investments = [];
    expect(await (await GET(request())).json()).toMatchObject({ total: 0, processed: 0, errors: 0 });
    expect(mocks.dolar).toHaveBeenCalledOnce();
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
  it('alerts on FX outage even when there are no investments', async () => {
    mocks.investments = []; mocks.dolar.mockRejectedValue(new Error('synthetic outage'));
    expect(await (await GET(request())).json()).toMatchObject({ total: 0, errors: 1 });
    expect(mocks.alert).toHaveBeenCalledOnce();
  });
});
