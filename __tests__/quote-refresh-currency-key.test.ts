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
    const map = await refreshQuotesForInvestments([
      { type: 'cedear', ticker: 'IBM', market_currency: 'USD', purchase_currency: 'USD' },
    ]);
    expect(map.get(quoteCacheKey('cedear', 'IBM', 'USD'))).toBeUndefined();
    expect(warn).toHaveBeenCalled();
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

  it('keeps a USD FCI cuotaparte when CAFCI omits moneda instead of dividing by MEP', async () => {
    mocks.fci.mockResolvedValue({
      ticker: 'IOLDOLD', price: 1.098, currency: null, changePct: null, timestamp: null, source: 'cafci',
    });
    const map = await refreshQuotesForInvestments([
      { type: 'fci', ticker: 'IOLDOLD', market_currency: 'USD', purchase_currency: 'USD' },
    ]);
    const hit = map.get(quoteCacheKey('fci', 'IOLDOLD', 'USD'));
    expect(hit?.currency).toBe('USD');
    expect(hit?.price).toBeCloseTo(1.098, 8);
    expect(hit?.price).not.toBeCloseTo(1.098 / 1300, 8);
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

  it('skips an FCI update when CAFCI and the position disagree on currency', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mocks.fci.mockResolvedValue({
      ticker: 'IOLDOLD', price: 1.098, currency: 'USD', changePct: null, timestamp: null, source: 'cafci',
    });
    const map = await refreshQuotesForInvestments([
      { type: 'fci', ticker: 'IOLDOLD', market_currency: 'ARS', purchase_currency: 'ARS' },
    ]);
    expect(map.get(quoteCacheKey('fci', 'IOLDOLD', 'ARS'))).toBeUndefined();
    expect(warn).toHaveBeenCalled();
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
    expect(warn.mock.calls.some((call) => String(call[0]).includes('403'))).toBe(true);
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

  it('skips GLD when Yahoo omits the quote currency instead of inferring from the ticker', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mocks.yahoo.mockResolvedValue(new Map([
      ['GLD', { ticker: 'GLD', name: 'SPDR Gold', price: 380.12, changePct: 0.4, currency: '' }],
    ]));
    const map = await refreshQuotesForInvestments([
      { type: 'etf', ticker: 'GLD', market_currency: 'USD', purchase_currency: 'USD' },
    ]);
    expect(map.get(quoteCacheKey('etf', 'GLD', 'USD'))).toBeUndefined();
    expect(warn).toHaveBeenCalled();
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

describe('FCI Yahoo fallback stays inside the FCI budget', () => {
  it('does not send failed FCIs to Yahoo after the FCI budget elapses', async () => {
    mocks.fci.mockResolvedValue(null);
    await refreshQuotesForInvestments(
      [
        { type: 'fci', ticker: 'COME', market_currency: 'ARS', purchase_currency: 'ARS' },
        { type: 'stock_us', ticker: 'AAPL', market_currency: 'USD', purchase_currency: 'USD' },
      ],
      { fciBudgetMs: 0 }
    );
    const yahooSymbols = mocks.yahoo.mock.calls.flatMap((call) => call[0] as string[]);
    expect(yahooSymbols).toContain('AAPL');
    expect(yahooSymbols).not.toContain('COME.BA');
  });

  it('uses Yahoo for failed FCIs only while the shared FCI budget remains', async () => {
    mocks.fci.mockResolvedValue(null);
    await refreshQuotesForInvestments(
      [
        { type: 'fci', ticker: 'COME', market_currency: 'ARS', purchase_currency: 'ARS' },
        { type: 'stock_us', ticker: 'AAPL', market_currency: 'USD', purchase_currency: 'USD' },
      ],
      { fciBudgetMs: 20_000 }
    );
    expect(mocks.yahoo).toHaveBeenCalled();
    const fciCall = mocks.yahoo.mock.calls.find((call) => call[0].includes('COME.BA'));
    expect(fciCall?.[0]).toEqual(['COME.BA']);
    expect(fciCall?.[1]).toMatchObject({ deadlineAt: expect.any(Number) });
    const stockCall = mocks.yahoo.mock.calls.find((call) => call[0].includes('AAPL'));
    expect(stockCall?.[0]).toEqual(['AAPL']);
    expect(stockCall?.[1]).toBeUndefined();
  });
});
