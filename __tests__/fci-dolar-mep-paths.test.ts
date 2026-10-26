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
const CAFCI_PRICE = 1.098;
const TICKERS = ['IOLDOLD', 'ADCGLOA'] as const;
const USD_LABELS = [
  'Dolar EEUU',
  'Dólar billete',
  'US Dollar',
  'U.S. Dollar',
  'Dólar USA',
  'Dólar MEP',
  'Dólares CCL',
  'Dólares estadounidenses MEP',
  'USD Billete',
  'USD billetes',
  'U$S MEP',
  'Dólar',
  'Dólares',
  'Dollar',
  'USD',
  'Dólar Cable',
  'Dólar Estadounidense',
  'U$S',
  'ＵＳＤ',
  'US',
  'US$',
] as const;
const ARS_LABELS = [
  'Pesos',
  'Peso Argentino',
  'Pesos Argentinos',
  'Peso Argentina',
  'PESOS ARGENTINA',
  'Peso Argentina / ARS',
  'ARS',
  'ARS - Moneda local',
  'Peso',
] as const;
const SKIP_LABELS = [
  'Dolar fiyiano',
  'New Zealand Dollar',
  'NZ Dollar',
  'Dólar liberiano',
  'Pesos/Dólares',
  'Canadian Dollar',
  'Peso mexicano',
  'Sol peruano',
  'HKD',
  'EUR',
  'Dólar ＣＡＮＡＤＩＥＮＳＥ',
  'Dólar канадский',
  'Peso ＭＥＸＩＣＡＮＯ',
  'US Peso',
] as const;

function stubCafci(moneda: string) {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const href = String(url);
    if (href.includes('/ficha') || /\/fondos\/\d+/.test(href)) {
      const payload = { data: { valorCuotaparte: CAFCI_PRICE, moneda, fecha: '2026-10-23' } };
      return {
        ok: true,
        json: async () => payload,
        text: async (): Promise<string> => JSON.stringify(payload),
      };
    }
    return {
      ok: true,
      json: async () => ({
        data: [
          { id: 1, nombre: 'IOL Dolar', clases: [{ id: 2, simbolo: 'IOLDOLD' }] },
          { id: 3, nombre: 'ADC Global', clases: [{ id: 4, simbolo: 'ADCGLOA' }] },
        ],
      }),
    };
  }));
}

const cronRequest = () => new NextRequest('http://localhost/api/cron/update-prices', {
  headers: { authorization: 'Bearer synthetic-cron-secret' },
});

const quoteRequest = (ticker: string, currency: string) =>
  new NextRequest(`http://localhost/api/investments/quote?symbol=${ticker}&type=fci&currency=${currency}`);

function setCronPosition(ticker: string, currency: string) {
  mocks.investments = [{
    id: `fixture-fci-${ticker.toLowerCase()}`,
    type: 'fci',
    ticker,
    market_currency: currency,
    purchase_currency: currency,
    current_price: currency === 'USD' ? 1.09 : CAFCI_PRICE,
    is_manual_price: false,
  }];
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.updates = [];
  resetCafciCatalogCacheForTest();
  vi.stubEnv('CRON_SECRET', 'synthetic-cron-secret');
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  mocks.getUser.mockResolvedValue({ data: { user: { id: 'fixture-user' } } });
  mocks.dolar.mockResolvedValue({ blue: { timestamp: new Date(), sell: MEP, buy: MEP  }, mep: { timestamp: new Date(), sell: MEP, buy: MEP  } });
  mocks.yahoo.mockResolvedValue(new Map());
  mocks.stooq.mockResolvedValue(null);
  mocks.crypto.mockResolvedValue({ priceUSD: 0 });
  mocks.alert.mockResolvedValue(undefined);
  mocks.arg.mockResolvedValue({
    byStock: new Map(), byCedear: new Map(), byBond: new Map(), byCorp: new Map(),
  });
  setCronPosition('IOLDOLD', 'USD');
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

describe.each(USD_LABELS)('CAFCI USD label %s', (moneda) => {
  it.each(TICKERS)('interactive %s USD book keeps 1.098 USD', async (ticker) => {
    stubCafci(moneda);
    const body = await (await quoteGet(quoteRequest(ticker, 'USD'))).json();
    expect(body).toMatchObject({ ok: true, symbol: ticker, currency: 'USD' });
    expect(body.price).toBeCloseTo(CAFCI_PRICE, 8);
  });

  it.each(TICKERS)('interactive %s ARS book converts via MEP', async (ticker) => {
    stubCafci(moneda);
    const body = await (await quoteGet(quoteRequest(ticker, 'ARS'))).json();
    expect(body).toMatchObject({ ok: true, symbol: ticker, currency: 'ARS' });
    expect(body.price).toBeCloseTo(CAFCI_PRICE * MEP, 8);
  });

  it.each(TICKERS)('cron %s USD book keeps 1.098 USD', async (ticker) => {
    setCronPosition(ticker, 'USD');
    stubCafci(moneda);
    expect(await (await cronGet(cronRequest())).json()).toMatchObject({ success: true, processed: 1, errors: 0 });
    expect(mocks.updates).toHaveLength(1);
    expect(mocks.updates[0].market_currency).toBe('USD');
    expect(mocks.updates[0].current_price).toBeCloseTo(CAFCI_PRICE, 8);
  });

  it.each(TICKERS)('cron %s skips converted ARS price outside the position anchor band', async (ticker) => {
    setCronPosition(ticker, 'ARS');
    stubCafci(moneda);
    // The old fixture anchor is 1.098 ARS; 1427.4 ARS is now correctly rejected.
    expect(await (await cronGet(cronRequest())).json()).toMatchObject({ success: true, processed: 0, errors: 1 });
    expect(mocks.updates).toHaveLength(0);
  });
});

describe.each(ARS_LABELS)('CAFCI ARS label %s', (moneda) => {
  it.each(TICKERS)('interactive %s ARS book keeps the peso cuotaparte', async (ticker) => {
    stubCafci(moneda);
    const body = await (await quoteGet(quoteRequest(ticker, 'ARS'))).json();
    expect(body).toMatchObject({ ok: true, symbol: ticker, currency: 'ARS' });
    expect(body.price).toBeCloseTo(CAFCI_PRICE, 8);
  });

  it.each(TICKERS)('interactive %s USD book converts via MEP', async (ticker) => {
    stubCafci(moneda);
    const body = await (await quoteGet(quoteRequest(ticker, 'USD'))).json();
    expect(body).toMatchObject({ ok: true, symbol: ticker, currency: 'USD' });
    expect(body.price).toBeCloseTo(CAFCI_PRICE / MEP, 8);
  });

  it.each(TICKERS)('cron %s ARS book keeps the peso cuotaparte', async (ticker) => {
    setCronPosition(ticker, 'ARS');
    stubCafci(moneda);
    expect(await (await cronGet(cronRequest())).json()).toMatchObject({ success: true, processed: 1, errors: 0 });
    expect(mocks.updates).toHaveLength(1);
    expect(mocks.updates[0].market_currency).toBe('ARS');
    expect(mocks.updates[0].current_price).toBeCloseTo(CAFCI_PRICE, 8);
  });

  it.each(TICKERS)('cron %s skips converted USD price outside the position anchor band', async (ticker) => {
    setCronPosition(ticker, 'USD');
    stubCafci(moneda);
    // The old fixture anchor is 1.09 USD; 0.0008446 USD is now rejected.
    expect(await (await cronGet(cronRequest())).json()).toMatchObject({ success: true, processed: 0, errors: 1 });
    expect(mocks.updates).toHaveLength(0);
  });
});

describe.each(SKIP_LABELS)('CAFCI skip label %s never writes', (moneda) => {
  it.each(TICKERS)('interactive %s USD book', async (ticker) => {
    stubCafci(moneda);
    expect(await (await quoteGet(quoteRequest(ticker, 'USD'))).json()).toMatchObject({ ok: false });
  });

  it.each(TICKERS)('interactive %s ARS book', async (ticker) => {
    stubCafci(moneda);
    expect(await (await quoteGet(quoteRequest(ticker, 'ARS'))).json()).toMatchObject({ ok: false });
  });

  it.each(TICKERS)('cron %s USD book', async (ticker) => {
    setCronPosition(ticker, 'USD');
    stubCafci(moneda);
    const body = await (await cronGet(cronRequest())).json();
    expect(body.processed).toBe(0);
    expect(mocks.updates).toHaveLength(0);
  });

  it.each(TICKERS)('cron %s ARS book', async (ticker) => {
    setCronPosition(ticker, 'ARS');
    stubCafci(moneda);
    const body = await (await cronGet(cronRequest())).json();
    expect(body.processed).toBe(0);
    expect(mocks.updates).toHaveLength(0);
  });
});
