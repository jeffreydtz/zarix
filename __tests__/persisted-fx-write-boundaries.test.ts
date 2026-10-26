import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Investment } from '@/types/database';

const fixture = vi.hoisted(() => ({
  from: vi.fn(), fci: vi.fn(), arg: vi.fn(), snapshots: vi.fn(), history: vi.fn(),
  updates: vi.fn(), positions: [] as Investment[],
}));
vi.mock('@/lib/supabase/server', () => ({ createServiceClientSync: () => ({ from: fixture.from }) }));
vi.mock('@/lib/market-data/cafci-client', () => ({ fetchFciQuote: fixture.fci }));
vi.mock('@/lib/market-data/data912-client', () => ({ loadArgentineQuotes: fixture.arg }));
vi.mock('@/lib/yahoo-finance-quotes', () => ({ fetchYahooStockQuotesMap: vi.fn(async () => new Map()) }));
vi.mock('@/lib/stooq-us-quote', () => ({ fetchStooqUsQuote: vi.fn(async () => null) }));
vi.mock('@/lib/observability/alert', () => ({ alertAdmin: vi.fn() }));

const NOW = '2026-10-25T12:00:00.000Z';
const FX_AS_OF = '2026-10-25T02:00:00.000Z';

function position(type: 'fci' | 'stock_arg'): Investment {
  return {
    id: 'fixture-position', user_id: 'fixture-user', account_id: 'fixture-account',
    type, ticker: type === 'fci' ? 'CONIOLA' : 'GGAL', name: 'Posición sintética',
    market_currency: 'USD', purchase_currency: 'USD', current_price: 0.135,
    purchase_price: 0.135, quantity: 10, is_manual_price: false, current_price_updated_at: null,
  } as Investment;
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(NOW));
  vi.stubEnv('CRON_SECRET', 'fixture-secret');
  vi.stubEnv('EXCHANGE_RATE_MAX_AGE_SECONDS', '86400');
  fixture.history.mockResolvedValue({ error: null });
  fixture.snapshots.mockResolvedValue({ error: null });
  fixture.updates.mockResolvedValue({ error: null });
  fixture.fci.mockResolvedValue({ price: 179.598, currency: 'ARS', changePct: 0, timestamp: NOW, source: 'cafci' });
  fixture.arg.mockResolvedValue({
    byStock: new Map([['GGAL', { symbol: 'GGAL', price: 179.598, currency: 'ARS', changePct: 0, timestamp: NOW }]]),
    byCedear: new Map(), byBond: new Map(), byCorp: new Map(),
  });
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  fixture.from.mockImplementation((table: string) => {
    let source = '';
    const rateResult = async () => ({
      data: ['blue', 'blue_buy', 'mep', 'mep_buy'].includes(source)
        ? { rate: source.endsWith('_buy') ? 1280 : 1300, timestamp: FX_AS_OF } : null,
      error: null,
    });
    const query = {
      select: () => query,
      eq: (key: string, value: string) => { if (key === 'source') source = value; return query; },
      in: () => query, order: () => query, gte: () => query, limit: () => query,
      single: rateResult, maybeSingle: rateResult,
      insert: fixture.history,
      upsert: table === 'portfolio_performance_snapshots' ? fixture.snapshots : fixture.history,
      update: (payload: unknown) => {
        const chain: {
          eq: () => typeof chain;
          is: () => typeof chain;
          or: () => typeof chain;
          select: () => Promise<{ error: null; data: Array<{ id: string }> }>;
          then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => Promise<unknown>;
        } = {
          eq: () => {
            fixture.updates(payload);
            return chain;
          },
          is: () => chain,
          or: () => chain,
          select: async () => ({ error: null, data: [{ id: 'ok' }] }),
          then: (resolve, reject) => Promise.resolve({ error: null, data: [{ id: 'ok' }] }).then(resolve, reject),
        };
        return chain;
      },
      then: (resolve: (result: unknown) => unknown) => Promise.resolve({
        data: table === 'investments' ? fixture.positions : [], error: null,
      }).then(resolve),
    };
    return query;
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe.each(['fci', 'stock_arg'] as const)('persisted MEP on %s write boundaries', type => {
  it.each([false, true])('blocks writes and snapshots with 10h DB MEP, unrelated live blue=%s', async liveBlue => {
    fixture.positions = [position(type)];
    vi.stubGlobal('fetch', vi.fn(async (url: unknown) => {
      if (liveBlue && String(url).includes('criptoya')) return new Response(JSON.stringify({
        blue: { bid: 1280, ask: 1300, timestamp: Date.now() / 1000 },
      }));
      throw new Error('Fixture provider outage; no network');
    }));
    const { cotizacionesService } = await import('@/lib/services/cotizaciones');
    const { isExecutableDolarQuote } = await import('@/lib/executable-fx');
    const { refreshQuotesForInvestments, quoteCacheKeyForPosition } = await import('@/lib/market-data/quote-refresh');
    // Exercise the real resolver and its memory cache, not a pre-marked quote mock.
    for (let attempt = 0; attempt < 2; attempt++) {
      const quotes = await cotizacionesService.getDolarQuotes({ require: ['mep'] });
      expect(quotes.mep).toMatchObject({ sell: 1300, timestamp: new Date(FX_AS_OF), origin: 'persisted', stale: true });
      expect(isExecutableDolarQuote(quotes.mep, 'mep')).toBe(false);
    }
    const refreshed = await refreshQuotesForInvestments(fixture.positions);
    expect(refreshed.get(quoteCacheKeyForPosition(fixture.positions[0])!)).toBeUndefined();

    const { GET } = await import('@/app/api/cron/update-prices/route');
    const response = await GET(new NextRequest('http://localhost/api/cron/update-prices', {
      headers: { authorization: 'Bearer fixture-secret' },
    }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ processed: 0 });
    expect(fixture.updates).not.toHaveBeenCalled();

    const { investmentsService } = await import('@/lib/services/investments');
    const summary = await investmentsService.getPortfolioSummary('fixture-user', { forceRefreshQuotes: true });
    expect(summary).toMatchObject({ fxStale: true, fxAsOf: FX_AS_OF });
    expect(summary.investments[0]).toMatchObject({
      current_price: 179.598 / 1300, valuation_price_source: 'estimate', fxStale: true, fxAsOf: FX_AS_OF,
    });
    expect(fixture.updates).not.toHaveBeenCalled();
    expect(fixture.snapshots).not.toHaveBeenCalled();
  });

  it('persists a live-confirmed conversion and its snapshot', async () => {
    fixture.positions = [position(type)];
    vi.stubGlobal('fetch', vi.fn(async (url: unknown) => {
      if (String(url).includes('criptoya')) return new Response(JSON.stringify({
        blue: { bid: 1280, ask: 1300, timestamp: Date.now() / 1000 },
        mep: { al30: { '24hs': { price: 1300, timestamp: Date.now() / 1000 } } },
      }));
      throw new Error('Fixture secondary outage; no network');
    }));
    const { investmentsService } = await import('@/lib/services/investments');
    const summary = await investmentsService.getPortfolioSummary('fixture-user', { forceRefreshQuotes: true });
    expect(summary).toMatchObject({ fxStale: false });
    expect(fixture.updates).toHaveBeenCalledWith(expect.objectContaining({ current_price: 179.598 / 1300 }));
    expect(fixture.snapshots).toHaveBeenCalledOnce();
  });
});
