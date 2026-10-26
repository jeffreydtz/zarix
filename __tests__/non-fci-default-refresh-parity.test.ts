import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { InvestmentType } from '@/types/database';
import { isAnomalousFutureTimestamp } from '@/lib/market-data/quote-refresh';
import {
  QUOTE_REFRESH_MS,
  shouldRefreshQuoteByAge,
} from '@/lib/services/investments';

const mocks = vi.hoisted(() => ({
  dolar: vi.fn(), fci: vi.fn(), arg: vi.fn(), yahoo: vi.fn(), stooq: vi.fn(),
  crypto: vi.fn(), from: vi.fn(),
  positions: [] as Array<Record<string, unknown>>,
  updates: [] as Array<Record<string, unknown>>,
  timestampCas: [] as Array<{ column: string; value: unknown; op: 'eq' | 'is' }>,
  selectData: [{ id: 'ok' }] as Array<{ id: string }>,
}));

vi.mock('@/lib/market-data/data912-client', () => ({ loadArgentineQuotes: mocks.arg }));
vi.mock('@/lib/services/cotizaciones', () => ({ cotizacionesService: {
  getDolarQuotes: mocks.dolar, getCryptoQuote: mocks.crypto,
  getExchangeRate: vi.fn().mockRejectedValue(new Error('fixture unavailable')),
} }));
vi.mock('@/lib/yahoo-finance-quotes', () => ({ fetchYahooStockQuotesMap: mocks.yahoo }));
vi.mock('@/lib/stooq-us-quote', () => ({ fetchStooqUsQuote: mocks.stooq }));
vi.mock('@/lib/market-data/cafci-client', () => ({ fetchFciQuote: mocks.fci }));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'fixture-user' } } }) } }),
  createServiceClientSync: () => ({ from: mocks.from }),
}));

import { investmentsService } from '@/lib/services/investments';

const NON_FCI: InvestmentType[] = ['stock_us', 'stock_arg', 'etf', 'cedear', 'bond', 'on', 'crypto'];

function metaFor(type: InvestmentType, idx: number): { ticker: string; currency: string } {
  switch (type) {
    case 'stock_us': return { ticker: `US${idx}`, currency: 'USD' };
    case 'stock_arg': return { ticker: `AR${idx}`, currency: 'ARS' };
    case 'etf': return { ticker: `ET${idx}`, currency: 'USD' };
    case 'cedear': return { ticker: `CD${idx}`, currency: 'ARS' };
    case 'bond': return { ticker: `BN${idx}`, currency: 'ARS' };
    case 'on': return { ticker: `ON${idx}`, currency: 'ARS' };
    case 'crypto': return { ticker: `CR${idx}`, currency: 'USD' };
    default: return { ticker: `X${idx}`, currency: 'USD' };
  }
}

/** Literal `origin/main` body of the default-mode refresh filter. */
function mainShouldRefresh(
  inv: { ticker: string | null; is_manual_price: boolean; current_price_updated_at: string | null },
  options: { forceRefreshQuotes?: boolean } | undefined,
  now: number,
): boolean {
  if (!inv.ticker) return false;
  if (inv.is_manual_price) return false;
  if (options?.forceRefreshQuotes) return true;
  const lastUpdatedAt = inv.current_price_updated_at
    ? new Date(inv.current_price_updated_at).getTime()
    : 0;
  return !lastUpdatedAt || now - lastUpdatedAt > QUOTE_REFRESH_MS;
}

function argQuote(symbol: string, currency = 'ARS') {
  return { symbol, price: 110, changePct: 1, currency, timestamp: '2026-10-26T15:00:00.000Z' };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  mocks.updates = [];
  mocks.timestampCas = [];
  mocks.selectData = [{ id: 'ok' }];
  mocks.positions = [];
  mocks.dolar.mockResolvedValue({
    blue: { timestamp: new Date(), sell: 1300, buy: 1280 },
    mep: { timestamp: new Date(), sell: 1300, buy: 1280 },
  });
  mocks.fci.mockResolvedValue(null);
  mocks.yahoo.mockImplementation(async (symbols: string[]) => new Map(
    symbols.map((symbol) => [symbol, {
      ticker: symbol, name: symbol, price: 200, changePct: 1, currency: 'USD',
      timestamp: '2026-10-26T15:00:00.000Z',
    }]),
  ));
  mocks.stooq.mockResolvedValue({
    ticker: 'STOOQ', name: 'stooq', price: 199, change: 0, changePct: 0, currency: 'USD',
    timestamp: '2026-10-26T15:00:00.000Z',
  });
  mocks.crypto.mockResolvedValue({
    priceUSD: 100000, change24h: 1, timestamp: new Date('2026-10-26T15:00:00.000Z'),
  });
  mocks.arg.mockResolvedValue({
    byStock: new Map(),
    byCedear: new Map(),
    byBond: new Map(),
    byCorp: new Map(),
  });
  mocks.from.mockImplementation((table: string) => {
    const builder: {
      select: () => typeof builder;
      eq: () => typeof builder;
      in: () => typeof builder;
      order: () => typeof builder;
      gte: () => typeof builder;
      update: (payload: Record<string, unknown>) => unknown;
      then: (resolve: (value: unknown) => unknown) => unknown;
    } = {
      select: () => builder,
      eq: () => builder,
      in: () => builder,
      order: () => builder,
      gte: () => builder,
      update: (payload: Record<string, unknown>) => {
        const chain: {
          eq: (column: string, value: unknown) => typeof chain;
          is: (column: string, value: null) => typeof chain;
          or: () => typeof chain;
          select: () => Promise<{ error: null; data: Array<{ id: string }> }>;
        } = {
          eq: (column, value) => {
            if (column === 'id') mocks.updates.push({ ...payload, id: value });
            if (column === 'current_price_updated_at') {
              mocks.timestampCas.push({ column, value, op: 'eq' });
            }
            return chain;
          },
          is: (column, value) => {
            if (column === 'current_price_updated_at') {
              mocks.timestampCas.push({ column, value, op: 'is' });
            }
            return chain;
          },
          or: () => chain,
          select: async () => ({ error: null, data: mocks.selectData }),
        };
        return chain;
      },
      then: (resolve: (value: unknown) => unknown) => Promise.resolve(resolve({
        data: table === 'investments' ? mocks.positions : [],
        error: null,
      })),
    };
    return builder;
  });
});

afterEach(() => { vi.restoreAllMocks(); });

function row(opts: {
  id: string;
  type: InvestmentType;
  ts: string | null;
  idx: number;
  manual?: boolean;
  ticker?: string | null;
}) {
  const meta = metaFor(opts.type, opts.idx);
  return {
    id: opts.id,
    user_id: 'fixture-user',
    account_id: 'fixture-account',
    type: opts.type,
    name: `${opts.type} ${opts.id}`,
    ticker: opts.ticker === undefined ? meta.ticker : opts.ticker,
    market_currency: meta.currency,
    purchase_currency: meta.currency,
    current_price: 100,
    purchase_price: 100,
    quantity: 1,
    is_manual_price: Boolean(opts.manual),
    current_price_updated_at: opts.ts,
  };
}

function seedArgentineQuotes(positions: Array<ReturnType<typeof row>>) {
  const byStock = new Map<string, ReturnType<typeof argQuote>>();
  const byCedear = new Map<string, ReturnType<typeof argQuote>>();
  const byBond = new Map<string, ReturnType<typeof argQuote>>();
  const byCorp = new Map<string, ReturnType<typeof argQuote>>();
  for (const inv of positions) {
    const ticker = inv.ticker;
    if (!ticker) continue;
    if (inv.type === 'stock_arg') byStock.set(ticker, argQuote(ticker));
    if (inv.type === 'cedear') byCedear.set(ticker, argQuote(ticker));
    if (inv.type === 'bond') byBond.set(ticker, argQuote(ticker));
    if (inv.type === 'on') byCorp.set(ticker, argQuote(ticker));
  }
  mocks.arg.mockResolvedValue({ byStock, byCedear, byBond, byCorp });
}

describe('non-FCI default refresh is byte-for-byte main', () => {
  it('shouldRefreshQuoteByAge matches origin/main for every timestamp class', () => {
    const now = Date.parse('2026-10-26T15:00:00.000Z');
    const samples: Array<{ ticker: string | null; is_manual_price: boolean; current_price_updated_at: string | null }> = [
      { ticker: null, is_manual_price: false, current_price_updated_at: null },
      { ticker: 'AAPL', is_manual_price: true, current_price_updated_at: null },
      { ticker: 'AAPL', is_manual_price: false, current_price_updated_at: null },
      { ticker: 'AAPL', is_manual_price: false, current_price_updated_at: new Date(now - 60_000).toISOString() },
      { ticker: 'AAPL', is_manual_price: false, current_price_updated_at: new Date(now - QUOTE_REFRESH_MS).toISOString() },
      { ticker: 'AAPL', is_manual_price: false, current_price_updated_at: new Date(now - QUOTE_REFRESH_MS - 1).toISOString() },
      { ticker: 'AAPL', is_manual_price: false, current_price_updated_at: '2099-01-01T03:00:00.000Z' },
      { ticker: 'AAPL', is_manual_price: false, current_price_updated_at: new Date(now + 3_600_000).toISOString() },
      { ticker: 'AAPL', is_manual_price: false, current_price_updated_at: 'not-a-date' },
    ];
    for (const options of [undefined, { forceRefreshQuotes: true }, { forceRefreshQuotes: false }]) {
      for (const inv of samples) {
        expect(shouldRefreshQuoteByAge(inv, options, now)).toBe(mainShouldRefresh(inv, options, now));
      }
    }
    expect(isAnomalousFutureTimestamp('2099-01-01T03:00:00.000Z', now)).toBe(true);
    expect(shouldRefreshQuoteByAge({
      ticker: 'AAPL', is_manual_price: false, current_price_updated_at: '2099-01-01T03:00:00.000Z',
    }, undefined, now)).toBe(false);
  });

  it('default-mode non-FCI write set equals main across 7 types', async () => {
    const now = Date.now();
    const stamps = [
      null,
      new Date(now - 60_000).toISOString(),
      new Date(now - QUOTE_REFRESH_MS).toISOString(),
      new Date(now - QUOTE_REFRESH_MS - 1).toISOString(),
      '2099-01-01T03:00:00.000Z',
      new Date(now + 3_600_000).toISOString(),
    ] as const;
    const positions = NON_FCI.flatMap((type, typeIdx) => stamps.map((ts, tsIdx) => row({
      id: `00000000-0000-4000-8000-${String(typeIdx * 10 + tsIdx).padStart(12, '0')}`,
      type,
      ts,
      idx: typeIdx * 10 + tsIdx,
    })));
    mocks.positions = positions;
    seedArgentineQuotes(positions);
    await investmentsService.list('fixture-user');
    const written = [...new Set(mocks.updates.map((item) => String(item.id)))].sort();
    const mainIds = positions
      .filter((inv) => mainShouldRefresh(inv, undefined, Date.now()))
      .map((inv) => inv.id)
      .sort();
    const prExtraVsMain = written.filter((id) => !mainIds.includes(id));
    expect(prExtraVsMain).toEqual([]);
    expect(written).toEqual(mainIds);
    expect(mainIds.length).toBeGreaterThan(0);
    expect(written).not.toContain('00000000-0000-4000-8000-000000000004');
    expect(mocks.timestampCas).toHaveLength(written.length);
  });

  it('forceRefreshQuotes still refreshes every non-manual ticker and keeps timestamp CAS', async () => {
    const now = Date.parse('2026-10-26T15:00:00.000Z');
    const positions = [
      ...NON_FCI.map((type, idx) => row({
        id: `00000000-0000-4000-8000-${String(idx).padStart(12, '0')}`,
        type,
        ts: '2099-01-01T03:00:00.000Z',
        idx,
      })),
      row({
        id: '00000000-0000-4000-8000-000000000020',
        type: 'stock_us',
        ts: null,
        idx: 20,
        manual: true,
      }),
      row({
        id: '00000000-0000-4000-8000-000000000021',
        type: 'crypto',
        ts: null,
        idx: 21,
        ticker: null,
      }),
    ];
    mocks.positions = positions;
    seedArgentineQuotes(positions);
    await investmentsService.list('fixture-user', { forceRefreshQuotes: true });
    const written = [...new Set(mocks.updates.map((item) => String(item.id)))].sort();
    const expected = positions
      .filter((inv) => mainShouldRefresh(inv, { forceRefreshQuotes: true }, now))
      .map((inv) => inv.id)
      .sort();
    expect(written).toEqual(expected);
    expect(written).toHaveLength(NON_FCI.length);
    expect(mocks.timestampCas).toHaveLength(written.length);
  });
});
