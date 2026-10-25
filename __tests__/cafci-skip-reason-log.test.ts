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
  describeFciFetchError,
  quoteCacheKey,
  refreshQuotesForInvestments,
} from '@/lib/market-data/quote-refresh';

const IOLDOLD = { type: 'fci', ticker: 'IOLDOLD', market_currency: 'USD', purchase_currency: 'USD' } as const;

function skipLogs(warn: { mock: { calls: unknown[][] } }) {
  return warn.mock.calls
    .filter((call) => call[0] === '[quotes] skip CAFCI failure')
    .map((call) => call[1] as Record<string, unknown>);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.arg.mockResolvedValue({ byStock: new Map(), byCedear: new Map(), byBond: new Map(), byCorp: new Map() });
  mocks.dolar.mockResolvedValue({
    blue: { timestamp: new Date(), sell: 1300, buy: 1280 },
    mep: { timestamp: new Date(), sell: 1300, buy: 1280 },
  });
  mocks.yahoo.mockResolvedValue(new Map());
  mocks.stooq.mockResolvedValue(null);
  mocks.fci.mockResolvedValue(null);
  mocks.crypto.mockResolvedValue({ priceUSD: 0 });
});

afterEach(() => vi.restoreAllMocks());

describe('skip CAFCI failure log carries the reason', () => {
  it('logs HTTP status, stage and server for a ficha 401', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mocks.fci.mockRejectedValue(Object.assign(new Error('CAFCI ficha 401'), {
      name: 'CafciHttpError', status: 401, stage: 'ficha', server: 'awselb/2.0',
    }));
    const map = await refreshQuotesForInvestments([IOLDOLD]);
    expect(map.get(quoteCacheKey('fci', 'IOLDOLD', 'USD'))).toBeUndefined();
    expect(skipLogs(warn)).toEqual([{
      ticker: 'IOLDOLD', reason: 'CAFCI ficha 401', status: 401, stage: 'ficha', server: 'awselb/2.0',
    }]);
  });

  it('logs the client miss reason when fetchFciQuote returns null', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mocks.fci.mockImplementation(async (_t: string, onMiss?: (r: string) => void) => {
      onMiss?.('unparseable_ficha');
      return null;
    });
    await refreshQuotesForInvestments([IOLDOLD]);
    expect(skipLogs(warn)).toEqual([{ ticker: 'IOLDOLD', reason: 'unparseable_ficha' }]);
  });

  it('defaults a bare null to no_match', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await refreshQuotesForInvestments([IOLDOLD]);
    expect(skipLogs(warn)).toEqual([{ ticker: 'IOLDOLD', reason: 'no_match' }]);
  });

  it('logs budget_exhausted when the FCI budget ran out before the fetch', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await refreshQuotesForInvestments([IOLDOLD], { fciBudgetMs: 0 });
    expect(mocks.fci).not.toHaveBeenCalled();
    expect(skipLogs(warn)).toEqual([{ ticker: 'IOLDOLD', reason: 'budget_exhausted' }]);
  });

  it('logs non_positive_price for a zero cuotaparte', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mocks.fci.mockResolvedValue({ ticker: 'IOLDOLD', price: 0, currency: 'USD', changePct: null, timestamp: null, source: 'cafci' });
    await refreshQuotesForInvestments([IOLDOLD]);
    expect(skipLogs(warn)).toEqual([{ ticker: 'IOLDOLD', reason: 'non_positive_price' }]);
  });
});

describe('describeFciFetchError', () => {
  it('caps long messages at 200 chars and flattens newlines', () => {
    const d = describeFciFetchError(new Error(`line1\nline2 ${'y'.repeat(400)}`));
    expect(d.reason.length).toBe(200);
    expect(d.reason).not.toMatch(/\n/);
  });

  it('handles non-Error rejections', () => {
    expect(describeFciFetchError('boom')).toEqual({ reason: 'boom' });
    expect(describeFciFetchError(undefined)).toEqual({ reason: 'error' });
    expect(describeFciFetchError({ status: 503 })).toEqual({ reason: 'error', status: 503 });
  });
});
