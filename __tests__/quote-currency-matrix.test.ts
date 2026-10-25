import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { InvestmentType } from '@/types/database';

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

import { quoteCacheKey, refreshQuotesForInvestments } from '@/lib/market-data/quote-refresh';

const MEP = 1300;

type Book = 'stock' | 'cedear' | 'bond' | 'on';
type FeedRow = [symbol: string, price: number, currency: string];

function index(book: Book, rows: FeedRow[]) {
  const empty = () => new Map();
  const map = new Map(rows.map(([symbol, price, currency]) => [
    symbol,
    { symbol, price, changePct: 0, currency },
  ]));
  return {
    byStock: book === 'stock' ? map : empty(),
    byCedear: book === 'cedear' ? map : empty(),
    byBond: book === 'bond' ? map : empty(),
    byCorp: book === 'on' ? map : empty(),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  mocks.dolar.mockResolvedValue({ blue: { timestamp: new Date(), sell: MEP, buy: MEP  }, mep: { timestamp: new Date(), sell: MEP, buy: MEP  } });
  mocks.yahoo.mockResolvedValue(new Map());
  mocks.stooq.mockResolvedValue(null);
  mocks.fci.mockResolvedValue(null);
  mocks.crypto.mockResolvedValue({ priceUSD: 100000, change24h: 1 });
});

afterEach(() => vi.restoreAllMocks());

describe('ticker × position currency × source currency', () => {
  const cases: Array<{
    ticker: string;
    type: InvestmentType;
    position: 'ARS' | 'USD';
    book?: Book;
    listed?: FeedRow[];
    expected: { price: number; currency: string } | null;
  }> = [
    { ticker: 'AMD', type: 'cedear', position: 'ARS', book: 'cedear', listed: [['AMD', 10000, 'ARS']], expected: { price: 10000, currency: 'ARS' } },
    { ticker: 'MCD', type: 'cedear', position: 'ARS', book: 'cedear', listed: [['MCD', 10000, 'ARS']], expected: { price: 10000, currency: 'ARS' } },
    { ticker: 'HD', type: 'cedear', position: 'ARS', book: 'cedear', listed: [['HD', 10000, 'ARS']], expected: { price: 10000, currency: 'ARS' } },
    { ticker: 'C', type: 'cedear', position: 'ARS', book: 'cedear', listed: [['C', 10000, 'ARS']], expected: { price: 10000, currency: 'ARS' } },
    { ticker: 'BAC', type: 'cedear', position: 'ARS', book: 'cedear', listed: [['BAC', 10000, 'ARS']], expected: { price: 10000, currency: 'ARS' } },
    { ticker: 'CARC', type: 'stock_arg', position: 'ARS', book: 'stock', listed: [['CARC', 10000, 'ARS']], expected: { price: 10000, currency: 'ARS' } },
    { ticker: 'YPFD', type: 'stock_arg', position: 'ARS', book: 'stock', listed: [['YPFD', 42000, 'ARS']], expected: { price: 42000, currency: 'ARS' } },
    { ticker: 'YPFD', type: 'stock_arg', position: 'USD', book: 'stock', listed: [['YPFD', 42000, 'ARS']], expected: { price: 42000 / MEP, currency: 'USD' } },
    { ticker: 'YPF', type: 'cedear', position: 'ARS', book: 'cedear', listed: [['YPF', 42000, 'ARS']], expected: { price: 42000, currency: 'ARS' } },
    { ticker: 'GGAL', type: 'stock_arg', position: 'ARS', book: 'stock', listed: [['GGAL', 91000, 'ARS']], expected: { price: 91000, currency: 'ARS' } },
    { ticker: 'AL30', type: 'bond', position: 'ARS', book: 'bond', listed: [['AL30', 91000, 'ARS'], ['AL30D', 92, 'ARS']], expected: { price: 91000, currency: 'ARS' } },
    { ticker: 'AL30', type: 'bond', position: 'USD', book: 'bond', listed: [['AL30', 91000, 'ARS'], ['AL30D', 92, 'ARS']], expected: { price: 92, currency: 'USD' } },
    { ticker: 'AL30D', type: 'bond', position: 'USD', book: 'bond', listed: [['AL30D', 92, 'ARS']], expected: { price: 92, currency: 'USD' } },
    { ticker: 'IBM', type: 'cedear', position: 'ARS', book: 'cedear', listed: [['IBM', 10000, 'ARS']], expected: { price: 10000, currency: 'ARS' } },
    { ticker: 'IBM', type: 'cedear', position: 'USD', book: 'cedear', listed: [['IBM', 119600, 'ARS'], ['IBMD', 92, 'ARS']], expected: { price: 92, currency: 'USD' } },
    { ticker: 'IBM', type: 'cedear', position: 'USD', book: 'cedear', listed: [['IBMD', 92, 'ARS']], expected: null },
    { ticker: 'IBMD', type: 'cedear', position: 'USD', book: 'cedear', listed: [['IBMD', 92, 'ARS']], expected: null },
    { ticker: 'IBMD', type: 'cedear', position: 'USD', book: 'cedear', listed: [['IBMD', 92, 'USD']], expected: { price: 92, currency: 'USD' } },
    { ticker: 'YMCJO', type: 'on', position: 'ARS', book: 'on', listed: [['YMCJO', 130000, 'ARS'], ['YMCJD', 92, 'ARS']], expected: { price: 130000, currency: 'ARS' } },
    { ticker: 'TX26', type: 'bond', position: 'ARS', book: 'bond', listed: [['TX26', 10000, 'ARS']], expected: { price: 10000, currency: 'ARS' } },
    { ticker: 'DICP', type: 'bond', position: 'ARS', book: 'bond', listed: [['DICP', 10000, 'ARS']], expected: { price: 10000, currency: 'ARS' } },
    { ticker: 'S31O6', type: 'bond', position: 'ARS', book: 'bond', listed: [['S31O6', 10000, 'ARS']], expected: { price: 10000, currency: 'ARS' } },
    { ticker: 'T15D6', type: 'bond', position: 'ARS', book: 'bond', listed: [['T15D6', 10000, 'ARS']], expected: { price: 10000, currency: 'ARS' } },
    { ticker: 'AAPL', type: 'cedear', position: 'ARS', book: 'cedear', listed: [['AAPL', 10000, 'ARS']], expected: { price: 10000, currency: 'ARS' } },
    { ticker: 'AAPL', type: 'cedear', position: 'USD', book: 'cedear', listed: [['AAPL', 119600, 'ARS'], ['AAPLD', 92, 'ARS']], expected: { price: 92, currency: 'USD' } },
    { ticker: 'BTC', type: 'crypto', position: 'USD', expected: { price: 100000, currency: 'USD' } },
    { ticker: 'GLD', type: 'cedear', position: 'ARS', book: 'cedear', listed: [['GLD', 52000, 'ARS']], expected: { price: 52000, currency: 'ARS' } },
    { ticker: 'GLD', type: 'cedear', position: 'USD', book: 'cedear', listed: [['GLD', 52000, 'ARS']], expected: { price: 52000 / MEP, currency: 'USD' } },
  ];

  it.each(cases)('$ticker $position from $listed', async (entry) => {
    mocks.arg.mockResolvedValue(index(entry.book ?? 'stock', entry.listed ?? []));
    const map = await refreshQuotesForInvestments([
      {
        type: entry.type,
        ticker: entry.ticker,
        market_currency: entry.position,
        purchase_currency: entry.position,
      },
    ]);
    const hit = map.get(quoteCacheKey(entry.type, entry.ticker, entry.position));
    if (entry.expected == null) {
      expect(hit).toBeUndefined();
      return;
    }
    expect(hit?.currency).toBe(entry.expected.currency);
    expect(hit?.price).toBeCloseTo(entry.expected.price, 8);
    if (entry.ticker === 'AMD' || entry.ticker === 'MCD' || entry.ticker === 'BAC') {
      expect(hit?.price).not.toBe(10000 * MEP);
    }
  });
});
