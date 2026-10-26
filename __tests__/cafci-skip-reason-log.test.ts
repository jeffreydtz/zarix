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
import { civilYmdToNavIso, freshFciNavIso, shiftBusinessDays } from '@/lib/market-data/fci-nav-freshness';
import { civilTodayYmd } from '@/lib/transaction-date';

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
  it('logs IOL panel stage when the CAFCI fallback is what failed', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mocks.fci.mockRejectedValue(Object.assign(new Error('IOL panel 403'), {
      name: 'IolFciHttpError', status: 403, stage: 'iol',
    }));
    await refreshQuotesForInvestments([IOLDOLD]);
    expect(skipLogs(warn)).toEqual([{
      ticker: 'IOLDOLD', reason: 'IOL panel 403', status: 403, stage: 'iol', source: 'iol',
    }]);
  });

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
    expect(skipLogs(warn)).toEqual([{ ticker: 'IOLDOLD', reason: 'non_positive_price', source: 'cafci' }]);
  });

  it('logs undated IOL instead of stamping fetch time', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mocks.fci.mockResolvedValue({
      ticker: 'IOLDOLD', price: 1.1, currency: 'USD', changePct: 0.15, timestamp: null, source: 'iol',
    });
    const map = await refreshQuotesForInvestments([{ ...IOLDOLD, current_price: 1.09 }]);
    expect(map.get(quoteCacheKey('fci', 'IOLDOLD', 'USD'))).toBeUndefined();
    expect(skipLogs(warn)).toEqual([expect.objectContaining({
      ticker: 'IOLDOLD', reason: 'undated', source: 'iol', stage: 'iol',
    })]);
  });

  it('logs stale_nav for an old CAFCI Valores al date', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mocks.fci.mockResolvedValue({
      ticker: 'IOLDOLD', price: 1.098, currency: 'USD', changePct: null,
      timestamp: '2025-01-06T03:00:00.000Z', source: 'cafci',
    });
    await refreshQuotesForInvestments([{ ...IOLDOLD, current_price: 1.09 }]);
    expect(skipLogs(warn)).toEqual([expect.objectContaining({
      ticker: 'IOLDOLD', reason: 'stale_nav', source: 'cafci',
    })]);
  });

  it('keeps CAFCI and IOL stages on a combined failure', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mocks.fci.mockRejectedValue(Object.assign(new Error('CAFCI unparseable_ficha; IOL panel 403'), {
      name: 'FciCombinedError',
      cafciReason: 'CAFCI unparseable_ficha',
      iolReason: 'IOL panel 403',
      cafciStage: 'ficha',
      iolStage: 'iol',
      iolStatus: 403,
      stage: 'iol',
      status: 403,
    }));
    await refreshQuotesForInvestments([IOLDOLD]);
    expect(skipLogs(warn)).toEqual([expect.objectContaining({
      ticker: 'IOLDOLD',
      reason: 'CAFCI unparseable_ficha; IOL panel 403',
      stage: 'iol',
      status: 403,
      cafciStage: 'ficha',
      iolStage: 'iol',
      source: 'iol',
    })]);
  });
});

describe('IOL quotes never persist through the band or a newer CAFCI store', () => {
  it('skips an IOL price 1000x the stored NAV', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mocks.fci.mockResolvedValue({
      ticker: 'IOLDOLD', price: 1090, currency: 'USD', changePct: null,
      timestamp: freshFciNavIso(), source: 'iol',
    });
    const map = await refreshQuotesForInvestments([{ ...IOLDOLD, current_price: 1.09 }]);
    expect(map.size).toBe(0);
    expect(warn).toHaveBeenCalledWith('[quotes] skip FCI price', expect.objectContaining({
      reason: 'fci_implausible',
      source: 'iol',
      candidate: 1090,
    }));
  });

  it('does not let dated IOL replace a newer stored CAFCI timestamp', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const stored = freshFciNavIso();
    const older = civilYmdToNavIso(
      shiftBusinessDays(civilTodayYmd('America/Argentina/Buenos_Aires'), -2)
    );
    mocks.fci.mockResolvedValue({
      ticker: 'IOLDOLD', price: 1.10, currency: 'USD', changePct: null,
      timestamp: older, source: 'iol',
    });
    const map = await refreshQuotesForInvestments([{
      ...IOLDOLD, current_price: 1.09, current_price_updated_at: stored,
    }]);
    expect(map.size).toBe(0);
    expect(skipLogs(warn)).toEqual([expect.objectContaining({
      reason: 'older_than_stored',
      source: 'iol',
    })]);
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

  it('keeps CAFCI and IOL diagnostics from a combined error', () => {
    expect(describeFciFetchError(Object.assign(new Error('CAFCI catalog 401; IOL panel 403'), {
      name: 'FciCombinedError',
      cafciReason: 'CAFCI catalog 401',
      iolReason: 'IOL panel 403',
      cafciStage: 'catalog',
      iolStage: 'iol',
      status: 403,
      stage: 'iol',
    }))).toMatchObject({
      reason: 'CAFCI catalog 401; IOL panel 403',
      stage: 'iol',
      status: 403,
      cafciStage: 'catalog',
      iolStage: 'iol',
    });
  });
});
