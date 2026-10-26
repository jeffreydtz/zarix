import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fixture = vi.hoisted(() => ({
  dolar: vi.fn(), fci: vi.fn(), from: vi.fn(), snapshots: vi.fn(), ratesWritten: vi.fn(),
  positions: [] as Array<Record<string, unknown>>,
  updates: [] as Array<Record<string, unknown>>,
}));
vi.mock('@/lib/services/cotizaciones', () => ({ cotizacionesService: {
  getDolarQuotes: fixture.dolar,
} }));
vi.mock('@/lib/market-data/cafci-client', () => ({ fetchFciQuote: fixture.fci }));
vi.mock('@/lib/market-data/data912-client', () => ({ loadArgentineQuotes: vi.fn() }));
vi.mock('@/lib/yahoo-finance-quotes', () => ({ fetchYahooStockQuotesMap: vi.fn() }));
vi.mock('@/lib/stooq-us-quote', () => ({ fetchStooqUsQuote: vi.fn() }));
vi.mock('@/lib/observability/alert', () => ({ alertAdmin: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({
  createServiceClientSync: () => ({ from: fixture.from }),
  createClient: async () => ({ auth: {
    getUser: async () => ({ data: { user: { id: 'fixture-user' } } }),
  } }),
}));

import { GET as cronGet } from '@/app/api/cron/update-prices/route';
import { GET as quoteGet } from '@/app/api/investments/quote/route';
import { investmentsService } from '@/lib/services/investments';
import { quoteCacheKeyForPosition, refreshQuotesForInvestments } from '@/lib/market-data/quote-refresh';

const NOW = '2026-10-25T12:00:00.000Z';
const MEP_AS_OF = '2026-10-25T10:00:00.000Z';
const CONVERTED_PRICE = 179.598 / 1300;

function position(id = 'converted-fund', currency = 'USD', anchor = 0.135) {
  return {
    id, user_id: 'fixture-user', account_id: 'fixture-account',
    type: 'fci' as const, name: 'Fixture fund', ticker: 'CONIOLA',
    market_currency: currency, purchase_currency: currency,
    current_price: anchor, purchase_price: anchor, quantity: 10,
    is_manual_price: false, current_price_updated_at: null,
  };
}

const cronRequest = () => new NextRequest('http://localhost/api/cron/update-prices', {
  headers: { authorization: 'Bearer fixture-cron-secret' },
});

beforeEach(async () => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(NOW));
  vi.stubEnv('CRON_SECRET', 'fixture-cron-secret');
  vi.stubEnv('EXCHANGE_RATE_MAX_AGE_SECONDS', '86400');
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Fixture provider outage; no network')));
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  fixture.positions = [position()];
  fixture.updates = [];
  fixture.snapshots.mockResolvedValue({ error: null });
  fixture.ratesWritten.mockResolvedValue({ error: null });
  fixture.fci.mockResolvedValue({ price: 179.598, currency: 'ARS', changePct: 0, timestamp: NOW, source: 'cafci' });
  fixture.from.mockImplementation((table: string) => {
    let source = '';
    const rateResult = async () => ({
      data: source === 'mep' || source === 'mep_buy'
        ? { rate: source === 'mep' ? 1300 : 1280, timestamp: MEP_AS_OF } : null,
      error: null,
    });
    const query = {
      select: () => query,
      eq: (column: string, value: string) => { if (column === 'source') source = value; return query; },
      in: () => query, order: () => query, gte: () => query, limit: () => query,
      single: rateResult, maybeSingle: rateResult,
      insert: fixture.ratesWritten,
      upsert: fixture.snapshots,
      update: (payload: Record<string, unknown>) => {
        const chain: {
          eq: (column: string, id: string) => typeof chain;
          or: () => typeof chain;
          select: () => Promise<{ error: null; data: Array<{ id: string }> }>;
          then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => Promise<unknown>;
        } = {
          eq: (_column: string, id: string) => {
            fixture.updates.push({ ...payload, id });
            return chain;
          },
          or: () => chain,
          select: async () => ({ error: null, data: [{ id: 'ok' }] }),
          then: (resolve, reject) => Promise.resolve({ error: null, data: [{ id: 'ok' }] }).then(resolve, reject),
        };
        return chain;
      },
      then: (resolve: (value: unknown) => unknown) => Promise.resolve(resolve({
        data: table === 'investments' ? fixture.positions : [], error: null,
      })),
    };
    return query;
  });

  // Exercise the real provider-outage/DB-fallback path: recent timestamps alone
  // must not make this explicitly stale observation writable.
  const actual = await vi.importActual<typeof import('@/lib/services/cotizaciones')>('@/lib/services/cotizaciones');
  const quotes = await actual.cotizacionesService.getDolarQuotes({ require: ['mep'] });
  expect(quotes.mep).toMatchObject({
    sell: 1300, stale: true, origin: 'persisted', timestamp: new Date(MEP_AS_OF), asOf: new Date(MEP_AS_OF),
  });
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(fixture.ratesWritten).not.toHaveBeenCalled();
  // A healthy blue valuation must not hide the stale MEP used by the asset.
  fixture.dolar.mockResolvedValue({ ...quotes, blue: {
    type: 'blue', buy: 1280, sell: 1300, timestamp: new Date(NOW), asOf: new Date(NOW), stale: false,
  } });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('recent persisted MEP flagged stale', () => {
  it('excludes converted writable quotes while retaining native quotes', async () => {
    const converted = position();
    const native = position('native-fund', 'ARS', 179);
    const quotes = await refreshQuotesForInvestments([converted, native]);
    expect(quotes.has(quoteCacheKeyForPosition(converted)!)).toBe(false);
    expect(quotes.unavailableFxKeys.has(quoteCacheKeyForPosition(converted)!)).toBe(true);
    expect(quotes.get(quoteCacheKeyForPosition(native)!)).toMatchObject({ price: 179.598, currency: 'ARS' });
  });

  it('keeps cron from laundering a converted price into a later fresh-blue snapshot', async () => {
    const response = await cronGet(cronRequest());
    expect(await response.json()).toMatchObject({ processed: 0 });
    expect(fixture.updates).toEqual([]);
    const summary = await investmentsService.getPortfolioSummary('fixture-user', { forceRefreshQuotes: true });
    expect(summary).toMatchObject({ fxStale: true, fxAsOf: MEP_AS_OF });
    expect(summary.investments[0]).toMatchObject({
      current_price: CONVERTED_PRICE, valuation_price_source: 'estimate', fxStale: true, fxAsOf: MEP_AS_OF,
    });
    expect(fixture.updates).toEqual([]);
    expect(fixture.snapshots).not.toHaveBeenCalled();
  });

  it.each([false, true])('shows the estimate without persisting through list (forceRefreshQuotes=%s)', async forceRefreshQuotes => {
    const rows = await investmentsService.list('fixture-user', { forceRefreshQuotes });
    expect(rows[0]).toMatchObject({
      current_price: CONVERTED_PRICE, valuation_price_source: 'estimate', fxStale: true, fxAsOf: MEP_AS_OF,
    });
    expect(fixture.updates).toEqual([]);
    expect(fixture.snapshots).not.toHaveBeenCalled();
  });

  it('returns the preview estimate with its MEP provenance', async () => {
    const response = await quoteGet(new NextRequest(
      'http://localhost/api/investments/quote?symbol=CONIOLA&type=fci&currency=USD&currentPrice=0.135',
    ));
    expect(await response.json()).toMatchObject({
      ok: true, price: CONVERTED_PRICE, currency: 'USD', fxStale: true, fxAsOf: MEP_AS_OF,
    });
    expect(fixture.updates).toEqual([]);
    expect(fixture.snapshots).not.toHaveBeenCalled();
  });

  it('still persists a native quote while rejecting the converted quote in the same cron batch', async () => {
    fixture.positions.push(position('native-fund', 'ARS', 179));
    const response = await cronGet(cronRequest());
    expect(await response.json()).toMatchObject({ processed: 1 });
    expect(fixture.updates).toEqual([expect.objectContaining({
      id: 'native-fund', current_price: 179.598, market_currency: 'ARS',
    })]);
  });
});
