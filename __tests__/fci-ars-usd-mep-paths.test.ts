import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * Cron (`app/api/cron/update-prices`) and interactive (`app/api/investments/quote`)
 * share `refreshQuotesForInvestments` / `adaptQuoteToMarketCurrency`.
 * Only display previews permit stale MEP, retaining its FX metadata.
 */

const mocks = vi.hoisted(() => ({
  arg: vi.fn(),
  dolar: vi.fn(),
  yahoo: vi.fn(),
  stooq: vi.fn(),
  fci: vi.fn(),
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
vi.mock('@/lib/market-data/cafci-client', () => ({ fetchFciQuote: mocks.fci }));
vi.mock('@/lib/observability/alert', () => ({ alertAdmin: mocks.alert }));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: mocks.getUser } }),
  createServiceClientSync: () => ({ from: mocks.from }),
}));

import { GET as quoteGet } from '@/app/api/investments/quote/route';
import { GET as cronGet } from '@/app/api/cron/update-prices/route';

const MEP = 1300;
const CONIOLA_ARS = 179.598;

const cronRequest = () => new NextRequest('http://localhost/api/cron/update-prices', {
  headers: { authorization: 'Bearer synthetic-cron-secret' },
});

const quoteRequest = (
  symbol: string,
  currency: string,
  extras?: { purchasePrice?: string; purchaseCurrency?: string },
) => {
  const url = new URL('http://localhost/api/investments/quote');
  url.searchParams.set('symbol', symbol);
  url.searchParams.set('type', 'fci');
  url.searchParams.set('currency', currency);
  if (extras?.purchasePrice) url.searchParams.set('purchasePrice', extras.purchasePrice);
  if (extras?.purchaseCurrency) url.searchParams.set('purchaseCurrency', extras.purchaseCurrency);
  return new NextRequest(url);
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.updates = [];
  vi.stubEnv('CRON_SECRET', 'synthetic-cron-secret');
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  mocks.getUser.mockResolvedValue({ data: { user: { id: 'fixture-user' } } });
  mocks.dolar.mockResolvedValue({ blue: { timestamp: new Date(), sell: MEP, buy: MEP  }, mep: { timestamp: new Date(), sell: MEP, buy: MEP  } });
  mocks.yahoo.mockResolvedValue(new Map());
  mocks.stooq.mockResolvedValue(null);
  mocks.fci.mockResolvedValue(null);
  mocks.crypto.mockResolvedValue({ priceUSD: 0 });
  mocks.alert.mockResolvedValue(undefined);
  mocks.arg.mockResolvedValue({
    byStock: new Map(), byCedear: new Map(), byBond: new Map(), byCorp: new Map(),
  });
  mocks.investments = [{
    id: 'fixture-fci-coniola',
    type: 'fci',
    ticker: 'CONIOLA',
    market_currency: 'USD',
    purchase_currency: 'USD',
    purchase_price: 0.14,
    is_manual_price: false,
  }];
  mocks.update.mockImplementation((payload: Record<string, unknown>) => ({
    eq: vi.fn((_col: string, id: string) => {
      mocks.updates.push({ ...payload, id });
      return Promise.resolve({ error: null });
    }),
  }));
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
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('interactive quote refresh (GET /api/investments/quote)', () => {
  it('returns CONIOLA as USD via MEP instead of writing the peso cuotaparte', async () => {
    mocks.fci.mockResolvedValue({
      ticker: 'CONIOLA',
      price: CONIOLA_ARS,
      currency: 'ARS',
      changePct: null,
      timestamp: '2026-10-23T00:00:00.000Z',
      source: 'cafci',
    });
    const response = await quoteGet(quoteRequest('CONIOLA', 'USD'));
    const body = await response.json();
    expect(body).toMatchObject({ ok: true, symbol: 'CONIOLA', currency: 'USD' });
    expect(body.price).toBeCloseTo(CONIOLA_ARS / MEP, 8);
    expect(body.price).not.toBeCloseTo(CONIOLA_ARS, 5);
  });

  it('keeps the stored quote when CAFCI omits moneda and the quote path has no last USD price', async () => {
    mocks.fci.mockResolvedValue({
      ticker: 'CONIOLA', price: CONIOLA_ARS, currency: null, changePct: null, timestamp: null, source: 'cafci',
    });
    const response = await quoteGet(quoteRequest('CONIOLA', 'USD'));
    expect(await response.json()).toMatchObject({ ok: false });
  });

  it('skips unlabeled IOLDOLD on the interactive path when there is no stored price', async () => {
    mocks.fci.mockResolvedValue({
      ticker: 'IOLDOLD', price: 1.098, currency: null, changePct: null, timestamp: null, source: 'cafci',
    });
    const response = await quoteGet(quoteRequest('IOLDOLD', 'USD'));
    expect(await response.json()).toMatchObject({ ok: false });
  });

  it('prices a new IOLDOLD from purchasePrice 1.00 USD when current_price is absent', async () => {
    mocks.fci.mockResolvedValue({
      ticker: 'IOLDOLD', price: 1.098, currency: null, changePct: null, timestamp: null, source: 'cafci',
    });
    const response = await quoteGet(quoteRequest('IOLDOLD', 'USD', {
      purchasePrice: '1', purchaseCurrency: 'USD',
    }));
    const body = await response.json();
    expect(body).toMatchObject({ ok: true, symbol: 'IOLDOLD', currency: 'USD' });
    expect(body.price).toBeCloseTo(1.098, 8);
  });

  it('skips unlabeled CONIOLA 179.598 vs purchasePrice 0.14 on the interactive path', async () => {
    mocks.fci.mockResolvedValue({
      ticker: 'CONIOLA', price: CONIOLA_ARS, currency: null, changePct: null, timestamp: null, source: 'cafci',
    });
    const response = await quoteGet(quoteRequest('CONIOLA', 'USD', {
      purchasePrice: '0.14', purchaseCurrency: 'USD',
    }));
    expect(await response.json()).toMatchObject({ ok: false });
  });

  it('returns IOLDOLD 1.098 USD on the interactive path when CAFCI names USD', async () => {
    mocks.fci.mockResolvedValue({
      ticker: 'IOLDOLD', price: 1.098, currency: 'USD', changePct: null, timestamp: null, source: 'cafci',
    });
    const response = await quoteGet(quoteRequest('IOLDOLD', 'USD'));
    const body = await response.json();
    expect(body).toMatchObject({ ok: true, symbol: 'IOLDOLD', currency: 'USD' });
    expect(body.price).toBeCloseTo(1.098, 8);
  });

  it('keeps the stored quote when MEP is unavailable for an ARS FCI booked in USD', async () => {
    mocks.dolar.mockResolvedValue({ blue: { timestamp: new Date(), sell: MEP, buy: MEP  } });
    mocks.fci.mockResolvedValue({
      ticker: 'CONIOLA', price: CONIOLA_ARS, currency: 'ARS', changePct: null, timestamp: null, source: 'cafci',
    });
    const response = await quoteGet(quoteRequest('CONIOLA', 'USD'));
    expect(await response.json()).toMatchObject({ ok: false });
  });
});

describe('cron quote refresh (GET /api/cron/update-prices)', () => {
  it('writes CONIOLA USD via MEP instead of the peso cuotaparte', async () => {
    mocks.fci.mockResolvedValue({
      ticker: 'CONIOLA',
      price: CONIOLA_ARS,
      currency: 'ARS',
      changePct: null,
      timestamp: '2026-10-23T00:00:00.000Z',
      source: 'cafci',
    });
    const response = await cronGet(cronRequest());
    expect(await response.json()).toMatchObject({ success: true, processed: 1, errors: 0 });
    expect(mocks.updates).toHaveLength(1);
    expect(mocks.updates[0].market_currency).toBe('USD');
    expect(mocks.updates[0].current_price).toBeCloseTo(CONIOLA_ARS / MEP, 8);
    expect(mocks.updates[0].current_price).not.toBeCloseTo(CONIOLA_ARS, 5);
    expect(mocks.updates[0].current_price_updated_at).toBe('2026-10-23T00:00:00.000Z');
  });

  it('does not overwrite CONIOLA when CAFCI omits moneda and the peso cuotaparte fails the USD ratio guard', async () => {
    mocks.investments[0].current_price = 0.138;
    mocks.fci.mockResolvedValue({
      ticker: 'CONIOLA', price: CONIOLA_ARS, currency: null, changePct: null, timestamp: null, source: 'cafci',
    });
    const response = await cronGet(cronRequest());
    const body = await response.json();
    expect(body.processed).toBe(0);
    expect(mocks.updates).toHaveLength(0);
  });

  it('prices a new IOLDOLD from purchase_price 1.00 USD when current_price is null', async () => {
    mocks.investments = [{
      id: 'fixture-fci-ioldold-new',
      type: 'fci',
      ticker: 'IOLDOLD',
      market_currency: 'USD',
      purchase_currency: 'USD',
      purchase_price: 1,
      current_price: null,
      is_manual_price: false,
    }];
    mocks.fci.mockResolvedValue({
      ticker: 'IOLDOLD', price: 1.098, currency: null, changePct: null, timestamp: null, source: 'cafci',
    });
    const response = await cronGet(cronRequest());
    expect(await response.json()).toMatchObject({ success: true, processed: 1, errors: 0 });
    expect(mocks.updates).toHaveLength(1);
    expect(mocks.updates[0].current_price).toBeCloseTo(1.098, 8);
  });

  it('does not overwrite CONIOLA when current_price is null and purchase_price 0.14 fails the ratio guard', async () => {
    mocks.investments[0].current_price = null;
    mocks.investments[0].purchase_price = 0.14;
    mocks.fci.mockResolvedValue({
      ticker: 'CONIOLA', price: CONIOLA_ARS, currency: null, changePct: null, timestamp: null, source: 'cafci',
    });
    const response = await cronGet(cronRequest());
    const body = await response.json();
    expect(body.processed).toBe(0);
    expect(mocks.updates).toHaveLength(0);
  });

  it('writes IOLDOLD 1.098 USD when CAFCI omits moneda and the stored USD price is plausible', async () => {
    mocks.investments = [{
      id: 'fixture-fci-ioldold',
      type: 'fci',
      ticker: 'IOLDOLD',
      market_currency: 'USD',
      purchase_currency: 'USD',
      current_price: 1.09,
      is_manual_price: false,
    }];
    mocks.fci.mockResolvedValue({
      ticker: 'IOLDOLD', price: 1.098, currency: null, changePct: null, timestamp: null, source: 'cafci',
    });
    const response = await cronGet(cronRequest());
    expect(await response.json()).toMatchObject({ success: true, processed: 1, errors: 0 });
    expect(mocks.updates).toHaveLength(1);
    expect(mocks.updates[0]).toMatchObject({ market_currency: 'USD' });
    expect(mocks.updates[0].current_price).toBeCloseTo(1.098, 8);
  });

  it.each([
    ['null then 1.09', null, 1.09],
    ['1.09 then null', 1.09, null],
  ] as const)('updates only the plausible IOLDOLD user when stored prices are %s', async (_label, firstPrice, secondPrice) => {
    mocks.investments = [
      {
        id: 'fixture-user-a-ioldold',
        type: 'fci',
        ticker: 'IOLDOLD',
        market_currency: 'USD',
        purchase_currency: 'USD',
        current_price: firstPrice,
        is_manual_price: false,
      },
      {
        id: 'fixture-user-b-ioldold',
        type: 'fci',
        ticker: 'IOLDOLD',
        market_currency: 'USD',
        purchase_currency: 'USD',
        current_price: secondPrice,
        is_manual_price: false,
      },
    ];
    mocks.fci.mockResolvedValue({
      ticker: 'IOLDOLD', price: 1.098, currency: null, changePct: null, timestamp: null, source: 'cafci',
    });
    const response = await cronGet(cronRequest());
    const body = await response.json();
    expect(body.processed).toBe(1);
    expect(mocks.fci).toHaveBeenCalledTimes(1);
    expect(mocks.updates).toHaveLength(1);
    expect(mocks.updates[0].id).toBe(
      firstPrice === 1.09 ? 'fixture-user-a-ioldold' : 'fixture-user-b-ioldold'
    );
    expect(mocks.updates[0].current_price).toBeCloseTo(1.098, 8);
  });

  it('does not write CONIOLA 179.598 onto the user whose stored USD book is 0.138', async () => {
    mocks.investments = [
      {
        id: 'fixture-user-a-coniola',
        type: 'fci',
        ticker: 'CONIOLA',
        market_currency: 'USD',
        purchase_currency: 'USD',
        current_price: 179.598,
        is_manual_price: false,
      },
      {
        id: 'fixture-user-b-coniola',
        type: 'fci',
        ticker: 'CONIOLA',
        market_currency: 'USD',
        purchase_currency: 'USD',
        current_price: 0.138,
        is_manual_price: false,
      },
    ];
    mocks.fci.mockResolvedValue({
      ticker: 'CONIOLA', price: 179.598, currency: null, changePct: null, timestamp: null, source: 'cafci',
    });
    const response = await cronGet(cronRequest());
    await response.json();
    expect(mocks.fci).toHaveBeenCalledTimes(1);
    expect(mocks.updates.some((row) => row.id === 'fixture-user-b-coniola')).toBe(false);
    const legacy = mocks.updates.find((row) => row.id === 'fixture-user-a-coniola');
    if (legacy) expect(legacy.current_price).toBeCloseTo(179.598, 5);
  });

  it('does not overwrite CONIOLA when MEP is unavailable', async () => {
    mocks.dolar.mockResolvedValue({ blue: { timestamp: new Date(), sell: MEP, buy: MEP  } });
    mocks.fci.mockResolvedValue({
      ticker: 'CONIOLA', price: CONIOLA_ARS, currency: 'ARS', changePct: null, timestamp: null, source: 'cafci',
    });
    const response = await cronGet(cronRequest());
    const body = await response.json();
    expect(body.processed).toBe(0);
    expect(mocks.updates).toHaveLength(0);
  });
});
