import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  dolar: vi.fn(),
  yahoo: vi.fn(),
  stooq: vi.fn(),
  fci: vi.fn(),
  crypto: vi.fn(),
}));

vi.mock('@/lib/services/cotizaciones', () => ({
  cotizacionesService: { getDolarQuotes: mocks.dolar, getCryptoQuote: mocks.crypto },
}));
vi.mock('@/lib/yahoo-finance-quotes', () => ({ fetchYahooStockQuotesMap: mocks.yahoo }));
vi.mock('@/lib/stooq-us-quote', () => ({ fetchStooqUsQuote: mocks.stooq }));
vi.mock('@/lib/market-data/cafci-client', () => ({ fetchFciQuote: mocks.fci }));

import { loadArgentineQuotes, resetData912CacheForTest } from '@/lib/market-data/data912-client';
import { quoteCacheKey, refreshQuotesForInvestments } from '@/lib/market-data/quote-refresh';

function ok(rows: unknown[]) {
  return { ok: true, json: async () => rows };
}

function fail(status: number) {
  return { ok: false, status, json: async () => ({}) };
}

describe('data912 stale-cache timestamps', () => {
  beforeEach(() => {
    resetData912CacheForTest();
    vi.clearAllMocks();
    mocks.dolar.mockResolvedValue({ blue: { sell: 1300, buy: 1280 }, mep: { sell: 1300, buy: 1280 } });
    mocks.yahoo.mockResolvedValue(new Map());
    mocks.stooq.mockResolvedValue(null);
    mocks.fci.mockResolvedValue(null);
    mocks.crypto.mockResolvedValue({ priceUSD: 0 });
  });

  afterEach(() => {
    resetData912CacheForTest();
    vi.unstubAllGlobals();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('keeps the 12:00 live timestamp after a 12:06 503 stale-cache hit', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-24T12:00:00.000Z'));
    const fetchMock = vi.fn(
      async (
        _url: string,
        _init?: { cache?: RequestCache; next?: { revalidate?: number } }
      ): Promise<{ ok: boolean; status?: number; json: () => Promise<unknown> }> => {
        if (String(_url).includes('/live/arg_stocks')) {
          return ok([{ symbol: 'YPFD', c: 42000, pct: 1 }]);
        }
        return ok([]);
      }
    );
    vi.stubGlobal('fetch', fetchMock);

    const live = await refreshQuotesForInvestments([
      { type: 'stock_arg', ticker: 'YPFD', market_currency: 'ARS', purchase_currency: 'ARS' },
    ]);
    const liveInit = fetchMock.mock.calls[0][1];
    expect(liveInit).toEqual(expect.objectContaining({ cache: 'no-store' }));
    expect(liveInit?.next?.revalidate).toBeUndefined();
    expect(live.get(quoteCacheKey('stock_arg', 'YPFD', 'ARS'))).toMatchObject({
      price: 42000,
      currency: 'ARS',
      timestamp: '2026-10-24T12:00:00.000Z',
    });

    vi.setSystemTime(new Date('2026-10-24T12:06:00.000Z'));
    fetchMock.mockImplementation(async () => fail(503));
    const fetchesAfterLive = fetchMock.mock.calls.length;

    const staleIndex = await loadArgentineQuotes();
    expect(staleIndex.byStock.get('YPFD')?.stale).toBe(true);
    expect(staleIndex.byStock.get('YPFD')?.timestamp).toBe('2026-10-24T12:00:00.000Z');
    const fetchesAfterFirst503 = fetchMock.mock.calls.length;
    expect(fetchesAfterFirst503).toBeGreaterThan(fetchesAfterLive);

    const stale = await refreshQuotesForInvestments([
      { type: 'stock_arg', ticker: 'YPFD', market_currency: 'ARS', purchase_currency: 'ARS' },
    ]);
    expect(fetchMock.mock.calls.length).toBe(fetchesAfterFirst503);
    expect(stale.get(quoteCacheKey('stock_arg', 'YPFD', 'ARS'))).toMatchObject({
      price: 42000,
      currency: 'ARS',
      timestamp: '2026-10-24T12:00:00.000Z',
    });
  });
});
