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

  it('skips an unconfirmed IBMD ARS tag instead of dividing by MEP or guessing USD', async () => {
    mocks.arg.mockResolvedValue({
      byStock: new Map(),
      byCedear: new Map([['IBMD', { symbol: 'IBMD', price: 92, changePct: 0, currency: 'ARS' }]]),
      byBond: new Map(),
      byCorp: new Map(),
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const asIbm = await refreshQuotesForInvestments([
      { type: 'cedear', ticker: 'IBM', market_currency: 'USD', purchase_currency: 'USD' },
    ]);
    expect(asIbm.get(quoteCacheKey('cedear', 'IBM', 'USD'))).toBeUndefined();
    const asIbmd = await refreshQuotesForInvestments([
      { type: 'cedear', ticker: 'IBMD', market_currency: 'USD', purchase_currency: 'USD' },
    ]);
    expect(asIbmd.get(quoteCacheKey('cedear', 'IBMD', 'USD'))).toBeUndefined();
    expect(warn).toHaveBeenCalled();
  });

  it('prices YMCJO as 130000 ARS instead of YMCJD × MEP', async () => {
    mocks.arg.mockResolvedValue({
      byStock: new Map(),
      byCedear: new Map(),
      byBond: new Map(),
      byCorp: new Map([
        ['YMCJO', { symbol: 'YMCJO', price: 130000, changePct: 0, currency: 'ARS' }],
        ['YMCJD', { symbol: 'YMCJD', price: 92, changePct: 0, currency: 'ARS' }],
      ]),
    });
    const ars = await refreshQuotesForInvestments([
      { type: 'on', ticker: 'YMCJO', market_currency: 'ARS', purchase_currency: 'ARS' },
    ]);
    expect(ars.get(quoteCacheKey('on', 'YMCJO', 'ARS'))).toMatchObject({
      price: 130000, currency: 'ARS',
    });
    expect(ars.get(quoteCacheKey('on', 'YMCJO', 'ARS'))?.price).not.toBe(92 * 1300);
    const unset = await refreshQuotesForInvestments([
      { type: 'on', ticker: 'YMCJO', market_currency: null, purchase_currency: 'ARS' },
    ]);
    expect(unset.get(quoteCacheKey('on', 'YMCJO', ''))).toMatchObject({
      price: 130000, currency: 'ARS',
    });
  });

  it.each([
    ['TX26', 'bond'] as const,
    ['DICP', 'bond'] as const,
    ['S31O6', 'bond'] as const,
    ['T15D6', 'bond'] as const,
  ])('prices peso-only %s as ARS with no D/C sibling', async (ticker, type) => {
    mocks.arg.mockResolvedValue({
      byStock: new Map(),
      byCedear: new Map(),
      byBond: new Map([[ticker, { symbol: ticker, price: 10000, changePct: 0, currency: 'ARS' }]]),
      byCorp: new Map(),
    });
    const map = await refreshQuotesForInvestments([
      { type, ticker, market_currency: 'ARS', purchase_currency: 'ARS' },
    ]);
    expect(map.get(quoteCacheKey(type, ticker, 'ARS'))).toMatchObject({
      price: 10000, currency: 'ARS',
    });
  });

  it('keeps IBMD at 92 USD when the peso sibling is listed', async () => {
    mocks.arg.mockResolvedValue({
      byStock: new Map(),
      byCedear: new Map([
        ['IBM', { symbol: 'IBM', price: 119600, changePct: 0, currency: 'ARS' }],
        ['IBMD', { symbol: 'IBMD', price: 92, changePct: 0, currency: 'ARS' }],
      ]),
      byBond: new Map(),
      byCorp: new Map(),
    });
    const map = await refreshQuotesForInvestments([
      { type: 'cedear', ticker: 'IBM', market_currency: 'USD', purchase_currency: 'USD' },
    ]);
    const hit = map.get(quoteCacheKey('cedear', 'IBM', 'USD'));
    expect(hit?.currency).toBe('USD');
    expect(hit?.price).toBe(92);
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

  it('skips IOLDOLD when CAFCI names EUR instead of falling back to the stored USD book', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mocks.fci.mockResolvedValue({
      ticker: 'IOLDOLD', price: 1.098, currency: null, currencySkip: 'unsupported',
      changePct: null, timestamp: null, source: 'cafci',
    });
    const map = await refreshQuotesForInvestments([
      { type: 'fci', ticker: 'IOLDOLD', market_currency: 'USD', purchase_currency: 'USD' },
    ]);
    expect(map.get(quoteCacheKey('fci', 'IOLDOLD', 'USD'))).toBeUndefined();
    expect(warn.mock.calls.some((call) => String(call[0]).includes('skip FCI currency'))).toBe(true);
  });

  it('does not save IOLDOLD as ARS when catalog fund Pesos conflicts with ficha USD', async () => {
    mocks.fci.mockResolvedValue({
      ticker: 'IOLDOLD', price: 1.098, currency: null, currencySkip: 'conflict',
      changePct: null, timestamp: null, source: 'cafci',
    });
    const map = await refreshQuotesForInvestments([
      { type: 'fci', ticker: 'IOLDOLD', market_currency: null, purchase_currency: null },
    ]);
    const hit = map.get(quoteCacheKey('fci', 'IOLDOLD', ''));
    expect(hit).toBeUndefined();
    expect(hit?.currency).not.toBe('ARS');
  });

  it('saves IOLDOLD 1.098 USD when class currency is USD and market currency is unset', async () => {
    mocks.fci.mockResolvedValue({
      ticker: 'IOLDOLD', price: 1.098, currency: 'USD', changePct: null, timestamp: null, source: 'cafci',
    });
    const map = await refreshQuotesForInvestments([
      { type: 'fci', ticker: 'IOLDOLD', market_currency: null, purchase_currency: null },
    ]);
    expect(map.get(quoteCacheKey('fci', 'IOLDOLD', ''))).toMatchObject({
      price: 1.098, currency: 'USD',
    });
  });

  it('skips a USD-booked FCI when CAFCI omits moneda instead of writing the cuotaparte as USD', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mocks.fci.mockResolvedValue({
      ticker: 'IOLDOLD', price: 1.098, currency: null, changePct: null, timestamp: null, source: 'cafci',
    });
    const map = await refreshQuotesForInvestments([
      { type: 'fci', ticker: 'IOLDOLD', market_currency: 'USD', purchase_currency: 'USD' },
    ]);
    expect(map.get(quoteCacheKey('fci', 'IOLDOLD', 'USD'))).toBeUndefined();
    expect(warn.mock.calls.some((call) => String(call[0]).includes('skip FCI currency'))).toBe(true);
  });

  it('stores an ARS FCI cuotaparte in pesos', async () => {
    mocks.fci.mockResolvedValue({
      ticker: 'COME', price: 12.5, currency: 'ARS', changePct: null, timestamp: null, source: 'cafci',
    });
    const map = await refreshQuotesForInvestments([
      { type: 'fci', ticker: 'COME', market_currency: 'ARS', purchase_currency: 'ARS' },
    ]);
    expect(map.get(quoteCacheKey('fci', 'COME', 'ARS'))).toMatchObject({
      price: 12.5, currency: 'ARS',
    });
  });

  it('converts CONIOLA CAFCI ARS ~179.598 to USD with the same MEP stocks use', async () => {
    mocks.fci.mockResolvedValue({
      ticker: 'CONIOLA',
      price: 179.598,
      currency: 'ARS',
      changePct: null,
      timestamp: '2026-10-23T00:00:00.000Z',
      source: 'cafci',
    });
    const map = await refreshQuotesForInvestments([
      { type: 'fci', ticker: 'CONIOLA', market_currency: 'USD', purchase_currency: 'USD' },
    ]);
    const hit = map.get(quoteCacheKey('fci', 'CONIOLA', 'USD'));
    expect(hit?.currency).toBe('USD');
    expect(hit?.price).toBeCloseTo(179.598 / 1300, 8);
    expect(hit?.price).not.toBeCloseTo(179.598, 5);
    expect(hit?.timestamp).toBe('2026-10-23T00:00:00.000Z');
    expect(mocks.yahoo).not.toHaveBeenCalled();
  });

  it('converts PRTAVAB CAFCI ARS ~1241.954 to USD with fixture MEP 1300', async () => {
    mocks.fci.mockResolvedValue({
      ticker: 'PRTAVAB',
      price: 1241.954,
      currency: 'ARS',
      changePct: null,
      timestamp: '2026-10-23T00:00:00.000Z',
      source: 'cafci',
    });
    const map = await refreshQuotesForInvestments([
      { type: 'fci', ticker: 'PRTAVAB', market_currency: 'USD', purchase_currency: 'USD' },
    ]);
    const hit = map.get(quoteCacheKey('fci', 'PRTAVAB', 'USD'));
    expect(hit?.currency).toBe('USD');
    expect(hit?.price).toBeCloseTo(1241.954 / 1300, 8);
    expect(hit?.timestamp).toBe('2026-10-23T00:00:00.000Z');
  });

  it('skips CONIOLA when CAFCI is ARS, the book is USD, and MEP is unavailable', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mocks.dolar.mockResolvedValue({ blue: { sell: 1300, buy: 1280 } });
    mocks.fci.mockResolvedValue({
      ticker: 'CONIOLA', price: 179.598, currency: 'ARS', changePct: null, timestamp: null, source: 'cafci',
    });
    const map = await refreshQuotesForInvestments([
      { type: 'fci', ticker: 'CONIOLA', market_currency: 'USD', purchase_currency: 'USD' },
    ]);
    expect(map.get(quoteCacheKey('fci', 'CONIOLA', 'USD'))).toBeUndefined();
    expect(warn.mock.calls.some((call) =>
      String(call[0]).includes('skip FCI currency') && call[1]?.reason === 'mep'
    )).toBe(true);
  });

  it('keeps main: unknown CAFCI + stored ARS still writes the peso cuotaparte as ARS', async () => {
    mocks.fci.mockResolvedValue({
      ticker: 'CONIOLA', price: 179.598, currency: null, changePct: null, timestamp: null, source: 'cafci',
    });
    const map = await refreshQuotesForInvestments([
      { type: 'fci', ticker: 'CONIOLA', market_currency: 'ARS', purchase_currency: 'ARS' },
    ]);
    expect(map.get(quoteCacheKey('fci', 'CONIOLA', 'ARS'))).toMatchObject({
      price: 179.598, currency: 'ARS',
    });
  });

  it('converts a CAFCI USD FCI to ARS with MEP when the position is stored in ARS', async () => {
    mocks.fci.mockResolvedValue({
      ticker: 'IOLDOLD', price: 1.098, currency: 'USD', changePct: null, timestamp: null, source: 'cafci',
    });
    const map = await refreshQuotesForInvestments([
      { type: 'fci', ticker: 'IOLDOLD', market_currency: 'ARS', purchase_currency: 'ARS' },
    ]);
    const hit = map.get(quoteCacheKey('fci', 'IOLDOLD', 'ARS'));
    expect(hit?.currency).toBe('ARS');
    expect(hit?.price).toBeCloseTo(1.098 * 1300, 8);
    expect(mocks.yahoo).not.toHaveBeenCalled();
  });

  it('skips an FCI update when currency is unknown', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mocks.fci.mockResolvedValue({
      ticker: 'MYSTERY', price: 1.5, currency: null, changePct: null, timestamp: null, source: 'cafci',
    });
    const map = await refreshQuotesForInvestments([
      { type: 'fci', ticker: 'MYSTERY', market_currency: null, purchase_currency: null },
    ]);
    expect(map.get(quoteCacheKey('fci', 'MYSTERY', ''))).toBeUndefined();
    expect(warn).toHaveBeenCalled();
    expect(mocks.yahoo).not.toHaveBeenCalled();
  });

  it('skips CAFCI 403 and keeps the last price instead of guessing on Yahoo', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mocks.fci.mockRejectedValue(Object.assign(new Error('CAFCI 403'), { name: 'CafciHttpError', status: 403 }));
    const map = await refreshQuotesForInvestments([
      { type: 'fci', ticker: 'IOLDOLD', market_currency: 'USD', purchase_currency: 'USD' },
    ]);
    expect(map.get(quoteCacheKey('fci', 'IOLDOLD', 'USD'))).toBeUndefined();
    expect(mocks.yahoo).not.toHaveBeenCalled();
    expect(warn.mock.calls.some((call) => String(call[0]).includes('CAFCI failure'))).toBe(true);
  });

  it.each([
    ['null cuotaparte', null],
    ['error catalog', null],
    ['parse failure', null],
  ])('skips IOLDOLD USD when CAFCI 200 is unusable (%s) instead of Yahoo/MEP', async (_label, quote) => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mocks.fci.mockResolvedValue(quote);
    mocks.yahoo.mockResolvedValue(new Map([
      ['IOLDOLD.BA', {
        ticker: 'IOLDOLD.BA', name: 'IOL Dolar', price: 1.098, changePct: 0, currency: 'ARS',
      }],
    ]));
    const map = await refreshQuotesForInvestments([
      { type: 'fci', ticker: 'IOLDOLD', market_currency: 'USD', purchase_currency: 'USD' },
    ]);
    expect(map.get(quoteCacheKey('fci', 'IOLDOLD', 'USD'))).toBeUndefined();
    expect(mocks.yahoo).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalled();
  });

  it('skips CAFCI 500 for a USD FCI and does not apply a Yahoo ARS quote via MEP', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mocks.fci.mockRejectedValue(Object.assign(new Error('CAFCI 500'), { name: 'CafciHttpError', status: 500 }));
    mocks.yahoo.mockResolvedValue(new Map([
      ['IOLDOLD.BA', {
        ticker: 'IOLDOLD.BA', name: 'IOL Dolar', price: 1.098, changePct: 0, currency: 'ARS',
      }],
    ]));
    const map = await refreshQuotesForInvestments([
      { type: 'fci', ticker: 'IOLDOLD', market_currency: 'USD', purchase_currency: 'USD' },
    ]);
    expect(map.get(quoteCacheKey('fci', 'IOLDOLD', 'USD'))).toBeUndefined();
    expect(mocks.yahoo).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalled();
  });

  it('prices a GLD cedear from the exact data912 ARS listing, including a USD book via MEP', async () => {
    mocks.arg.mockResolvedValue({
      byStock: new Map(),
      byCedear: new Map([['GLD', { symbol: 'GLD', price: 52000, changePct: 0.5, currency: 'ARS' }]]),
      byBond: new Map(),
      byCorp: new Map(),
    });
    const ars = await refreshQuotesForInvestments([
      { type: 'cedear', ticker: 'GLD', market_currency: 'ARS', purchase_currency: 'ARS' },
    ]);
    expect(ars.get(quoteCacheKey('cedear', 'GLD', 'ARS'))).toMatchObject({
      price: 52000, currency: 'ARS',
    });
    const usd = await refreshQuotesForInvestments([
      { type: 'cedear', ticker: 'GLD', market_currency: 'USD', purchase_currency: 'USD' },
    ]);
    expect(usd.get(quoteCacheKey('cedear', 'GLD', 'USD'))?.currency).toBe('USD');
    expect(usd.get(quoteCacheKey('cedear', 'GLD', 'USD'))?.price).toBeCloseTo(52000 / 1300, 8);
  });

  it('prices a GLD etf booked in ARS from a confirmed Yahoo USD quote', async () => {
    mocks.yahoo.mockResolvedValue(new Map([
      ['GLD', { ticker: 'GLD', name: 'SPDR Gold', price: 380, changePct: 0.4, currency: 'USD' }],
    ]));
    const map = await refreshQuotesForInvestments([
      { type: 'etf', ticker: 'GLD', market_currency: 'ARS', purchase_currency: 'ARS' },
    ]);
    const hit = map.get(quoteCacheKey('etf', 'GLD', 'ARS'));
    expect(hit?.currency).toBe('ARS');
    expect(hit?.price).toBeCloseTo(380 * 1300, 8);
  });

  it('updates GLD from Yahoo currency=USD without inferring USD from the D suffix', async () => {
    mocks.yahoo.mockResolvedValue(new Map([
      ['GLD', { ticker: 'GLD', name: 'SPDR Gold', price: 380.12, changePct: 0.4, currency: 'USD' }],
    ]));
    const map = await refreshQuotesForInvestments([
      { type: 'etf', ticker: 'GLD', market_currency: 'USD', purchase_currency: 'USD' },
    ]);
    expect(map.get(quoteCacheKey('etf', 'GLD', 'USD'))).toMatchObject({
      price: 380.12, currency: 'USD',
    });
  });

  it('treats a missing Yahoo GLD currency as USD like main, not as a D-class ticker', async () => {
    mocks.yahoo.mockResolvedValue(new Map([
      ['GLD', { ticker: 'GLD', name: 'SPDR Gold', price: 380.12, changePct: 0.4, currency: '' }],
    ]));
    const map = await refreshQuotesForInvestments([
      { type: 'etf', ticker: 'GLD', market_currency: 'USD', purchase_currency: 'USD' },
    ]);
    expect(map.get(quoteCacheKey('etf', 'GLD', 'USD'))).toMatchObject({
      price: 380.12, currency: 'USD',
    });
  });

  it('keeps the live data912 timestamp when a later fetch is a 503 stale-cache hit', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-24T12:06:00.000Z'));
    mocks.arg.mockResolvedValue({
      byStock: new Map([['YPFD', {
        symbol: 'YPFD',
        price: 42000,
        changePct: 0,
        currency: 'ARS',
        timestamp: '2026-10-24T12:00:00.000Z',
        stale: true,
      }]]),
      byCedear: new Map(),
      byBond: new Map(),
      byCorp: new Map(),
    });
    try {
      const map = await refreshQuotesForInvestments([
        { type: 'stock_arg', ticker: 'YPFD', market_currency: 'ARS', purchase_currency: 'ARS' },
      ]);
      expect(map.get(quoteCacheKey('stock_arg', 'YPFD', 'ARS'))).toMatchObject({
        price: 42000,
        currency: 'ARS',
        timestamp: '2026-10-24T12:00:00.000Z',
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not write a stale data912 quote that has no original timestamp', async () => {
    mocks.arg.mockResolvedValue({
      byStock: new Map([['YPFD', {
        symbol: 'YPFD', price: 42000, changePct: 0, currency: 'ARS', stale: true,
      }]]),
      byCedear: new Map(),
      byBond: new Map(),
      byCorp: new Map(),
    });
    const map = await refreshQuotesForInvestments([
      { type: 'stock_arg', ticker: 'YPFD', market_currency: 'ARS', purchase_currency: 'ARS' },
    ]);
    expect(map.get(quoteCacheKey('stock_arg', 'YPFD', 'ARS'))).toBeUndefined();
  });

  it('stores fetch time in UTC when the source omits a timestamp', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-24T18:30:00.000Z'));
    mocks.fci.mockResolvedValue({
      ticker: 'COME', price: 12.5, currency: 'ARS', changePct: null, timestamp: null, source: 'cafci',
    });
    try {
      const map = await refreshQuotesForInvestments([
        { type: 'fci', ticker: 'COME', market_currency: 'ARS', purchase_currency: 'ARS' },
      ]);
      expect(map.get(quoteCacheKey('fci', 'COME', 'ARS'))?.timestamp).toBe('2026-10-24T18:30:00.000Z');
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('mapWithLimit budget', () => {
  it('runs every item inside the budget and skips when the budget is already gone', async () => {
    await expect(mapWithLimit([1, 2, 3], 2, 10_000, async (n) => n * 2)).resolves.toEqual([2, 4, 6]);
    const started: number[] = [];
    await mapWithLimit([1, 2, 3], 2, 0, async (n) => {
      started.push(n);
      return n;
    });
    expect(started).toEqual([]);
  });
});

describe('FCI never falls back to Yahoo', () => {
  it('does not send FCIs to Yahoo even while the FCI budget remains', async () => {
    mocks.fci.mockResolvedValue(null);
    mocks.yahoo.mockResolvedValue(new Map([
      ['COME.BA', { ticker: 'COME.BA', name: 'COME', price: 12.5, changePct: 0, currency: 'ARS' }],
    ]));
    await refreshQuotesForInvestments(
      [
        { type: 'fci', ticker: 'COME', market_currency: 'ARS', purchase_currency: 'ARS' },
        { type: 'stock_us', ticker: 'AAPL', market_currency: 'USD', purchase_currency: 'USD' },
      ],
      { fciBudgetMs: 20_000 }
    );
    const yahooSymbols = mocks.yahoo.mock.calls.flatMap((call) => call[0] as string[]);
    expect(yahooSymbols).toContain('AAPL');
    expect(yahooSymbols).not.toContain('COME.BA');
  });
});
