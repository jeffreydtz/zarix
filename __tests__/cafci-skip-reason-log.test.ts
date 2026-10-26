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
  applyObservedRowMatch,
  applyObservedTimestampMatch,
  classifyAutomaticPriceZeroRows,
  describeFciFetchError,
  evaluateFciDailyJump,
  FCI_DAILY_JUMP_EPS,
  isAnomalousFutureTimestamp,
  monotonicCurrentPriceFilter,
  quoteCacheKey,
  refreshQuotesForInvestments,
  shouldPersistFciQuote,
} from '@/lib/market-data/quote-refresh';
import { fciJumpMaxAbs } from '@/lib/market-data/fci-daily-jump';
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
  vi.spyOn(console, 'error').mockImplementation(() => {});
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

  it('emits one fci_all_failed error when every FCI ticker fails with the same parse reason', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.fci.mockImplementation(async (_t: string, onMiss?: (r: string) => void) => {
      onMiss?.('unparseable_ficha');
      return null;
    });
    await refreshQuotesForInvestments([
      IOLDOLD,
      { type: 'fci', ticker: 'PRTAVAB', market_currency: 'ARS', purchase_currency: 'ARS' },
    ]);
    expect(skipLogs(warn)).toEqual([
      { ticker: 'IOLDOLD', reason: 'unparseable_ficha' },
      { ticker: 'PRTAVAB', reason: 'unparseable_ficha' },
    ]);
    expect(error).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalledWith('[quotes] fci_all_failed', {
      reason: 'unparseable_ficha',
      count: 2,
    });
  });

  it('does not emit fci_all_failed when one FCI parses', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    mocks.fci.mockImplementation(async (ticker: string, onMiss?: (r: string) => void) => {
      if (ticker === 'IOLDOLD') {
        return { ticker, price: 1.098, currency: 'USD', changePct: 0, timestamp: freshFciNavIso(), source: 'cafci' };
      }
      onMiss?.('unparseable_ficha');
      return null;
    });
    await refreshQuotesForInvestments([
      { ...IOLDOLD, current_price: 1.09 },
      { type: 'fci', ticker: 'PRTAVAB', market_currency: 'ARS', purchase_currency: 'ARS', current_price: 1240 },
    ]);
    expect(error).not.toHaveBeenCalledWith('[quotes] fci_all_failed', expect.anything());
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

  it('does not stamp a candidate over a future stored timestamp', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const candidate = freshFciNavIso();
    mocks.fci.mockResolvedValue({
      ticker: 'IOLDOLD', price: 1.098, currency: 'USD', changePct: null,
      timestamp: candidate, source: 'cafci',
    });
    const map = await refreshQuotesForInvestments([{
      ...IOLDOLD, current_price: 1.09, current_price_updated_at: '2099-01-01T03:00:00.000Z',
    }]);
    expect(map.size).toBe(0);
    expect(skipLogs(warn)).toEqual([expect.objectContaining({
      reason: 'future_stored',
      stored: '2099-01-01T03:00:00.000Z',
      candidate,
      source: 'cafci',
    })]);
    expect(skipLogs(warn)[0].appClock).toEqual(expect.any(String));
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

describe('FCI persist allowlist and monotonic filter', () => {
  it('persists only CAFCI quotes that carry a NAV timestamp', () => {
    expect(shouldPersistFciQuote({ source: 'cafci', timestamp: '2026-10-23T03:00:00.000Z' })).toBe(true);
    expect(shouldPersistFciQuote({ source: 'iol', timestamp: '2026-10-23T03:00:00.000Z' })).toBe(false);
    expect(shouldPersistFciQuote({ source: 'cafci', timestamp: null })).toBe(false);
    expect(shouldPersistFciQuote({ source: 'cafci', timestamp: '' })).toBe(false);
  });

  it('keeps the monotonic UPDATE filter on current_price_updated_at', () => {
    const filter = monotonicCurrentPriceFilter('2026-10-23T03:00:00.000Z');
    expect(filter).toBe([
      'current_price_updated_at.is.null',
      'current_price_updated_at.lt."2026-10-23T03:00:00.000Z"',
    ].join(','));
  });

  it('treats stored timestamps after today in Argentina civil time as future', () => {
    const now = Date.parse('2026-10-26T15:00:00.000Z');
    expect(isAnomalousFutureTimestamp('2026-10-26T20:00:00.000Z', now)).toBe(false);
    expect(isAnomalousFutureTimestamp('2026-10-27T03:00:00.000Z', now)).toBe(true);
    expect(isAnomalousFutureTimestamp('2099-01-01T03:00:00.000Z', now)).toBe(true);
  });
});

describe('FCI daily_jump per catalog fund type', () => {
  it('uses ±8% for money-market / renta fija / T+0 and ±25% otherwise', () => {
    expect(fciJumpMaxAbs('Mercado de Dinero', 1)).toBe(0.08);
    expect(fciJumpMaxAbs('Renta Fija', 2)).toBe(0.08);
    expect(fciJumpMaxAbs('Renta Variable', 0)).toBe(0.08);
    expect(fciJumpMaxAbs('Renta Variable', 1)).toBe(0.25);
    expect(fciJumpMaxAbs('Renta Mixta', 1)).toBe(0.25);
    expect(fciJumpMaxAbs(null, null)).toBe(0.25);
  });

  it('skips a 10% money-market jump vs a stored price ≤10 days old and logs the ratio', () => {
    const stored = '2026-10-23T03:00:00.000Z';
    const jump = evaluateFciDailyJump({
      candidate: 1.20,
      storedPrice: 1.09,
      storedTs: stored,
      nowMs: Date.parse('2026-10-26T15:00:00.000Z'),
      maxAbs: 0.08,
    });
    expect(jump).toMatchObject({ ok: false, reason: 'daily_jump', maxAbs: 0.08 });
    expect(jump.ratio).toBeCloseTo(1.20 / 1.09, 8);
  });

  it('accepts the same 10% move on an equity/CEDEAR band', () => {
    const jump = evaluateFciDailyJump({
      candidate: 1.20,
      storedPrice: 1.09,
      storedTs: '2026-10-23T03:00:00.000Z',
      nowMs: Date.parse('2026-10-26T15:00:00.000Z'),
      maxAbs: 0.25,
    });
    expect(jump.ok).toBe(true);
  });

  it('logs daily_jump with the ratio on refresh', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mocks.fci.mockResolvedValue({
      ticker: 'IOLDOLD',
      price: 1.20,
      currency: 'USD',
      changePct: null,
      timestamp: freshFciNavIso(),
      source: 'cafci',
      fundType: 'Mercado de Dinero',
      jumpMaxAbs: 0.08,
    });
    const map = await refreshQuotesForInvestments([{
      ...IOLDOLD,
      current_price: 1.09,
      current_price_updated_at: freshFciNavIso(),
    }]);
    expect(map.size).toBe(0);
    expect(skipLogs(warn)).toEqual([expect.objectContaining({
      reason: 'daily_jump',
      ticker: 'IOLDOLD',
      fundType: 'Mercado de Dinero',
      maxAbs: 0.08,
      stage: 'ficha',
    })]);
    expect((skipLogs(warn)[0].ratio as number)).toBeCloseTo(1.20 / 1.09, 8);
  });

  it('treats exactly +8% and −8% as inside the band', () => {
    const stored = '2026-10-23T03:00:00.000Z';
    const nowMs = Date.parse('2026-10-26T15:00:00.000Z');
    expect(evaluateFciDailyJump({
      candidate: 1.08, storedPrice: 1, storedTs: stored, nowMs, maxAbs: 0.08,
    }).ok).toBe(true);
    expect(evaluateFciDailyJump({
      candidate: 0.92, storedPrice: 1, storedTs: stored, nowMs, maxAbs: 0.08,
    }).ok).toBe(true);
    expect(evaluateFciDailyJump({
      candidate: 1 + 0.08 + 1e-9,
      storedPrice: 1, storedTs: stored, nowMs, maxAbs: 0.08,
    }).ok).toBe(true);
    expect(evaluateFciDailyJump({
      candidate: 1 + 0.08 + FCI_DAILY_JUMP_EPS * 2,
      storedPrice: 1, storedTs: stored, nowMs, maxAbs: 0.08,
    }).ok).toBe(false);
  });
});

describe('out_of_band freeze is logged, never auto-unfrozen', () => {
  it('logs out_of_band with ratio, stage and days since the last update', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const storedTs = '2026-10-16T03:00:00.000Z';
    mocks.fci.mockResolvedValue({
      ticker: 'IOLDOLD', price: 5, currency: 'USD', changePct: null,
      timestamp: freshFciNavIso(), source: 'cafci',
    });
    const map = await refreshQuotesForInvestments([{
      ...IOLDOLD, current_price: 1.09, current_price_updated_at: storedTs,
    }]);
    expect(map.size).toBe(0);
    expect(warn).toHaveBeenCalledWith('[quotes] skip FCI price', expect.objectContaining({
      reason: 'fci_implausible',
    }));
    const outOfBand = skipLogs(warn).find((row) => row.reason === 'out_of_band');
    expect(outOfBand).toMatchObject({
      reason: 'out_of_band',
      ticker: 'IOLDOLD',
      stage: 'ficha',
      source: 'cafci',
    });
    expect(outOfBand?.ratio as number).toBeCloseTo(5 / 1.09, 8);
    expect(outOfBand?.daysSinceUpdate).toEqual(expect.any(Number));
    expect(outOfBand?.daysSinceUpdate as number).toBeGreaterThan(0);
  });
});

describe('future stored timestamps are never overwritten', () => {
  it('treats a 26/10 store as future when the app clock is 24/10, ignoring any Date header', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-24T12:00:00.000Z'));
    mocks.fci.mockResolvedValue({
      ticker: 'IOLDOLD', price: 1.11, currency: 'USD', changePct: null,
      timestamp: '2026-10-22T03:00:00.000Z', source: 'cafci',
      httpDate: 'Mon, 26 Oct 2026 12:00:00 GMT',
    });
    const map = await refreshQuotesForInvestments([{
      ...IOLDOLD, current_price: 1.12, current_price_updated_at: '2026-10-26T03:00:00.000Z',
    }]);
    expect(map.size).toBe(0);
    expect(skipLogs(warn)).toEqual([expect.objectContaining({
      reason: 'future_stored',
      stored: '2026-10-26T03:00:00.000Z',
      candidate: '2026-10-22T03:00:00.000Z',
      appClock: '2026-10-24T12:00:00.000Z',
    })]);
    vi.useRealTimers();
  });
});

describe('automatic writer row match', () => {
  it('conditions UPDATE on type, ticker, currency and is_manual_price', () => {
    const calls: Array<[string, unknown]> = [];
    const query = {
      eq(column: string, value: unknown) {
        calls.push([column, value]);
        return this;
      },
      is(column: string, value: null) {
        calls.push([column, value]);
        return this;
      },
    };
    applyObservedRowMatch(query, {
      type: 'fci', ticker: 'PRTAVAB', market_currency: 'ARS',
    });
    expect(calls).toEqual([
      ['type', 'fci'],
      ['is_manual_price', false],
      ['ticker', 'PRTAVAB'],
      ['market_currency', 'ARS'],
    ]);
  });

  it('matches the raw observed ticker and currency, including blank and spaced values', () => {
    const calls: Array<[string, unknown]> = [];
    const query = {
      eq(column: string, value: unknown) {
        calls.push([column, value]);
        return this;
      },
      is(column: string, value: null) {
        calls.push([column, value]);
        return this;
      },
    };
    applyObservedTimestampMatch(
      applyObservedRowMatch(query, {
        type: 'stock_arg', ticker: 'ggal', market_currency: ' USD ',
      }),
      '2026-10-23T03:00:00.000Z',
    );
    expect(calls).toEqual([
      ['type', 'stock_arg'],
      ['is_manual_price', false],
      ['ticker', 'ggal'],
      ['market_currency', ' USD '],
      ['current_price_updated_at', '2026-10-23T03:00:00.000Z'],
    ]);
    calls.length = 0;
    applyObservedTimestampMatch(
      applyObservedRowMatch(query, {
        type: 'crypto', ticker: null, market_currency: '',
      }),
      null,
    );
    expect(calls).toEqual([
      ['type', 'crypto'],
      ['is_manual_price', false],
      ['ticker', null],
      ['market_currency', ''],
      ['current_price_updated_at', null],
    ]);
    calls.length = 0;
    applyObservedRowMatch(query, {
      type: 'bond', ticker: 'AL30', market_currency: null,
    });
    expect(calls).toEqual([
      ['type', 'bond'],
      ['is_manual_price', false],
      ['ticker', 'AL30'],
      ['market_currency', null],
    ]);
  });

  it('classifies an identity mismatch as row_changed instead of older_than_stored', () => {
    expect(classifyAutomaticPriceZeroRows({
      observed: { type: 'fci', ticker: 'PRTAVAB', market_currency: 'ARS' },
      winning: { type: 'bond', ticker: 'PRTAVAB', market_currency: 'ARS', is_manual_price: false },
    })).toBe('row_changed');
    expect(classifyAutomaticPriceZeroRows({
      observed: { type: 'stock_arg', ticker: 'GGAL', market_currency: 'ARS' },
      winning: { type: 'fci', ticker: 'GGAL', market_currency: 'ARS', is_manual_price: false },
    })).toBe('row_changed');
    expect(classifyAutomaticPriceZeroRows({
      observed: { type: 'fci', ticker: 'PRTAVAB', market_currency: 'ARS' },
      winning: { type: 'fci', ticker: 'PRTAVAB', market_currency: 'ARS', is_manual_price: false },
    })).toBe('older_than_stored');
    expect(classifyAutomaticPriceZeroRows({
      observed: { type: 'stock_arg', ticker: 'GGAL', market_currency: 'usd' },
      winning: { type: 'stock_arg', ticker: 'GGAL', market_currency: 'USD', is_manual_price: false },
    })).toBe('row_changed');
  });

  it('classifies a concurrently introduced future timestamp as future_stored', () => {
    const now = Date.parse('2026-10-26T15:00:00.000Z');
    expect(classifyAutomaticPriceZeroRows({
      observed: {
        type: 'stock_us', ticker: 'AAPL', market_currency: 'USD',
        current_price_updated_at: '2026-10-20T15:00:00.000Z',
      },
      winning: {
        type: 'stock_us', ticker: 'AAPL', market_currency: 'USD', is_manual_price: false,
        current_price_updated_at: '2099-01-01T03:00:00.000Z',
      },
      nowMs: now,
    })).toBe('future_stored');
    expect(classifyAutomaticPriceZeroRows({
      observed: {
        type: 'fci', ticker: 'PRTAVAB', market_currency: 'ARS',
        current_price_updated_at: '2026-10-23T03:00:00.000Z',
      },
      winning: {
        type: 'fci', ticker: 'PRTAVAB', market_currency: 'ARS', is_manual_price: false,
        current_price_updated_at: '2099-01-01T03:00:00.000Z',
      },
      nowMs: now,
    })).toBe('future_stored');
    expect(classifyAutomaticPriceZeroRows({
      observed: {
        type: 'stock_us', ticker: 'AAPL', market_currency: 'USD',
        current_price_updated_at: '2026-10-20T15:00:00.000Z',
      },
      winning: {
        type: 'stock_us', ticker: 'AAPL', market_currency: 'USD', is_manual_price: false,
        current_price_updated_at: '2026-10-26T18:00:00.000Z',
      },
      nowMs: now,
    })).toBe('older_than_stored');
  });
});
