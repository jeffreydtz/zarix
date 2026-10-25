import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { resetCafciCatalogCacheForTest } from '@/lib/market-data/cafci-client';

const mocks = vi.hoisted(() => ({
  arg: vi.fn(),
  dolar: vi.fn(),
  yahoo: vi.fn(),
  stooq: vi.fn(),
  crypto: vi.fn(),
  getUser: vi.fn(),
  from: vi.fn(),
  update: vi.fn(),
  alert: vi.fn(),
  investments: [] as Array<Record<string, unknown>>,
  updates: [] as Array<Record<string, unknown>>,
}));

vi.mock('@/lib/market-data/data912-client', () => ({ loadArgentineQuotes: mocks.arg }));
vi.mock('@/lib/services/cotizaciones', () => ({
  cotizacionesService: { getDolarQuotes: mocks.dolar, getCryptoQuote: mocks.crypto },
}));
vi.mock('@/lib/yahoo-finance-quotes', () => ({ fetchYahooStockQuotesMap: mocks.yahoo }));
vi.mock('@/lib/stooq-us-quote', () => ({ fetchStooqUsQuote: mocks.stooq }));
vi.mock('@/lib/observability/alert', () => ({ alertAdmin: mocks.alert }));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: mocks.getUser } }),
  createServiceClientSync: () => ({ from: mocks.from }),
}));

import { GET as quoteGet } from '@/app/api/investments/quote/route';
import { GET as cronGet } from '@/app/api/cron/update-prices/route';

const MEP = 1300;

function stubCafci(moneda: string) {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const href = String(url);
    if (href.includes('/ficha')) {
      return {
        ok: true,
        json: async () => ({ data: { valorCuotaparte: 1.098, moneda, fecha: '2026-10-23' } }),
      };
    }
    return {
      ok: true,
      json: async () => ({
        data: [{
          id: 1,
          nombre: 'IOL Dolar',
          clases: [{ id: 2, simbolo: 'IOLDOLD' }],
        }],
      }),
    };
  }));
}

const cronRequest = () => new NextRequest('http://localhost/api/cron/update-prices', {
  headers: { authorization: 'Bearer synthetic-cron-secret' },
});

const quoteRequest = () =>
  new NextRequest('http://localhost/api/investments/quote?symbol=IOLDOLD&type=fci&currency=USD');

beforeEach(() => {
  vi.clearAllMocks();
  mocks.updates = [];
  resetCafciCatalogCacheForTest();
  vi.stubEnv('CRON_SECRET', 'synthetic-cron-secret');
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  mocks.getUser.mockResolvedValue({ data: { user: { id: 'fixture-user' } } });
  mocks.dolar.mockResolvedValue({ blue: { sell: MEP, buy: MEP }, mep: { sell: MEP, buy: MEP } });
  mocks.yahoo.mockResolvedValue(new Map());
  mocks.stooq.mockResolvedValue(null);
  mocks.crypto.mockResolvedValue({ priceUSD: 0 });
  mocks.alert.mockResolvedValue(undefined);
  mocks.arg.mockResolvedValue({
    byStock: new Map(), byCedear: new Map(), byBond: new Map(), byCorp: new Map(),
  });
  mocks.investments = [{
    id: 'fixture-fci-ioldold',
    type: 'fci',
    ticker: 'IOLDOLD',
    market_currency: 'USD',
    purchase_currency: 'USD',
    current_price: 1.09,
    is_manual_price: false,
  }];
  mocks.update.mockImplementation((payload: Record<string, unknown>) => {
    mocks.updates.push(payload);
    return { eq: vi.fn().mockResolvedValue({ error: null }) };
  });
  mocks.from.mockImplementation((table: string) => {
    if (table === 'exchange_rates') {
      return { upsert: vi.fn().mockResolvedValue({ error: null }) };
    }
    const query = {
      select: () => query,
      eq: () => query,
      in: async () => ({ data: mocks.investments, error: null }),
      update: mocks.update,
    };
    return query;
  });
});

afterEach(() => {
  resetCafciCatalogCacheForTest();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe.each(['Dólar MEP', 'Dólar Cable', 'Dólares CCL'] as const)('IOLDOLD CAFCI %s → 1.098 USD', (moneda) => {
  it('interactive quote path', async () => {
    stubCafci(moneda);
    const response = await quoteGet(quoteRequest());
    const body = await response.json();
    expect(body).toMatchObject({ ok: true, symbol: 'IOLDOLD', currency: 'USD' });
    expect(body.price).toBeCloseTo(1.098, 8);
  });

  it('cron update-prices path', async () => {
    stubCafci(moneda);
    const response = await cronGet(cronRequest());
    expect(await response.json()).toMatchObject({ success: true, processed: 1, errors: 0 });
    expect(mocks.updates).toHaveLength(1);
    expect(mocks.updates[0].market_currency).toBe('USD');
    expect(mocks.updates[0].current_price).toBeCloseTo(1.098, 8);
  });
});
