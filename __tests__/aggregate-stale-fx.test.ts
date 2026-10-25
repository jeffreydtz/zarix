import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, any>;
const fixture = vi.hoisted(() => ({
  transactions: [] as Row[], rules: [] as Row[], rates: {} as Record<string, Row>,
  notify: vi.fn(), chat: vi.fn(), writes: vi.fn(),
}));
vi.mock('@/lib/services/accounts', () => ({
  accountsService: { getActiveAccountIds: async () => ['synthetic-account'] },
  normalizeDebtBalanceForStorage: vi.fn(),
}));
vi.mock('@/lib/supabase/server', () => ({
  createServiceClientSync: () => ({ from: query }),
  createClient: async () => ({ from: query, auth: {
    getUser: async () => ({ data: { user: { id: 'synthetic-user' } } }),
  } }),
}));
vi.mock('@/lib/plans/service', () => ({ withPlanQuota: (_options: unknown, action: () => unknown) => action() }));
vi.mock('@/lib/ai/gemini', () => ({
  getGeminiForUser: async () => ({ chat: fixture.chat }),
  GeminiMissingKeyError: class extends Error {},
}));
vi.mock('@/lib/services/notification-outbox', () => ({ enqueueNotification: fixture.notify }));
vi.mock('@/lib/observability/alert', () => ({ alertAdmin: vi.fn() }));

function query(table: string) {
  const filters: Array<[string, string, any]> = [];
  let range = [0, 999];
  const q: any = {};
  for (const method of ['select', 'order', 'limit', 'filter', 'or', 'not']) q[method] = () => q;
  for (const method of ['eq', 'gte', 'lte', 'lt', 'in']) {
    q[method] = (field: string, value: unknown) => { filters.push([method, field, value]); return q; };
  }
  q.range = (from: number, to: number) => { range = [from, to]; return q; };
  q.insert = fixture.writes;
  q.single = async () => ({
    data: fixture.rates[filters.find(([, field]) => field === 'source')?.[2]] ?? null, error: null,
  });
  q.maybeSingle = q.single;
  q.then = (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => {
    const source = table === 'transactions' ? fixture.transactions : table === 'recurring_rules' ? fixture.rules :
      table === 'users' ? [{ id: 'synthetic-user', weekly_summary_enabled: true, monthly_summary_enabled: true }] : [];
    const data = source.filter(row => filters.every(([method, field, value]) => {
      if (method === 'eq') return row[field] === value;
      if (method === 'gte') return row[field] >= value;
      if (method === 'lte') return row[field] <= value;
      if (method === 'lt') return row[field] < value;
      return value.includes(row[field]);
    })).slice(range[0], range[1] + 1);
    return Promise.resolve({ data, error: null }).then(resolve, reject);
  };
  return q;
}

function transactions(date = '2026-10-20T12:00:00.000Z'): Row[] {
  const common = { user_id: 'synthetic-user', account_id: 'synthetic-account', type: 'expense',
    transaction_date: date, category_id: 'ars', category: { name: 'Pesos', icon: 'P' },
    account: { is_active: true, name: 'Fixture', icon: 'A' } };
  return [
    { ...common, id: 'ars', currency: 'ARS', amount: 50 },
    { ...common, id: 'usd', currency: 'USD', amount: 100, category_id: 'usd', category: { name: 'Dólares', icon: 'D' } },
    { ...common, id: 'income', currency: 'ARS', amount: 200, type: 'income' },
  ];
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-26T12:00:00.000Z'));
  vi.stubEnv('EXCHANGE_RATE_MAX_AGE_SECONDS', '86400');
  vi.stubEnv('CRON_SECRET', 'synthetic-cron-secret');
  fixture.transactions = transactions();
  fixture.rules = [];
  fixture.rates = {
    blue: { rate: 1300, timestamp: '2026-10-02T12:00:00.000Z' },
    blue_buy: { rate: 1290, timestamp: '2026-10-02T12:00:00.000Z' },
  };
  fixture.chat.mockResolvedValue('{"insights":[],"sugerencias":[]}');
  fixture.notify.mockResolvedValue(undefined);
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.stubGlobal('fetch', vi.fn(async (url: unknown) => {
    if (String(url).includes('EURUSD')) return new Response(JSON.stringify({
      chart: { result: [{ meta: { regularMarketPrice: 1.1, regularMarketTime: Date.now() / 1000 } }] },
    }));
    throw new Error('Synthetic provider outage; no network');
  }));
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** Prove completion while Yahoo is unresolved, then release it even on a regression. */
async function withoutYahoo<T>(operation: () => Promise<T>): Promise<T> {
  let release!: (response: Response) => void;
  const pendingYahoo = new Promise<Response>(resolve => { release = resolve; });
  const yahooFetch = vi.fn(() => pendingYahoo);
  vi.stubGlobal('fetch', yahooFetch);
  let settled = false;
  const pending = operation();
  void pending.then(() => { settled = true; }, () => { settled = true; });
  await new Promise(resolve => setTimeout(resolve, 0));
  const settledBeforeYahoo = settled;
  release(new Response('', { status: 503 }));
  const result = await pending;
  expect(settledBeforeYahoo).toBe(true);
  expect(yahooFetch).not.toHaveBeenCalled();
  return result;
}

describe('required currencies isolate aggregates from the EUR provider', () => {
  beforeEach(async () => {
    const { cotizacionesService } = await import('@/lib/services/cotizaciones');
    vi.spyOn(cotizacionesService, 'getDolarQuotes').mockResolvedValue({
      status: 'available', missing: [],
      blue: { type: 'blue', buy: 1290, sell: 1300, stale: false, timestamp: new Date() },
    });
  });

  it('returns available USD rates without starting or awaiting Yahoo', async () => {
    const { cotizacionesService } = await import('@/lib/services/cotizaciones');
    const rates = await withoutYahoo(() => cotizacionesService.getTransactionsFxRates(['USD']));
    expect(rates).toMatchObject({ usdArs: 1300, eurArs: null, fxUnavailable: false, stale: false });
    expect(cotizacionesService.getDolarQuotes).toHaveBeenCalledWith({ require: ['blue'] });
  });

  it('requests no providers for ARS-only rates', async () => {
    const { cotizacionesService } = await import('@/lib/services/cotizaciones');
    expect(await withoutYahoo(() => cotizacionesService.getTransactionsFxRates(['ARS'])))
      .toMatchObject({ usdArs: null, eurArs: null, fxUnavailable: false });
    expect(cotizacionesService.getDolarQuotes).not.toHaveBeenCalled();
  });

  it('converts normalized USD and ARS movements while Yahoo is unresolved', async () => {
    const { buildToArsConverter } = await import('@/lib/services/transactions');
    const converter = await withoutYahoo(() => buildToArsConverter([{ currency: ' usd ' }, { currency: 'ARS' }]));
    expect(converter.toArs({ currency: 'USD', amount: 100 })).toBe(130000);
    expect(converter.toArs({ currency: 'ARS', amount: 50 })).toBe(50);
    expect(converter.excludedCurrencies).toEqual([]);
  });

  it('still fetches EUR/USD when EUR is needed', async () => {
    const { buildToArsConverter } = await import('@/lib/services/transactions');
    const converter = await buildToArsConverter([{ currency: 'USD' }, { currency: ' eur ' }]);
    expect(converter.toArs({ currency: 'USD', amount: 100 })).toBe(130000);
    expect(converter.toArs({ currency: 'EUR', amount: 100 })).toBeCloseTo(143000);
    expect(converter.excludedCurrencies).toEqual([]);
    expect(fetch).toHaveBeenCalledOnce();
    expect(String(vi.mocked(fetch).mock.calls[0][0])).toContain('EURUSD=X');
  });

  it('excludes only EUR when its provider fails and blue is fresh', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Fixture EUR outage')));
    const { buildToArsConverter } = await import('@/lib/services/transactions');
    const converter = await buildToArsConverter([{ currency: 'USD' }, { currency: 'EUR' }]);
    expect(converter.toArs({ currency: 'USD', amount: 100 })).toBe(130000);
    expect(converter.toArs({ currency: 'EUR', amount: 100 })).toBeNull();
    expect(converter.excludedCurrencies).toEqual(['EUR']);
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('completes a USD monthly aggregate without Yahoo', async () => {
    const { transactionsService } = await import('@/lib/services/transactions');
    expect(await withoutYahoo(() => transactionsService.getMonthSummary('synthetic-user', new Date())))
      .toMatchObject({ totalExpenses: 130050, totalIncome: 200, excludedCurrencies: [] });
  });

  it.each(['getCategoryBreakdown', 'getMonthlyTrend', 'getDailyTrend', 'getAccountBreakdown'] as const)(
    'completes USD %s analytics without Yahoo', async method => {
      const { analyticsService } = await import('@/lib/services/analytics');
      const result = await withoutYahoo<unknown[]>(() => analyticsService[method]('synthetic-user', '2026-10-01', '2026-10-26'));
      expect(result.length).toBeGreaterThan(0);
    }
  );

  it('completes USD month-flow and recurring totals without Yahoo', async () => {
    fixture.rules = [{ id: 'usd-rule', user_id: 'synthetic-user', type: 'expense', is_active: true,
      amount: 100, currency: 'USD', frequency: 'monthly', start_date: '2026-10-01' }];
    const { getMonthFlow } = await import('@/lib/services/month-flow');
    expect(await withoutYahoo(() => getMonthFlow('synthetic-user')))
      .toMatchObject({ spentARS: 130050, incomeARS: 200, excludedCurrencies: [] });
  });

  it.each(['weekly', 'monthly'] as const)('completes USD %s summaries without Yahoo', async period => {
    if (period === 'monthly') fixture.transactions = transactions('2026-09-20T12:00:00.000Z');
    const { GET } = period === 'weekly'
      ? await import('@/app/api/cron/weekly-summary/route')
      : await import('@/app/api/cron/monthly-summary/route');
    const response = await withoutYahoo(() => GET(new NextRequest(`http://localhost/api/cron/${period}-summary`, {
      headers: { authorization: 'Bearer synthetic-cron-secret' },
    })));
    expect(await response.json()).toMatchObject({ success: true, processed: 1, errors: 0 });
    expect(fixture.notify).toHaveBeenCalledOnce();
    expect(fixture.notify.mock.calls[0][3]).toContain('Gastos: $130.050');
  });
});

describe('finding 6: aggregates consistently exclude stale display FX', () => {
  it('keeps the 24-day-old quote for display but excludes USD and its EUR cross from aggregates', async () => {
    const { cotizacionesService } = await import('@/lib/services/cotizaciones');
    const { buildToArsConverter } = await import('@/lib/services/transactions');
    expect((await cotizacionesService.getDolarQuotes()).blue).toMatchObject({ sell: 1300, stale: true });
    const converter = await buildToArsConverter([{ currency: 'ARS' }, { currency: 'USD' }, { currency: 'EUR' }]);
    expect(converter.toArs({ currency: 'ARS', amount: 50 })).toBe(50);
    expect(converter.toArs({ currency: 'USD', amount: 100 })).toBeNull();
    expect(converter.toArs({ currency: 'EUR', amount: 100 })).toBeNull();
    expect(converter.excludedCurrencies).toEqual(['USD', 'EUR']);
    expect(fixture.writes).not.toHaveBeenCalled();
  });

  it('also excludes a recent DB fallback marked stale instead of discarding that flag', async () => {
    for (const row of Object.values(fixture.rates)) row.timestamp = '2026-10-26T11:00:00.000Z';
    const { cotizacionesService } = await import('@/lib/services/cotizaciones');
    const { buildToArsConverter } = await import('@/lib/services/transactions');
    expect((await cotizacionesService.getDolarQuotes()).blue).toMatchObject({ stale: true });
    // A source timestamp within the executable limit is valid for a monetary write.
    expect(await cotizacionesService.getExchangeRate('USD', 'ARS')).toBe(1300);
    const converter = await buildToArsConverter([{ currency: 'USD' }]);
    expect(converter.toArs({ currency: 'USD', amount: 100 })).toBeNull();
    expect(converter.excludedCurrencies).toEqual(['USD']);
  });

  it('keeps monthly native counts and exposes exclusions without a stale total or category', async () => {
    const { transactionsService, excludedCurrenciesNote } = await import('@/lib/services/transactions');
    const summary = await transactionsService.getMonthSummary('synthetic-user', new Date());
    expect(summary).toMatchObject({ totalExpenses: 50, totalIncome: 200, balance: 150,
      transactionCount: 3, excludedCurrencies: ['USD'] });
    expect(summary.topCategories).toEqual([{ name: 'Pesos', icon: 'P', amount: 50 }]);
    expect(excludedCurrenciesNote(summary.excludedCurrencies)).toContain('USD: esos movimientos no están incluidos');
  });

  it.each(['getCategoryBreakdown', 'getMonthlyTrend', 'getDailyTrend', 'getAccountBreakdown'] as const)(
    'refuses an apparently complete %s response when a stale conversion was excluded', async method => {
      const { analyticsService } = await import('@/lib/services/analytics');
      await expect(analyticsService[method]('synthetic-user', '2026-10-01', '2026-10-26'))
        .rejects.toThrow('Cotizaciones no disponibles para USD');
    }
  );

  it('excludes stale trailing and recurring conversions and renders the month-flow notice', async () => {
    fixture.rules = [{ id: 'usd-rule', user_id: 'synthetic-user', type: 'expense', is_active: true,
      amount: 100, currency: 'USD', frequency: 'monthly', start_date: '2026-10-01' }];
    const { getMonthFlow } = await import('@/lib/services/month-flow');
    const flow = await getMonthFlow('synthetic-user');
    expect(flow).toMatchObject({ spentARS: 50, incomeARS: 200, excludedCurrencies: ['USD'] });
    expect(flow.projectedSpendARS).toBeCloseTo(50 + 50 / 14 * flow.daysLeft);
    const { default: MonthFlowCard } = await import('@/components/dashboard/MonthFlowCard');
    const html = renderToStaticMarkup(createElement(MonthFlowCard, { flow }));
    expect(html).toContain('Sin cotización para USD');
    expect(html).toContain('no están incluidos en los totales');
  });

  it('labels AI anomalies as partial and omits the stale USD anomaly', async () => {
    const { GET } = await import('@/app/api/ai/anomalies/route');
    const response = await GET(new NextRequest('http://localhost/api/ai/anomalies'));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ anomalies: [], partial: true, excludedCurrencies: ['USD'],
      message: expect.stringContaining('no están incluidos en los totales') });
  });

  it('does not produce AI projections using incomplete FX inputs', async () => {
    fixture.transactions = transactions('2026-09-20T12:00:00.000Z');
    const { GET } = await import('@/app/api/ai/projections/route');
    const response = await GET(new NextRequest('http://localhost/api/ai/projections'));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ hasData: false, excludedCurrencies: ['USD'],
      message: expect.stringContaining('No se puede proyectar sin cotización para USD') });
  });

  it.each(['weekly', 'monthly'] as const)('%s summaries label exclusions in both generated text and AI context', async period => {
    if (period === 'monthly') fixture.transactions = transactions('2026-09-20T12:00:00.000Z');
    const { GET } = period === 'weekly'
      ? await import('@/app/api/cron/weekly-summary/route')
      : await import('@/app/api/cron/monthly-summary/route');
    const response = await GET(new NextRequest(`http://localhost/api/cron/${period}-summary`, {
      headers: { authorization: 'Bearer synthetic-cron-secret' },
    }));
    expect(await response.json()).toMatchObject({ success: true, processed: 1, errors: 0 });
    expect(fixture.chat).toHaveBeenCalledTimes(1);
    expect(fixture.chat.mock.calls[0][0]).toContain('Sin cotización para USD: esos movimientos no están incluidos');
    expect(fixture.notify).toHaveBeenCalledTimes(1);
    const text = fixture.notify.mock.calls[0][3] as string;
    expect(text).toContain('Gastos: $50');
    expect(text).toContain('Sin cotización para USD: esos movimientos no están incluidos');
    expect(text).not.toContain('130.000');
    expect(fixture.writes).not.toHaveBeenCalled();
  });
});
