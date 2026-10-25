import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  dolar: vi.fn(), fci: vi.fn(), arg: vi.fn(), yahoo: vi.fn(), stooq: vi.fn(),
  crypto: vi.fn(), from: vi.fn(), getUser: vi.fn(),
  positions: [] as Array<Record<string, unknown>>,
  updates: [] as Array<Record<string, unknown>>,
  snapshots: vi.fn(),
}));
vi.mock('@/lib/market-data/data912-client', () => ({ loadArgentineQuotes: mocks.arg }));
vi.mock('@/lib/services/cotizaciones', () => ({ cotizacionesService: {
  getDolarQuotes: mocks.dolar, getCryptoQuote: mocks.crypto,
  getExchangeRate: vi.fn().mockRejectedValue(new Error('fixture unavailable')),
} }));
vi.mock('@/lib/yahoo-finance-quotes', () => ({ fetchYahooStockQuotesMap: mocks.yahoo }));
vi.mock('@/lib/stooq-us-quote', () => ({ fetchStooqUsQuote: mocks.stooq }));
vi.mock('@/lib/market-data/cafci-client', () => ({ fetchFciQuote: mocks.fci }));
vi.mock('@/lib/observability/alert', () => ({ alertAdmin: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: mocks.getUser } }),
  createServiceClientSync: () => ({ from: mocks.from }),
}));

import { GET as cronGet } from '@/app/api/cron/update-prices/route';
import { GET as quoteGet } from '@/app/api/investments/quote/route';
import { investmentsService } from '@/lib/services/investments';
import { fciPricePlausible, fciPlausibilityAnchor } from '@/lib/market-data/quote-currency';

const cases = [
  ['IOLDOLD', 'USD', 'USD', 1.098, 1.09, true],
  ['IOLDOLD', 'USD', 'USD', 1.098, 0.3, false],
  ['IOLDOLD', 'USD', 'USD', 1.098, 5, false],
  ['ADCGLOA', 'USD', 'USD', 1.098, 0.3, false],
  ['CONIOLA', 'ARS', 'USD', 179.598, 0.135, true],
  ['CONIOLA', 'ARS', 'USD', 179.598, 1.40, false],
  ['PRTAVAB', 'ARS', 'ARS', 1241.954, 1240, true],
  ['PRTAVAB', 'ARS', 'ARS', 1241.954, 400, false],
  ['IOLDOLD', 'USD', 'USD', 1.098, null, true],
] as const;

function position(ticker = 'IOLDOLD', market = 'USD', anchor: number | null = 1.09) {
  return {
    id: 'fixture-position', user_id: 'fixture-user', account_id: 'fixture-account',
    type: 'fci', name: 'Fondo de fixture', ticker, market_currency: market,
    purchase_currency: market, current_price: anchor, purchase_price: anchor,
    quantity: 10, is_manual_price: false, current_price_updated_at: null,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('CRON_SECRET', 'fixture-cron-secret');
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('unexpected network')));
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  mocks.updates = [];
  mocks.positions = [position()];
  mocks.dolar.mockResolvedValue({
    blue: { sell: 1300, buy: 1280 }, mep: { sell: 1300, buy: 1280 },
  });
  mocks.getUser.mockResolvedValue({ data: { user: { id: 'fixture-user' } } });
  mocks.fci.mockResolvedValue({ price: 1.098, currency: 'USD', changePct: 0, timestamp: '2026-10-23T12:00:00Z' });
  mocks.yahoo.mockResolvedValue(new Map());
  mocks.stooq.mockResolvedValue(null);
  mocks.arg.mockResolvedValue({ byStock: new Map(), byCedear: new Map(), byBond: new Map(), byCorp: new Map() });
  mocks.from.mockImplementation((table: string) => {
    const builder = {
      select: () => builder, eq: () => builder, in: () => builder,
      order: () => builder, gte: () => builder,
      upsert: mocks.snapshots.mockResolvedValue({ error: null }),
      update: (payload: Record<string, unknown>) => ({ eq: (_column: string, id: string) => {
        mocks.updates.push({ ...payload, id });
        return Promise.resolve({ error: null });
      } }),
      then: (resolve: (value: unknown) => unknown) => Promise.resolve(resolve({
        data: table === 'investments' ? mocks.positions : [], error: null,
      })),
    };
    return builder;
  });
});

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe.each(['cron', 'interactive', 'list'] as const)('FCI band on %s', (path) => {
  it.each(cases)('%s %s→%s price %s anchor %s accepted=%s', async (ticker, source, target, price, anchor, accepted) => {
    mocks.positions = [position(ticker, target, anchor)];
    mocks.fci.mockResolvedValue({ price, currency: source, changePct: 0, timestamp: '2026-10-23T12:00:00Z' });
    const candidate = source === target ? price : price / 1300;
    if (path === 'interactive') {
      const url = new URL('http://localhost/api/investments/quote');
      url.search = new URLSearchParams({ symbol: ticker, type: 'fci', currency: target,
        ...(anchor != null ? { currentPrice: String(anchor) } : {}),
      }).toString();
      const body = await (await quoteGet(new NextRequest(url))).json();
      expect(body.ok).toBe(accepted);
      if (accepted) expect(body.price).toBeCloseTo(candidate, 8);
    } else {
      if (path === 'cron') {
        await cronGet(new NextRequest('http://localhost/api/cron/update-prices', {
          headers: { authorization: 'Bearer fixture-cron-secret' },
        }));
      } else {
        const rows = await investmentsService.list('fixture-user', { forceRefreshQuotes: true });
        expect(rows).toHaveLength(1);
        if (!accepted) expect(rows[0].current_price).toBe(anchor);
      }
      expect(mocks.updates).toHaveLength(accepted ? 1 : 0);
      if (accepted) expect(mocks.updates[0].current_price).toBeCloseTo(candidate, 8);
    }
    if (!accepted) expect(console.warn).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
      ticker, reason: 'fci_implausible',
    }));
    expect(fetch).not.toHaveBeenCalled();
  });
});

it('evaluates anchors per investment while fetching a shared ticker once', async () => {
  mocks.positions = [position('IOLDOLD', 'USD', 0.3), { ...position(), id: 'fixture-plausible' }];
  await investmentsService.list('fixture-user', { forceRefreshQuotes: true });
  expect(mocks.fci).toHaveBeenCalledOnce();
  expect(mocks.updates).toEqual([expect.objectContaining({ id: 'fixture-plausible', current_price: 1.098 })]);
});

it('refreshes same-currency funds when MEP is missing and skips only conversions', async () => {
  mocks.dolar.mockResolvedValue({ status: 'unavailable' });
  mocks.positions = [position(), { ...position('CONIOLA', 'USD', 0.135), id: 'fixture-needs-mep' }];
  mocks.fci.mockImplementation(async (ticker: string) => ({
    price: ticker === 'IOLDOLD' ? 1.098 : 179.598,
    currency: ticker === 'IOLDOLD' ? 'USD' : 'ARS', changePct: null, timestamp: null,
  }));
  const body = await (await cronGet(new NextRequest('http://localhost/api/cron/update-prices', {
    headers: { authorization: 'Bearer fixture-cron-secret' },
  }))).json();
  expect(body.processed).toBe(1);
  expect(mocks.updates).toEqual([expect.objectContaining({ id: 'fixture-position', current_price: 1.098 })]);
});

it.each(['unavailable', 'exception'] as const)('keeps native investment values with FX %s and never snapshots incomplete totals', async (mode) => {
  if (mode === 'exception') mocks.dolar.mockRejectedValue(new Error('fixture FX failure'));
  else mocks.dolar.mockResolvedValue({ status: 'unavailable' });
  mocks.positions = [{ ...position('PRTAVAB', 'ARS', 1240), is_manual_price: true }];
  const summary = await investmentsService.getPortfolioSummary('fixture-user');
  expect(summary.investments[0]).toMatchObject({
    name: 'Fondo de fixture', current_price: 1240, current_value_native: 12400,
    market_value_usd: null, cost_basis_usd: null, profit_loss_usd: null, fxUnavailable: true,
  });
  expect(summary).toMatchObject({ totalCurrentValue: null, blueArsPerUsd: null, fxUnavailable: true });
  expect(mocks.snapshots).not.toHaveBeenCalled();
});

it('preserves a stale blue observation on valuation flags and skips snapshot writes', async () => {
  const asOf = new Date('2026-10-23T12:00:00Z');
  mocks.dolar.mockResolvedValue({ blue: { sell: 1300, buy: 1280, stale: true, asOf, timestamp: asOf } });
  mocks.positions = [{ ...position('PRTAVAB', 'ARS', 1240), is_manual_price: true }];
  const summary = await investmentsService.getPortfolioSummary('fixture-user');
  expect(summary.fxAsOf).toBe(asOf.toISOString());
  expect(summary.fxStale).toBe(true);
  expect(summary.totalCurrentValue).toBeCloseTo(12400 / 1300);
  expect(mocks.snapshots).not.toHaveBeenCalled();
});

it('uses a valid current anchor, otherwise a matching purchase price, with inclusive endpoints', () => {
  expect(fciPlausibilityAnchor({ currentPrice: 0, purchasePrice: 1240, marketCurrency: 'ARS', purchaseCurrency: 'ARS' })).toBe(1240);
  expect(fciPlausibilityAnchor({ currentPrice: null, purchasePrice: 1, marketCurrency: 'ARS', purchaseCurrency: 'USD' })).toBeNull();
  expect(fciPricePlausible(0.5, 1)).toBe(true);
  expect(fciPricePlausible(2, 1)).toBe(true);
  expect(fciPricePlausible(0.499, 1)).toBe(false);
  expect(fciPricePlausible(2.001, 1)).toBe(false);
});
