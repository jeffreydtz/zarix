import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { FxUnavailableError } from '@/lib/executable-fx';
import { refreshQuotesForInvestments } from '@/lib/market-data/quote-refresh';
import { freshFciNavIso } from '@/lib/market-data/fci-nav-freshness';

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
  ['IOLDOLD', 'USD', 'USD', 1.098, null, false],
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
    blue: { timestamp: new Date(), sell: 1300, buy: 1280  }, mep: { timestamp: new Date(), sell: 1300, buy: 1280  },
  });
  mocks.getUser.mockResolvedValue({ data: { user: { id: 'fixture-user' } } });
  mocks.fci.mockResolvedValue({ price: 1.098, currency: 'USD', changePct: 0, timestamp: freshFciNavIso() });
  mocks.yahoo.mockResolvedValue(new Map());
  mocks.stooq.mockResolvedValue(null);
  mocks.arg.mockResolvedValue({ byStock: new Map(), byCedear: new Map(), byBond: new Map(), byCorp: new Map() });
  mocks.from.mockImplementation((table: string) => {
    const builder = {
      select: () => builder, eq: () => builder, in: () => builder,
      order: () => builder, gte: () => builder,
      upsert: mocks.snapshots.mockResolvedValue({ error: null }),
      update: (payload: Record<string, unknown>) => {
        const chain: {
          eq: (column: string, id: string) => typeof chain;
          or: () => typeof chain;
          select: () => Promise<{ error: null; data: Array<{ id: string }> }>;
          then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => Promise<unknown>;
        } = {
          eq: (_column: string, id: string) => {
            mocks.updates.push({ ...payload, id });
            return chain;
          },
          or: () => chain,
          select: async () => ({ error: null, data: [{ id: 'ok' }] }),
          then: (resolve, reject) => Promise.resolve({ error: null, data: [{ id: 'ok' }] }).then(resolve, reject),
        };
        return chain;
      },
      then: (resolve: (value: unknown) => unknown) => Promise.resolve(resolve({
        data: table === 'investments' ? mocks.positions : [], error: null,
      })),
    };
    return builder;
  });
});

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

it('M4: propagates FX DB/RLS failures through quote refresh instead of skipping a conversion', async () => {
  const failure = Object.assign(new Error('Fixture permission failure'), { code: '42501' });
  mocks.dolar.mockRejectedValue(failure);
  await expect(refreshQuotesForInvestments([])).rejects.toBe(failure);
  expect(mocks.updates).toEqual([]);
});

it('M4: preserves framework control flow through quote refresh', async () => {
  const redirect = Object.assign(new Error('Fixture redirect'), { digest: 'NEXT_REDIRECT;replace;/login;307;' });
  mocks.dolar.mockRejectedValue(redirect);
  await expect(refreshQuotesForInvestments([])).rejects.toBe(redirect);
});

it.each([
  Object.assign(new Error('Fixture permission failure'), { code: '42501' }),
  Object.assign(new Error('Fixture redirect'), { digest: 'NEXT_REDIRECT;replace;/login;307;' }),
])('M4: rethrows non-FX crypto failures (%s)', async failure => {
  mocks.crypto.mockRejectedValueOnce(failure);
  await expect(refreshQuotesForInvestments([{
    type: 'crypto', ticker: 'BTC', market_currency: 'USD', purchase_currency: 'USD',
  }])).rejects.toBe(failure);
});

it('M4: skips a typed crypto FX outage without inventing a quote', async () => {
  mocks.crypto.mockRejectedValueOnce(new FxUnavailableError('BTC/USD'));
  const quotes = await refreshQuotesForInvestments([{
    type: 'crypto', ticker: 'BTC', market_currency: 'USD', purchase_currency: 'USD',
  }]);
  expect(quotes.size).toBe(0);
});

describe.each(['cron', 'interactive', 'list'] as const)('FCI band on %s', (path) => {
  it.each(cases)('%s %s→%s price %s anchor %s accepted=%s', async (ticker, source, target, price, anchor, accepted) => {
    mocks.positions = [position(ticker, target, anchor)];
    mocks.fci.mockResolvedValue({ price, currency: source, changePct: 0, timestamp: freshFciNavIso() });
    const candidate = source === target ? price : price / 1300;
    if (path === 'interactive') {
      const url = new URL('http://localhost/api/investments/quote');
      url.search = new URLSearchParams({ symbol: ticker, type: 'fci', currency: target,
        ...(anchor != null ? { currentPrice: String(anchor) } : {}),
      }).toString();
      const body = await (await quoteGet(new NextRequest(url))).json();
      // Unanchored discovery is a non-persisting preview only.
      expect(body.ok).toBe(accepted || anchor == null);
      if (accepted || anchor == null) expect(body.price).toBeCloseTo(candidate, 8);
      expect(mocks.updates).toEqual([]);
    } else {
      if (path === 'cron') {
        await cronGet(new NextRequest('http://localhost/api/cron/update-prices', {
          headers: { authorization: 'Bearer fixture-cron-secret' },
        }));
      } else {
        const rows = await investmentsService.list('fixture-user', { forceRefreshQuotes: true });
        expect(rows).toHaveLength(1);
        if (!accepted && anchor != null) expect(rows[0].current_price).toBe(anchor);
      }
      expect(mocks.updates).toHaveLength(accepted ? 1 : 0);
      if (accepted) expect(mocks.updates[0].current_price).toBeCloseTo(candidate, 8);
    }
    if (!accepted && !(path === 'interactive' && anchor == null)) {
      expect(console.warn).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
        ticker, reason: anchor == null ? 'no_anchor' : 'fci_implausible',
      }));
    }
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
    currency: ticker === 'IOLDOLD' ? 'USD' : 'ARS', changePct: null, timestamp: freshFciNavIso(),
  }));
  const body = await (await cronGet(new NextRequest('http://localhost/api/cron/update-prices', {
    headers: { authorization: 'Bearer fixture-cron-secret' },
  }))).json();
  expect(body.processed).toBe(1);
  expect(mocks.updates).toEqual([expect.objectContaining({ id: 'fixture-position', current_price: 1.098 })]);
});

it.each(['unavailable', 'exception'] as const)('keeps native investment values with FX %s and never snapshots incomplete totals', async (mode) => {
  if (mode === 'exception') mocks.dolar.mockRejectedValue(new FxUnavailableError('blue'));
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

it('prefers current, then matching or MEP-converted purchase anchors, with inclusive endpoints', () => {
  expect(fciPlausibilityAnchor({ currentPrice: 1240, purchasePrice: 10, marketCurrency: 'ARS', purchaseCurrency: 'USD', mepArsPerUsd: 1300 })).toBe(1240);
  expect(fciPlausibilityAnchor({ currentPrice: 0, purchasePrice: 1240, marketCurrency: 'ARS', purchaseCurrency: 'ARS' })).toBe(1240);
  expect(fciPlausibilityAnchor({ currentPrice: null, purchasePrice: 1, marketCurrency: 'ARS', purchaseCurrency: 'USD' })).toBeNull();
  expect(fciPlausibilityAnchor({ currentPrice: null, purchasePrice: 0.95, marketCurrency: 'ARS', purchaseCurrency: 'USD', mepArsPerUsd: 1300 })).toBe(1235);
  expect(fciPlausibilityAnchor({ currentPrice: null, purchasePrice: 1417, marketCurrency: 'USD', purchaseCurrency: 'ARS', mepArsPerUsd: 1300 })).toBe(1.09);
  expect(fciPricePlausible(0.5, 1)).toBe(true);
  expect(fciPricePlausible(2, 1)).toBe(true);
  expect(fciPricePlausible(0.499, 1)).toBe(false);
  expect(fciPricePlausible(2.001, 1)).toBe(false);
});

it.each(['cron', 'interactive', 'list'] as const)('rejects an ARS scale error on a normally created FCI through %s', async (path) => {
  mocks.positions = [{ ...position('PRTAVAB', 'ARS', 1240), market_currency: null, current_price: null }];
  mocks.fci.mockResolvedValue({ price: 1_240_000, currency: 'ARS', changePct: 0, timestamp: new Date().toISOString() });
  if (path === 'cron') {
    await cronGet(new NextRequest('http://localhost/api/cron/update-prices', {
      headers: { authorization: 'Bearer fixture-cron-secret' },
    }));
  } else if (path === 'interactive') {
    const response = await quoteGet(new NextRequest('http://localhost/api/investments/quote?symbol=PRTAVAB&type=fci&purchaseCurrency=ARS&purchasePrice=1240'));
    expect((await response.json()).ok).toBe(false);
  } else {
    const rows = await investmentsService.list('fixture-user', { forceRefreshQuotes: true });
    expect(rows[0]).toMatchObject({ current_price: 1240, valuation_price_source: 'purchase_reference' });
  }
  expect(mocks.updates).toEqual([]);
  expect(console.warn).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
    ticker: 'PRTAVAB', reason: 'fci_implausible', anchor: 1240,
  }));
});

describe.each(['cron', 'list'] as const)('FCI purchase anchors through %s', (path) => {
  async function refresh() {
    if (path === 'cron') {
      await cronGet(new NextRequest('http://localhost/api/cron/update-prices', {
        headers: { authorization: 'Bearer fixture-cron-secret' },
      }));
    } else {
      await investmentsService.list('fixture-user', { forceRefreshQuotes: true });
    }
    expect(fetch).not.toHaveBeenCalled();
  }

  beforeEach(() => {
    mocks.positions = [{ ...position('PRTAVAB', 'USD', 0.95), market_currency: null, current_price: null }];
    mocks.fci.mockResolvedValue({ price: 1241.954, currency: 'ARS', changePct: 0, timestamp: new Date().toISOString() });
  });

  function expectNoAnchor() {
    expect(mocks.updates).toEqual([]);
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('fci_implausible'), expect.objectContaining({
      ticker: 'PRTAVAB', id: 'fixture-position', reason: 'no_anchor',
    }));
  }

  it.each([true, false])('rejects a 1000x ARS quote for a USD purchase (MEP available=%s)', async (hasMep) => {
    mocks.positions = [{ ...position('PRTAVAB', 'USD', 1), market_currency: null, current_price: null }];
    mocks.fci.mockResolvedValue({ price: 1_240_000, currency: 'ARS', changePct: 0, timestamp: new Date().toISOString() });
    if (!hasMep) mocks.dolar.mockResolvedValue({ status: 'unavailable' });
    await refresh();
    expect(mocks.updates).toEqual([]);
    if (hasMep) {
      expect(console.warn).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
        ticker: 'PRTAVAB', id: 'fixture-position', reason: 'fci_implausible', anchor: 1300,
      }));
    } else {
      expectNoAnchor();
    }
  });

  it('converts the USD purchase to an ARS anchor with fresh MEP before first pricing', async () => {
    // No market override: the confirmed CAFCI source sets the write currency.
    // 0.95 USD * 1300 = 1235 ARS, so 1241.954 ARS is within the band.
    await refresh();
    expect(mocks.updates).toEqual([expect.objectContaining({
      id: 'fixture-position', current_price: 1241.954, market_currency: 'ARS',
    })]);
    expect(console.warn).not.toHaveBeenCalled();
  });

  it('applies the band to the converted 1235 ARS purchase anchor', async () => {
    mocks.fci.mockResolvedValue({ price: 2470.001, currency: 'ARS', changePct: 0, timestamp: new Date().toISOString() });
    await refresh();
    expect(mocks.updates).toEqual([]);
    expect(console.warn).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
      ticker: 'PRTAVAB', id: 'fixture-position', reason: 'fci_implausible', anchor: 1235,
    }));
  });

  it('converts an ARS purchase to a USD anchor when CAFCI confirms USD', async () => {
    mocks.positions = [{ ...position('IOLDOLD', 'ARS', 1417), market_currency: null, current_price: null }];
    mocks.fci.mockResolvedValue({ price: 1.098, currency: 'USD', changePct: 0, timestamp: new Date().toISOString() });
    await refresh();
    expect(mocks.updates).toEqual([expect.objectContaining({
      id: 'fixture-position', current_price: 1.098, market_currency: 'USD',
    })]);
  });

  it('skips first pricing without either a current or purchase price', async () => {
    mocks.positions = [{ ...position('PRTAVAB', 'ARS', null), market_currency: null }];
    await refresh();
    expectNoAnchor();
  });

  it.each(['unavailable', 'exception', 'stale', 'expired', 'undated', 'invalid'] as const)(
    'skips a purchase conversion when MEP is %s', async (mode) => {
      const now = new Date();
      if (mode === 'exception') {
        mocks.dolar.mockRejectedValue(new FxUnavailableError('MEP'));
      } else {
        mocks.dolar.mockResolvedValue({
          blue: { sell: 1300, buy: 1280, timestamp: now },
          ...(mode === 'unavailable' ? {} : {
            mep: {
              sell: mode === 'invalid' ? 0 : 1300, buy: 1280,
              timestamp: mode === 'undated' ? null : new Date(now.getTime() - (mode === 'expired' ? 24 * 3600_000 + 1000 : 2 * 3600_000)),
              stale: mode === 'stale',
            },
          }),
        });
      }
      await refresh();
      expectNoAnchor();
    },
  );

  it.each([[24, true], [24 + 1 / 3600, false]] as const)(
    'requires MEP at most 24 hours old for a purchase anchor (age=%s)', async (hours, accepted) => {
      vi.useFakeTimers({ toFake: ['Date'] });
      try {
        vi.setSystemTime(new Date('2026-10-26T15:00:00Z'));
        mocks.fci.mockResolvedValue({
          price: 1241.954, currency: 'ARS', changePct: 0, timestamp: freshFciNavIso(),
        });
        mocks.dolar.mockResolvedValue({
          blue: { sell: 1300, buy: 1280, timestamp: new Date() },
          mep: { sell: 1300, buy: 1280, timestamp: new Date(Date.now() - hours * 3600_000), stale: false },
        });
        await refresh();
        if (accepted) {
          expect(mocks.updates).toEqual([expect.objectContaining({ current_price: 1241.954, market_currency: 'ARS' })]);
        } else {
          expectNoAnchor();
        }
      } finally {
        vi.useRealTimers();
      }
    },
  );
});

describe.each([2, 72])('explicitly stale MEP aged %s hours', (hours) => {
  it.each(['cron', 'interactive', 'list', 'portfolio'] as const)('keeps estimates out of persisted prices and snapshots through %s', async (path) => {
    const asOf = new Date(Date.now() - hours * 60 * 60 * 1000);
    mocks.dolar.mockResolvedValue({
      blue: { sell: 1300, buy: 1280, timestamp: new Date(), stale: false },
      mep: { sell: 1300, buy: 1280, timestamp: asOf, asOf, stale: true },
    });
    mocks.positions = [position('CONIOLA', 'USD', 0.135)];
    mocks.fci.mockResolvedValue({ price: 179.598, currency: 'ARS', changePct: 0, timestamp: new Date().toISOString() });
    if (path === 'cron') {
      const response = await cronGet(new NextRequest('http://localhost/api/cron/update-prices', {
        headers: { authorization: 'Bearer fixture-cron-secret' },
      }));
      expect((await response.json()).processed).toBe(0);
    } else if (path === 'interactive') {
      const response = await quoteGet(new NextRequest('http://localhost/api/investments/quote?symbol=CONIOLA&type=fci&currency=USD&currentPrice=0.135'));
      const body = await response.json();
      expect(body).toMatchObject({ ok: true, fxStale: true, fxAsOf: asOf.toISOString() });
      expect(body.price).toBeCloseTo(179.598 / 1300);
    } else if (path === 'list') {
      const rows = await investmentsService.list('fixture-user', { forceRefreshQuotes: true });
      expect(rows[0]).toMatchObject({ fxStale: true, fxAsOf: asOf.toISOString(), valuation_price_source: 'estimate' });
      expect(rows[0].current_price).toBeCloseTo(179.598 / 1300);
    } else {
      const summary = await investmentsService.getPortfolioSummary('fixture-user', { forceRefreshQuotes: true });
      expect(summary).toMatchObject({ fxStale: true, fxAsOf: asOf.toISOString() });
      expect(summary.investments[0]).toMatchObject({ fxStale: true, fxAsOf: asOf.toISOString(), valuation_price_source: 'estimate' });
      expect(summary.investments[0].current_price).toBeCloseTo(179.598 / 1300);
    }
    expect(mocks.updates).toEqual([]);
    expect(mocks.snapshots).not.toHaveBeenCalled();
  });
});

it('skips snapshots when required MEP is missing even if blue and the cached asset price exist', async () => {
  mocks.dolar.mockResolvedValue({ blue: { sell: 1300, buy: 1280, timestamp: new Date() } });
  mocks.positions = [position('CONIOLA', 'USD', 0.135)];
  mocks.fci.mockResolvedValue({ price: 179.598, currency: 'ARS', changePct: 0, timestamp: new Date().toISOString() });
  const summary = await investmentsService.getPortfolioSummary('fixture-user', { forceRefreshQuotes: true });
  expect(summary.fxUnavailable).toBe(true);
  expect(summary.investments[0]).toMatchObject({ current_price: 0.135, valuation_price_source: 'cache', fxUnavailable: true });
  expect(mocks.updates).toEqual([]);
  expect(mocks.snapshots).not.toHaveBeenCalled();
});

it('persists a converted FCI price and snapshot with fresh required MEP', async () => {
  mocks.positions = [position('CONIOLA', 'USD', 0.135)];
  mocks.fci.mockResolvedValue({ price: 179.598, currency: 'ARS', changePct: 0, timestamp: new Date().toISOString() });
  const summary = await investmentsService.getPortfolioSummary('fixture-user', { forceRefreshQuotes: true });
  expect(summary.fxStale).toBe(false);
  expect(mocks.updates).toHaveLength(1);
  expect(mocks.snapshots).toHaveBeenCalledOnce();
});

it.each([[24, true], [24 + 1 / 3600, false]] as const)('requires MEP at most 24 hours old for a price write (age=%s)', async (hours, accepted) => {
  vi.useFakeTimers({ toFake: ['Date'] });
  try {
    vi.setSystemTime(new Date('2026-10-25T12:00:00Z'));
    mocks.dolar.mockResolvedValue({
      blue: { sell: 1300, buy: 1280, timestamp: new Date() },
      mep: { sell: 1300, buy: 1280, timestamp: new Date(Date.now() - hours * 3600_000), stale: false },
    });
    mocks.positions = [position('CONIOLA', 'USD', 0.135)];
    mocks.fci.mockResolvedValue({ price: 179.598, currency: 'ARS', changePct: 0, timestamp: new Date().toISOString() });
    const response = await cronGet(new NextRequest('http://localhost/api/cron/update-prices', {
      headers: { authorization: 'Bearer fixture-cron-secret' },
    }));
    expect((await response.json()).processed).toBe(accepted ? 1 : 0);
    expect(mocks.updates).toHaveLength(accepted ? 1 : 0);
  } finally {
    vi.useRealTimers();
  }
});

it('surfaces quote API auth service failures separately from unavailable market quotes', async () => {
  mocks.getUser.mockResolvedValue({ data: { user: null }, error: { status: 503, message: 'fixture auth outage' } });
  const response = await quoteGet(new NextRequest('http://localhost/api/investments/quote?symbol=CONIOLA&type=fci&currency=USD'));
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ error: 'No pudimos verificar tu sesión. Volvé a intentar en unos minutos.' });
  expect(mocks.fci).not.toHaveBeenCalled();
});

it('surfaces snapshot history DB errors instead of treating them as an empty history', async () => {
  const implementation = mocks.from.getMockImplementation()!;
  const failure = { code: '42501', message: 'fixture snapshot permission denied' };
  mocks.from.mockImplementation((table: string) => {
    if (table !== 'portfolio_performance_snapshots') return implementation(table);
    const query = {
      select: () => query, eq: () => query, gte: () => query, order: () => query,
      then: (resolve: (value: unknown) => unknown) => Promise.resolve(resolve({ data: null, error: failure })),
    };
    return query;
  });
  mocks.positions = [{ ...position(), is_manual_price: true }];
  await expect(investmentsService.getPortfolioSummary('fixture-user')).rejects.toEqual(failure);
  expect(mocks.snapshots).not.toHaveBeenCalled();
});

it('does not persist a cross-currency stock estimate using stale MEP', async () => {
  const asOf = new Date(Date.now() - 72 * 3600_000);
  mocks.dolar.mockResolvedValue({
    blue: { sell: 1300, buy: 1280, timestamp: new Date() },
    mep: { sell: 1300, buy: 1280, timestamp: asOf, stale: true },
  });
  mocks.positions = [{ ...position('GGAL', 'USD', 70), type: 'stock_arg' }];
  mocks.arg.mockResolvedValue({
    byStock: new Map([['GGAL', { symbol: 'GGAL', price: 91000, changePct: 0, currency: 'ARS', timestamp: new Date().toISOString() }]]),
    byCedear: new Map(), byBond: new Map(), byCorp: new Map(),
  });
  const summary = await investmentsService.getPortfolioSummary('fixture-user', { forceRefreshQuotes: true });
  expect(summary).toMatchObject({ fxStale: true, fxAsOf: asOf.toISOString() });
  expect(summary.investments[0]).toMatchObject({ current_price: 70, valuation_price_source: 'estimate' });
  expect(mocks.updates).toEqual([]);
  expect(mocks.snapshots).not.toHaveBeenCalled();
});
