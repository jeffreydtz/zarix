import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  arg: vi.fn(),
  dolar: vi.fn(),
  yahoo: vi.fn(),
  stooq: vi.fn(),
  fci: vi.fn(),
  crypto: vi.fn(),
}));

vi.mock('@/lib/market-data/data912-client', () => ({ loadArgentineQuotes: mocks.arg }));
vi.mock('@/lib/services/cotizaciones', () => ({
  cotizacionesService: { getDolarQuotes: mocks.dolar, getCryptoQuote: mocks.crypto },
}));
vi.mock('@/lib/yahoo-finance-quotes', () => ({ fetchYahooStockQuotesMap: mocks.yahoo }));
vi.mock('@/lib/stooq-us-quote', () => ({ fetchStooqUsQuote: mocks.stooq }));
vi.mock('@/lib/market-data/cafci-client', () => ({ fetchFciQuote: mocks.fci }));

import {
  mapWithLimit,
  quoteCacheKey,
  refreshQuotesForInvestments,
} from '@/lib/market-data/quote-refresh';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.dolar.mockResolvedValue({ blue: { sell: 1300, buy: 1280 }, mep: { sell: 1300, buy: 1280 } });
  mocks.yahoo.mockResolvedValue(new Map());
  mocks.stooq.mockResolvedValue(null);
  mocks.fci.mockResolvedValue(null);
  mocks.crypto.mockResolvedValue({ priceUSD: 0 });
});

afterEach(() => vi.restoreAllMocks());

describe('refreshQuotesForInvestments currency keys', () => {
  it('stores ARS and USD adaptations of AL30 on separate keys', async () => {
    mocks.arg.mockResolvedValue({
      byStock: new Map(),
      byCedear: new Map(),
      byBond: new Map([
        ['AL30', { symbol: 'AL30', price: 91000, changePct: 1, currency: 'ARS' }],
        ['AL30D', { symbol: 'AL30D', price: 92, changePct: 1, currency: 'ARS' }],
      ]),
      byCorp: new Map(),
    });
    const map = await refreshQuotesForInvestments([
      { type: 'bond', ticker: 'AL30', market_currency: 'ARS', purchase_currency: 'ARS' },
      { type: 'bond', ticker: 'AL30', market_currency: 'USD', purchase_currency: 'USD' },
    ]);
    expect(map.get(quoteCacheKey('bond', 'AL30', 'ARS'))?.price).toBe(91000);
    expect(map.get(quoteCacheKey('bond', 'AL30', 'USD'))?.price).toBe(92);
    expect(map.get(quoteCacheKey('bond', 'AL30', 'ARS'))?.currency).toBe('ARS');
    expect(map.get(quoteCacheKey('bond', 'AL30', 'USD'))?.currency).toBe('USD');
  });

  it('keeps an isolated AL30D quote in USD instead of dividing by MEP', async () => {
    mocks.arg.mockResolvedValue({
      byStock: new Map(),
      byCedear: new Map(),
      byBond: new Map([['AL30D', { symbol: 'AL30D', price: 92, changePct: 0, currency: 'ARS' }]]),
      byCorp: new Map(),
    });
    const map = await refreshQuotesForInvestments([
      { type: 'bond', ticker: 'AL30', market_currency: 'USD', purchase_currency: 'USD' },
    ]);
    const hit = map.get(quoteCacheKey('bond', 'AL30', 'USD'));
    expect(hit?.currency).toBe('USD');
    expect(hit?.price).toBe(92);
    expect(hit?.price).not.toBeCloseTo(92 / 1300, 8);
  });

  it('fetches each FCI ticker once even when many positions share it', async () => {
    mocks.arg.mockResolvedValue({ byStock: new Map(), byCedear: new Map(), byBond: new Map(), byCorp: new Map() });
    mocks.fci.mockResolvedValue({
      ticker: 'COME', price: 12.5, currency: 'ARS', changePct: null, timestamp: null, source: 'cafci',
    });
    const positions = Array.from({ length: 8 }, () => ({
      type: 'fci' as const, ticker: 'COME', market_currency: 'ARS', purchase_currency: 'ARS',
    }));
    await refreshQuotesForInvestments(positions);
    expect(mocks.fci).toHaveBeenCalledTimes(1);
  });
});

describe('mapWithLimit budget', () => {
  it('runs every item inside the budget and skips when the budget is already gone', async () => {
    await expect(mapWithLimit([1, 2, 3], 2, 10_000, async (n) => n * 2)).resolves.toEqual([2, 4, 6]);
    const started: number[] = [];
    await mapWithLimit([1, 2, 3], 2, -1, async (n) => {
      started.push(n);
      return n;
    });
    expect(started).toEqual([]);
  });
});
