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
const emptyArg = () => ({
  byStock: new Map(),
  byCedear: new Map(),
  byBond: new Map(),
  byCorp: new Map(),
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.dolar.mockResolvedValue({ blue: { sell: MEP, buy: MEP }, mep: { sell: MEP, buy: MEP } });
  mocks.arg.mockResolvedValue(emptyArg());
  mocks.yahoo.mockResolvedValue(new Map());
  mocks.stooq.mockResolvedValue({
    ticker: 'STOOQ', name: 'stooq', price: 999, change: 0, changePct: 0, currency: 'USD',
  });
  mocks.fci.mockResolvedValue(null);
  mocks.crypto.mockResolvedValue({ priceUSD: 0 });
});

afterEach(() => vi.restoreAllMocks());

function pos(
  type: InvestmentType,
  ticker: string,
  market: string | null,
) {
  return { type, ticker, market_currency: market, purchase_currency: market };
}

describe('main Yahoo/data912 parity (AAPL, SPY, YPFD, IBM, AL30, YMCJO)', () => {
  it('AAPL with a whitespace-only Yahoo currency goes to Stooq at 131 like main', async () => {
    mocks.yahoo.mockResolvedValue(new Map([
      ['AAPL', { ticker: 'AAPL', name: 'Apple', price: 190, changePct: 1, currency: '   ' }],
    ]));
    mocks.stooq.mockResolvedValue({
      ticker: 'AAPL', name: 'Apple', price: 131, change: 0, changePct: 0, currency: 'USD',
    });
    const map = await refreshQuotesForInvestments([pos('stock_us', 'AAPL', 'USD')]);
    expect(map.get(quoteCacheKey('stock_us', 'AAPL', 'USD'))).toMatchObject({
      price: 131, currency: 'USD',
    });
  });

  it('YPFD.BA with a whitespace-only Yahoo currency is not applied, like main', async () => {
    mocks.yahoo.mockResolvedValue(new Map([
      ['YPFD.BA', { ticker: 'YPFD.BA', name: 'YPF', price: 42000, changePct: 0, currency: '   ' }],
    ]));
    const map = await refreshQuotesForInvestments([pos('stock_arg', 'YPFD', 'ARS')]);
    expect(map.get(quoteCacheKey('stock_arg', 'YPFD', 'ARS'))).toBeUndefined();
    expect(mocks.stooq).not.toHaveBeenCalled();
  });

  it('AAPL uses a Yahoo quote with a missing currency as USD, not the Stooq price', async () => {
    mocks.yahoo.mockResolvedValue(new Map([
      ['AAPL', { ticker: 'AAPL', name: 'Apple', price: 190, changePct: 1, currency: '' }],
    ]));
    const map = await refreshQuotesForInvestments([pos('stock_us', 'AAPL', 'USD')]);
    expect(map.get(quoteCacheKey('stock_us', 'AAPL', 'USD'))).toMatchObject({
      price: 190, currency: 'USD',
    });
    expect(mocks.stooq).not.toHaveBeenCalled();
  });

  it('AAPL keeps an explicit Yahoo EUR quote when the position is EUR', async () => {
    mocks.yahoo.mockResolvedValue(new Map([
      ['AAPL', { ticker: 'AAPL', name: 'Apple', price: 175, changePct: 0, currency: 'EUR' }],
    ]));
    const map = await refreshQuotesForInvestments([pos('stock_us', 'AAPL', 'EUR')]);
    expect(map.get(quoteCacheKey('stock_us', 'AAPL', 'EUR'))).toMatchObject({
      price: 175, currency: 'EUR',
    });
    expect(mocks.stooq).not.toHaveBeenCalled();
  });

  it('AAPL falls through to Stooq at the Stooq price when Yahoo misses', async () => {
    mocks.yahoo.mockResolvedValue(new Map());
    mocks.stooq.mockResolvedValue({
      ticker: 'AAPL', name: 'Apple', price: 188.5, change: 0, changePct: 0, currency: 'USD',
    });
    const map = await refreshQuotesForInvestments([pos('stock_us', 'AAPL', 'USD')]);
    expect(map.get(quoteCacheKey('stock_us', 'AAPL', 'USD'))).toMatchObject({
      price: 188.5, currency: 'USD',
    });
  });

  it('SPY etf uses a Yahoo quote with a missing currency as USD, not Stooq', async () => {
    mocks.yahoo.mockResolvedValue(new Map([
      ['SPY', { ticker: 'SPY', name: 'S&P 500', price: 520, changePct: 0.2, currency: '' }],
    ]));
    const map = await refreshQuotesForInvestments([pos('etf', 'SPY', 'USD')]);
    expect(map.get(quoteCacheKey('etf', 'SPY', 'USD'))).toMatchObject({
      price: 520, currency: 'USD',
    });
    expect(mocks.stooq).not.toHaveBeenCalled();
  });

  it('YPFD stays 42000 ARS from data912 like main', async () => {
    mocks.arg.mockResolvedValue({
      ...emptyArg(),
      byStock: new Map([['YPFD', { symbol: 'YPFD', price: 42000, changePct: 0, currency: 'ARS' }]]),
    });
    const map = await refreshQuotesForInvestments([pos('stock_arg', 'YPFD', 'ARS')]);
    expect(map.get(quoteCacheKey('stock_arg', 'YPFD', 'ARS'))).toMatchObject({
      price: 42000, currency: 'ARS',
    });
    expect(mocks.yahoo).not.toHaveBeenCalled();
  });

  it('YPFD.BA Yahoo with a missing currency is ARS when data912 misses', async () => {
    mocks.yahoo.mockResolvedValue(new Map([
      ['YPFD.BA', { ticker: 'YPFD.BA', name: 'YPF', price: 42000, changePct: 0, currency: '' }],
    ]));
    const map = await refreshQuotesForInvestments([pos('stock_arg', 'YPFD', 'ARS')]);
    expect(map.get(quoteCacheKey('stock_arg', 'YPFD', 'ARS'))).toMatchObject({
      price: 42000, currency: 'ARS',
    });
  });

  it('IBM with IBMD sibling prices the USD book at 92 like main', async () => {
    mocks.arg.mockResolvedValue({
      ...emptyArg(),
      byCedear: new Map([
        ['IBM', { symbol: 'IBM', price: 119600, changePct: 0, currency: 'ARS' }],
        ['IBMD', { symbol: 'IBMD', price: 92, changePct: 0, currency: 'ARS' }],
      ]),
    });
    const map = await refreshQuotesForInvestments([pos('cedear', 'IBM', 'USD')]);
    expect(map.get(quoteCacheKey('cedear', 'IBM', 'USD'))).toMatchObject({
      price: 92, currency: 'USD',
    });
  });

  it('AL30 dual board matches main ARS and USD books', async () => {
    mocks.arg.mockResolvedValue({
      ...emptyArg(),
      byBond: new Map([
        ['AL30', { symbol: 'AL30', price: 91000, changePct: 1, currency: 'ARS' }],
        ['AL30D', { symbol: 'AL30D', price: 92, changePct: 1, currency: 'ARS' }],
      ]),
    });
    const map = await refreshQuotesForInvestments([
      pos('bond', 'AL30', 'ARS'),
      pos('bond', 'AL30', 'USD'),
    ]);
    expect(map.get(quoteCacheKey('bond', 'AL30', 'ARS'))).toMatchObject({
      price: 91000, currency: 'ARS',
    });
    expect(map.get(quoteCacheKey('bond', 'AL30', 'USD'))).toMatchObject({
      price: 92, currency: 'USD',
    });
  });

  it('YMCJO=130000 / YMCJD=92 prices the ON as 130000 ARS like main', async () => {
    mocks.arg.mockResolvedValue({
      ...emptyArg(),
      byCorp: new Map([
        ['YMCJO', { symbol: 'YMCJO', price: 130000, changePct: 0, currency: 'ARS' }],
        ['YMCJD', { symbol: 'YMCJD', price: 92, changePct: 0, currency: 'ARS' }],
      ]),
    });
    const map = await refreshQuotesForInvestments([pos('on', 'YMCJO', 'ARS')]);
    expect(map.get(quoteCacheKey('on', 'YMCJO', 'ARS'))).toMatchObject({
      price: 130000, currency: 'ARS',
    });
    expect(map.get(quoteCacheKey('on', 'YMCJO', 'ARS'))?.price).not.toBe(92 * MEP);
  });
});
