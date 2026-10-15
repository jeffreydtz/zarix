import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// All database and HTTP accesses are explicit doubles. These derived RN08
// checks do not approve CP3-19's incompatible selectable-MEP contract.
const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  insert: vi.fn(),
  rpc: vi.fn(),
  rates: {} as Record<string, { rate: number; timestamp: string }>,
  accounts: [] as Array<Record<string, unknown>>,
  investments: [] as Array<Record<string, unknown>>,
}));

vi.mock('@/lib/supabase/server', () => ({
  createServiceClientSync: () => ({ from: mocks.from, rpc: mocks.rpc }),
}));
vi.mock('@/lib/yahoo-finance-quotes', () => ({ fetchYahooStockQuotesMap: vi.fn() }));
vi.mock('@/lib/stooq-us-quote', () => ({ fetchStooqUsQuote: vi.fn() }));
vi.mock('@/lib/market-data/data912-client', () => ({ loadArgentineQuotes: vi.fn() }));

const observedAt = '2026-10-13T11:59:00.000Z';
const sources = ['blue', 'oficial', 'mep', 'ccl'];
const json = (data: unknown) => new Response(JSON.stringify(data), {
  headers: { 'content-type': 'application/json' },
});
const live = () => ({
  blue: { bid: 1275, ask: 1300, timestamp: Date.parse(observedAt) / 1000 },
  oficial: { bid: 975, ask: 1000, timestamp: Date.parse(observedAt) / 1000 },
  mep: { al30: { '24hs': { price: 1250, timestamp: Date.parse(observedAt) / 1000 } } },
  ccl: { al30: { '24hs': { price: 1325, timestamp: Date.parse(observedAt) / 1000 } } },
});
const reference = (rate = 1300, provider: string | null = 'criptoya',
  origin: 'provider' | 'persisted' | 'unknown' = 'provider') => ({
  type: 'blue' as const, side: 'sell' as const, rate, observedAt, provider, origin,
});

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-13T12:00:00.000Z'));
  vi.stubEnv('EXCHANGE_RATE_CACHE_TTL', '300');
  vi.stubEnv('EXCHANGE_RATE_MAX_AGE_SECONDS', '86400');
  vi.spyOn(console, 'error').mockImplementation(() => {});
  mocks.accounts = [];
  mocks.investments = [];
  mocks.rates = Object.fromEntries(sources.flatMap(source => [
    [source, { rate: 1200, timestamp: observedAt }],
    [`${source}_buy`, { rate: 1175, timestamp: observedAt }],
  ]));
  mocks.insert.mockResolvedValue({ error: null });
  mocks.from.mockImplementation((table: string) => {
    let source = '';
    let timestamp: string | undefined;
    const rows = () => {
      if (table === 'accounts') return mocks.accounts;
      if (table === 'investments') return mocks.investments;
      if (table === 'investment_sales') return [];
      throw new Error(`Unexpected synthetic table ${table}`);
    };
    const query = {
      select: () => query,
      eq: (key: string, value: string) => {
        if (key === 'source') source = value;
        if (key === 'timestamp') timestamp = value;
        return query;
      },
      in: () => query,
      order: () => query,
      limit: () => query,
      neq: () => query,
      single: async () => ({ data: mocks.rates[source] ?? null, error: null }),
      maybeSingle: async () => ({
        data: mocks.rates[source]?.timestamp === timestamp ? mocks.rates[source] : null,
        error: null,
      }),
      insert: mocks.insert,
      then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
        Promise.resolve({ data: rows(), error: null }).then(resolve, reject),
    };
    return query;
  });
  vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => json(live())));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('blue FX reference helper', () => {
  it('preserves the source observation and labels the exact sell side', async () => {
    const { blueFxReference } = await import('@/lib/blue-fx-reference');
    expect(blueFxReference({
      buy: 1275, sell: 1300, timestamp: new Date(observedAt),
      provider: 'criptoya', origin: 'provider',
    })).toEqual(reference());
  });

  it('keeps the buy rate distinct from the sell rate', async () => {
    const { blueFxReference } = await import('@/lib/blue-fx-reference');
    expect(blueFxReference({
      buy: 1275, sell: 1300, timestamp: new Date(observedAt),
      provider: 'dolarapi', origin: 'provider',
    }, 'buy')).toEqual({ ...reference(1275, 'dolarapi'), side: 'buy' });
  });

  it.each([undefined, new Date(Number.NaN)])('does not invent a date or provider when metadata is absent (%s)', async timestamp => {
    const { blueFxReference } = await import('@/lib/blue-fx-reference');
    expect(blueFxReference({ buy: 1275, sell: 1300, timestamp })).toEqual({
      ...reference(1300, null, 'unknown'), observedAt: null,
    });
  });
});

describe('provider provenance follows the quote through fallback and memory', () => {
  it('stamps CriptoYa and retains its original source time in memory', async () => {
    const { cotizacionesService } = await import('@/lib/services/cotizaciones');
    const first = await cotizacionesService.getDolarQuotes();
    expect(first.blue).toMatchObject({ provider: 'criptoya', origin: 'provider', sell: 1300 });
    expect(first.blue.timestamp.toISOString()).toBe(observedAt);
    vi.setSystemTime(new Date('2026-10-13T12:01:00.000Z'));
    const cached = await cotizacionesService.getDolarQuotes();
    expect(cached.blue).toEqual(first.blue);
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('attributes DolarApi fallback to DolarApi even when cached in the shared live key', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error('synthetic primary outage'))
      .mockResolvedValueOnce(json(['blue', 'oficial', 'bolsa', 'contadoconliqui'].map(casa => ({
        casa, compra: 1275, venta: 1300, fechaActualizacion: observedAt,
      }))));
    const { cotizacionesService } = await import('@/lib/services/cotizaciones');
    const first = await cotizacionesService.getDolarQuotes();
    expect(first.blue).toMatchObject({ provider: 'dolarapi', origin: 'provider', sell: 1300 });
    expect(first.blue.timestamp.toISOString()).toBe(observedAt);
    expect((await cotizacionesService.getDolarQuotes()).blue).toEqual(first.blue);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('labels persisted fallback without guessing the original external provider', async () => {
    const { cotizacionesService } = await import('@/lib/services/cotizaciones');
    const first = await cotizacionesService.getDolarQuotes({ preferCache: true });
    expect(first.blue).toMatchObject({ provider: null, origin: 'persisted', sell: 1200 });
    expect(first.blue.timestamp.toISOString()).toBe(observedAt);
    expect((await cotizacionesService.getDolarQuotes({ preferCache: true })).blue).toEqual(first.blue);
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('derived RN08 blue FX metadata propagation', () => {
  it('uses blue sell for USD100 and returns one matching reference for account totals', async () => {
    mocks.accounts = ['A', 'B'].map(id => ({
      id, user_id: 'U1', type: 'bank', currency: 'USD', balance: 100,
      is_active: true, include_in_total: true, include_in_liquid: true,
    }));
    const { accountsService } = await import('@/lib/services/accounts');
    const accounts = await accountsService.list('U1');
    expect(accounts.map(account => account.balance_ars_blue)).toEqual([130000, 130000]);
    expect(accounts.map(account => account.blueReference)).toEqual([reference(), reference()]);
    const totals = accountsService.aggregateAccountTotals(accounts);
    expect(totals.totalARSBlue).toBe(260000);
    expect(totals.totalUSD).toBe(200);
    expect(totals.blueReferences).toEqual([reference()]);
    expect(accounts.map(account => account.balance)).toEqual([100, 100]);
  });

  it('keeps different account references and omits accounts excluded from totals', async () => {
    const { accountsService } = await import('@/lib/services/accounts');
    const row = { id: 'A', user_id: 'U1', type: 'bank' as const, currency: 'USD',
      balance: 100, balance_usd: 100, balance_ars_blue: 130000,
      include_in_total: true, include_in_liquid: true };
    const different = reference(1400, null, 'persisted');
    const accounts = [
      { ...row, blueReference: reference() },
      { ...row, id: 'B', balance_ars_blue: 140000, blueReference: different },
      { ...row, id: 'excluded', include_in_total: false, blueReference: reference(1500, 'dolarapi') },
    ];
    const totals = accountsService.aggregateAccountTotals(accounts as Parameters<typeof accountsService.aggregateAccountTotals>[0]);
    expect(totals.totalARSBlue).toBe(270000);
    expect(totals.blueReferences).toEqual([reference(), different]);
  });

  it('separates FX provenance from a manual investment price with a different date', async () => {
    const priceAt = '2026-10-12T09:00:00.000Z';
    mocks.investments = [{
      id: 'I1', user_id: 'U1', account_id: 'broker', type: 'stock_us',
      ticker: null, name: 'Synthetic', quantity: 1, purchase_price: 80,
      purchase_currency: 'USD', current_price: 100, current_price_updated_at: priceAt,
      is_manual_price: true, market_currency: 'USD', is_active: true,
    }];
    const { investmentsService } = await import('@/lib/services/investments');
    const portfolio = await investmentsService.getPortfolioSummary('U1', {
      skipQuoteRefresh: true, skipDailySnapshot: true,
    });
    expect(portfolio.totalCurrentValue).toBe(100);
    expect(portfolio.totalCurrentValueArsBlue).toBe(130000);
    expect(portfolio.blueReference).toEqual(reference());
    expect(portfolio.investments[0]).toMatchObject({
      current_price_updated_at: priceAt, valuation_price_source: 'manual',
    });
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('keeps separate account and portfolio FX samples in the combined current net worth', async () => {
    const { accountsService } = await import('@/lib/services/accounts');
    const { investmentsService } = await import('@/lib/services/investments');
    const { cotizacionesService } = await import('@/lib/services/cotizaciones');
    const accountReference = reference();
    const portfolioReference = { ...reference(1400, null, 'persisted'), observedAt: '2026-10-13T11:58:00.000Z' };
    vi.spyOn(accountsService, 'aggregateAccountTotals').mockReturnValue({
      liquidUSD: 100, investmentsUSD: 0, totalUSD: 100, totalARSBlue: 130000,
      blueReferences: [accountReference],
    } as ReturnType<typeof accountsService.aggregateAccountTotals>);
    // Ensure the actual composition uses the returned reference, rather than
    // assigning its independent quote lookup to all already-converted values.
    vi.spyOn(accountsService, 'list').mockResolvedValue([
      { id: 'A', blueReference: accountReference } as Awaited<ReturnType<typeof accountsService.list>>[number],
    ]);
    vi.spyOn(investmentsService, 'getPortfolioSummary').mockResolvedValue({
      totalCurrentValue: 100, totalCurrentValueArsBlue: 140000,
      blueArsPerUsd: 1400, blueReference: portfolioReference,
      investments: [{ id: 'I1' }],
    } as Awaited<ReturnType<typeof investmentsService.getPortfolioSummary>>);
    vi.spyOn(cotizacionesService, 'getDolarQuotes').mockResolvedValue({
      blue: { type: 'blue', buy: 1475, sell: 1500, timestamp: new Date(observedAt), provider: 'dolarapi', origin: 'provider' },
    });
    const { computeNetWorth } = await import('@/lib/services/net-worth');
    const now = await computeNetWorth('U1');
    expect(now.totalUSD).toBe(200);
    expect(now.totalARSBlue).toBe(270000);
    expect(now.blueReferences).toEqual([
      { component: 'accounts', reference: accountReference },
      { component: 'portfolio', reference: portfolioReference },
    ]);
  });
});
