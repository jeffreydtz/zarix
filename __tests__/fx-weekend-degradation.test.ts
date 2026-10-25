import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  insert: vi.fn(),
  rpc: vi.fn(),
  user: vi.fn(),
  cachedUser: vi.fn(),
  rates: {} as Record<string, { rate: number; timestamp: string }>,
  accounts: [] as Array<Record<string, unknown>>,
  transactions: vi.fn(),
  portfolio: vi.fn(),
  history: vi.fn(),
  snapshot: vi.fn(),
  inflacion: vi.fn(),
  sparklines: vi.fn(),
  monthFlow: vi.fn(),
  upcoming: vi.fn(),
  budgets: vi.fn(),
  preferences: vi.fn(),
  totals: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: mocks.user },
    from: mocks.from,
  }),
  createServiceClientSync: () => ({ from: mocks.from, rpc: mocks.rpc }),
}));
vi.mock('@/lib/auth/session', () => ({ getCachedUser: mocks.cachedUser }));
vi.mock('@/lib/services/transactions', () => ({ transactionsService: { list: mocks.transactions } }));
vi.mock('@/lib/services/investments', () => ({ investmentsService: { getPortfolioSummary: mocks.portfolio } }));
vi.mock('@/lib/services/net-worth', () => ({ getNetWorthHistory: mocks.history, recordNetWorthSnapshot: mocks.snapshot }));
vi.mock('@/lib/services/presentation-preferences', () => ({ getPresentationPreferences: mocks.preferences }));
vi.mock('@/lib/services/inflacion', () => ({ getInflacionSeries: mocks.inflacion }));
vi.mock('@/lib/services/market-history', () => ({ getMarketSparklines: mocks.sparklines }));
vi.mock('@/lib/services/month-flow', () => ({ getMonthFlow: mocks.monthFlow }));
vi.mock('@/lib/services/upcoming', () => ({ getUpcoming: mocks.upcoming }));
vi.mock('@/lib/services/budget-summary', () => ({ getTopBudgets: mocks.budgets }));
vi.mock('@/components/accounts/AccountsList', () => ({
  default: ({ accounts }: { accounts: Array<{ id: string; name: string; balance: number; currency: string }> }) =>
    createElement('div', { 'data-testid': 'accounts-list' },
      accounts.map((account) => createElement('div', { key: account.id }, `${account.name} ${account.balance} ${account.currency}`))),
}));
vi.mock('@/components/accounts/ArchivedAccountsPanel', () => ({ default: () => null }));
vi.mock('@/components/accounts/CreateAccountButton', () => ({ default: () => null }));
vi.mock('@/components/expenses/CreateTransactionButton', () => ({ default: () => null }));
vi.mock('@/components/expenses/TransactionsFilters', () => ({ default: () => null }));
vi.mock('@/components/expenses/TransactionsList', () => ({
  default: ({ transactions }: { transactions: Array<{ id: string; description: string; amount: number }> }) =>
    createElement('div', { 'data-testid': 'transactions-list' },
      transactions.map((tx) => createElement('div', { key: tx.id }, `${tx.description} ${tx.amount}`))),
}));
vi.mock('@/components/dashboard/NetWorthHero', () => ({
  default: ({ now }: { now: unknown }) => createElement('div', { 'data-testid': 'net-worth' }, JSON.stringify(now)),
}));
vi.mock('@/components/dashboard/MarketStrip', () => ({
  default: ({ quotes }: { quotes: unknown }) => createElement('div', { 'data-testid': 'quotes' }, JSON.stringify(quotes)),
}));
vi.mock('@/components/dashboard/MonthFlowCard', () => ({ default: () => null }));
vi.mock('@/components/dashboard/UpcomingRail', () => ({ default: () => null }));
vi.mock('@/components/dashboard/BudgetCluster', () => ({ default: () => null }));
vi.mock('@/components/dashboard/StickyNetWorthBar', () => ({ default: () => null }));
vi.mock('@/components/dashboard/DashboardSpendingAnalyzerSection', () => ({ default: () => null }));
vi.mock('@/components/dashboard/DashboardMore', () => ({ default: ({ children }: { children: ReactNode }) => children }));
vi.mock('@/components/ui/MotionSection', () => ({ default: ({ children }: { children: ReactNode }) => children }));
vi.mock('@/components/dashboard/AccountCards', () => ({
  default: ({ accounts }: { accounts: Array<{ id: string; name: string; balance: number; currency: string }> }) =>
    createElement('div', { 'data-testid': 'account-cards' },
      accounts.map((account) => createElement('div', { key: account.id }, `${account.name} ${account.balance} ${account.currency}`))),
}));
vi.mock('@/components/dashboard/RecentTransactions', () => ({
  default: ({ transactions }: { transactions: Array<{ id: string; description: string; amount: number }> }) =>
    createElement('div', { 'data-testid': 'recent-tx' },
      transactions.map((tx) => createElement('div', { key: tx.id }, `${tx.description} ${tx.amount}`))),
}));
vi.mock('@/components/dashboard/CreditCardsWidget', () => ({ default: () => null }));
vi.mock('@/components/dashboard/AnomaliesWidget', () => ({ default: () => null }));
vi.mock('next/dynamic', () => ({
  default: (loader: () => Promise<{ default: unknown }>) => {
    void loader;
    return ({ accounts, transactions }: {
      accounts?: Array<{ id: string; name: string; balance: number; currency: string }>;
      transactions?: Array<{ id: string; description: string; amount: number }>;
    }) => {
      if (accounts) {
        return createElement('div', { 'data-testid': 'account-cards' },
          accounts.map((account) => createElement('div', { key: account.id }, `${account.name} ${account.balance} ${account.currency}`)));
      }
      if (transactions) {
        return createElement('div', { 'data-testid': 'recent-tx' },
          transactions.map((tx) => createElement('div', { key: tx.id }, `${tx.description} ${tx.amount}`)));
      }
      return null;
    };
  },
}));

const sources = ['blue', 'oficial', 'mep', 'ccl'] as const;
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { 'content-type': 'application/json' },
});

const NOW = '2026-10-25T03:30:00.000Z';
const weekendCriptoYa = () => ({
  blue: { bid: 1470, ask: 1490, timestamp: Date.parse('2026-10-25T03:15:00.000Z') / 1000 },
  oficial: { bid: 1300, ask: 1350, timestamp: Date.parse('2026-10-25T03:15:00.000Z') / 1000 },
  mep: { al30: { '24hs': { price: 1450, timestamp: Date.parse('2026-10-23T19:59:00.000Z') / 1000 } } },
  ccl: { al30: { '24hs': { price: 1460, timestamp: Date.parse('2026-10-23T19:59:00.000Z') / 1000 } } },
});
const staleDolarApi = () => ['blue', 'oficial', 'bolsa', 'contadoconliqui'].map((casa) => ({
  casa, compra: 1400, venta: 1500, fechaActualizacion: '2026-10-20T03:30:00.000Z',
}));

const fixtureAccount = {
  id: 'fixture-bank-ars',
  user_id: 'synthetic-user',
  name: 'Caja de ahorro',
  type: 'bank',
  currency: 'ARS',
  balance: 150000,
  icon: null,
  color: '#3B82F6',
  is_debt: false,
  include_in_total: true,
  include_in_liquid: true,
  min_balance: null,
  credit_limit: null,
  closing_day: null,
  due_day: null,
  last_4_digits: null,
  is_multicurrency: false,
  secondary_currency: null,
  sort_order: 0,
  is_active: true,
  created_at: NOW,
  updated_at: NOW,
};

const fixtureTx = {
  id: 'fixture-tx-1',
  description: 'Supermercado',
  amount: 12000,
  currency: 'ARS',
  transaction_date: '2026-10-24',
};

function emptyRates() {
  return {} as Record<string, { rate: number; timestamp: string }>;
}

function weekendDbRates() {
  return {
    blue: { rate: 1490, timestamp: '2026-10-24T09:44:00.000Z' },
    blue_buy: { rate: 1470, timestamp: '2026-10-24T09:44:00.000Z' },
    oficial: { rate: 1350, timestamp: '2026-10-24T09:45:00.000Z' },
    oficial_buy: { rate: 1300, timestamp: '2026-10-24T09:45:00.000Z' },
    mep: { rate: 1450, timestamp: '2026-10-23T20:57:00.000Z' },
    mep_buy: { rate: 1450, timestamp: '2026-10-23T20:57:00.000Z' },
    ccl: { rate: 1460, timestamp: '2026-10-23T20:57:00.000Z' },
    ccl_buy: { rate: 1460, timestamp: '2026-10-23T20:57:00.000Z' },
  };
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(NOW));
  vi.stubEnv('EXCHANGE_RATE_CACHE_TTL', '300');
  vi.stubEnv('EXCHANGE_RATE_MAX_AGE_SECONDS', '86400');
  vi.stubEnv('EXCHANGE_RATE_MARKET_MAX_AGE_SECONDS', '345600');
  vi.stubEnv('MARKET_DATA_TIMEOUT_MS', '8000');
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  mocks.accounts = [{ ...fixtureAccount }];
  mocks.rates = weekendDbRates();
  mocks.insert.mockResolvedValue({ error: null });
  mocks.rpc.mockResolvedValue({ data: [], error: null });
  mocks.user.mockResolvedValue({ data: { user: { id: 'synthetic-user' } } });
  mocks.cachedUser.mockResolvedValue({ id: 'synthetic-user' });
  mocks.transactions.mockResolvedValue([fixtureTx]);
  mocks.portfolio.mockResolvedValue({
    totalCurrentValue: 0, totalCurrentValueArsBlue: 0, blueArsPerUsd: 0,
    fxUnavailable: true, investments: [],
  });
  mocks.history.mockResolvedValue([]);
  mocks.snapshot.mockResolvedValue(false);
  mocks.inflacion.mockResolvedValue([]);
  mocks.sparklines.mockResolvedValue({ blue: [], btc: [], eth: [] });
  mocks.monthFlow.mockResolvedValue({ incomeARS: 0, spentARS: 0 });
  mocks.upcoming.mockResolvedValue([]);
  mocks.budgets.mockResolvedValue([]);
  mocks.preferences.mockResolvedValue({ default_currency: 'ARS', net_worth_widget_visible: true });
  mocks.from.mockImplementation((table: string) => {
    let source = '';
    let timestamp: string | undefined;
    const query: Record<string, unknown> = {};
    const rows = () => {
      if (table === 'accounts') return mocks.accounts;
      if (table === 'categories') return [];
      return [];
    };
    query.select = () => query;
    query.eq = (key: string, value: string) => {
      if (key === 'source') source = value;
      if (key === 'timestamp') timestamp = value;
      return query;
    };
    query.neq = () => query;
    query.in = () => query;
    query.or = () => query;
    query.order = () => query;
    query.limit = () => query;
    query.single = async () => ({ data: mocks.rates[source] ?? null, error: null });
    query.maybeSingle = async () => ({
      data: mocks.rates[source] && (!timestamp || mocks.rates[source].timestamp === timestamp)
        ? mocks.rates[source] : null,
      error: null,
    });
    query.insert = mocks.insert;
    query.then = (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
      Promise.resolve({ data: rows(), error: null }).then(resolve, reject);
    return query;
  });
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json(weekendCriptoYa())));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('weekend FX merge', () => {
  it('resolves with MEP flagged stale when blue is fresh and MEP is 30h old', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(json(weekendCriptoYa()))
      .mockResolvedValueOnce(json([
        { casa: 'blue', compra: 1470, venta: 1490, fechaActualizacion: '2026-10-25T03:10:00.000Z' },
        { casa: 'oficial', compra: 1300, venta: 1350, fechaActualizacion: '2026-10-23T18:55:00.000Z' },
        { casa: 'bolsa', compra: 1440, venta: 1440, fechaActualizacion: '2026-10-24T20:59:00.000Z' },
        { casa: 'contadoconliqui', compra: 1460, venta: 1460, fechaActualizacion: '2026-10-24T20:59:00.000Z' },
      ]));
    const { cotizacionesService } = await import('@/lib/services/cotizaciones');
    const quotes = await cotizacionesService.getDolarQuotes();
    expect(quotes.blue?.sell).toBe(1490);
    expect(quotes.blue?.stale).toBe(false);
    expect(quotes.mep?.sell).toBe(1450);
    expect(quotes.mep?.stale).toBe(true);
    expect(quotes.mep?.asOf).toBe('2026-10-23T19:59:00.000Z');
    expect(quotes.oficial?.stale).toBe(false);
  });

  it('returns blue when MEP is 120h old and missing', async () => {
    const data = weekendCriptoYa();
    data.mep.al30['24hs'].timestamp = Date.parse('2026-10-20T03:30:00.000Z') / 1000;
    data.ccl.al30['24hs'].timestamp = Date.parse('2026-10-20T03:30:00.000Z') / 1000;
    mocks.rates.mep.timestamp = '2026-10-20T03:30:00.000Z';
    mocks.rates.mep_buy.timestamp = '2026-10-20T03:30:00.000Z';
    mocks.rates.ccl.timestamp = '2026-10-20T03:30:00.000Z';
    mocks.rates.ccl_buy.timestamp = '2026-10-20T03:30:00.000Z';
    vi.mocked(fetch).mockResolvedValue(json(data));
    const { cotizacionesService } = await import('@/lib/services/cotizaciones');
    const quotes = await cotizacionesService.getDolarQuotes();
    expect(quotes.blue?.sell).toBe(1490);
    expect(quotes.mep).toBeUndefined();
  });

  it('persists fresh blue while MEP is stale', async () => {
    vi.mocked(fetch).mockResolvedValue(json(weekendCriptoYa()));
    const { cotizacionesService } = await import('@/lib/services/cotizaciones');
    await cotizacionesService.getDolarQuotes();
    const rows = mocks.insert.mock.calls[0][0] as Array<{ source: string; rate: number }>;
    expect(rows).toContainEqual(expect.objectContaining({ source: 'blue', rate: 1490 }));
    expect(rows).toContainEqual(expect.objectContaining({ source: 'mep', rate: 1450 }));
  });

  it('throws typed FxUnavailable when every provider fails', async () => {
    mocks.rates = emptyRates();
    vi.mocked(fetch)
      .mockResolvedValueOnce(json({ error: 'down' }, 500))
      .mockResolvedValueOnce(json(staleDolarApi()));
    const { cotizacionesService, FxUnavailableError } = await import('@/lib/services/cotizaciones');
    await expect(cotizacionesService.getDolarQuotes()).rejects.toBeInstanceOf(FxUnavailableError);
  });
});

describe('callers degrade instead of throwing', () => {
  it('list returns native balances when all providers fail', async () => {
    mocks.rates = emptyRates();
    vi.mocked(fetch)
      .mockResolvedValueOnce(json({ error: 'down' }, 500))
      .mockResolvedValueOnce(json(staleDolarApi()));
    const { accountsService } = await import('@/lib/services/accounts');
    const listed = await accountsService.list('synthetic-user');
    expect(listed[0]).toMatchObject({
      name: 'Caja de ahorro', balance: 150000, currency: 'ARS',
      valuation: { fxUnavailable: true, status: 'fx_unavailable' },
    });
    expect(listed[0]).not.toHaveProperty('balance_usd');
    expect(listed[0]).not.toHaveProperty('balance_ars_blue');
  });

  it('GET /api/accounts returns 200 with native balances when FX is down', async () => {
    mocks.rates = emptyRates();
    vi.mocked(fetch)
      .mockResolvedValueOnce(json({ error: 'down' }, 500))
      .mockResolvedValueOnce(json(staleDolarApi()));
    const { GET } = await import('@/app/api/accounts/route');
    const response = await GET(new NextRequest('http://localhost/api/accounts'));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body[0]).toMatchObject({
      name: 'Caja de ahorro', balance: 150000, currency: 'ARS',
      valuation: { fxUnavailable: true },
    });
    expect(body[0].balance_usd).toBeUndefined();
  });
});

describe('pages keep native data when every FX provider fails', () => {
  async function failAllProviders() {
    mocks.rates = emptyRates();
    vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('criptoya')) return json({ error: 'down' }, 500);
      if (url.includes('dolarapi')) return json(staleDolarApi());
      return json({ error: 'down' }, 500);
    });
  }

  it('renders DashboardPage with names, native balances, transactions and FX banner', async () => {
    await failAllProviders();
    const DashboardPage = (await import('@/app/(authenticated)/dashboard/page')).default;
    const html = renderToStaticMarkup(await DashboardPage());
    expect(html).toContain('Caja de ahorro');
    expect(html).toContain('150000');
    expect(html).toContain('Supermercado');
    expect(html).toContain('Cotizaciones no disponibles');
    expect(html).not.toContain('No pudimos cargar tus datos financieros');
  });

  it('renders AccountsPage with native balances and FX banner', async () => {
    await failAllProviders();
    const AccountsPage = (await import('@/app/(authenticated)/accounts/page')).default;
    const html = renderToStaticMarkup(await AccountsPage());
    expect(html).toContain('Caja de ahorro');
    expect(html).toContain('150000');
    expect(html).toContain('Cotizaciones no disponibles');
    expect(html).not.toContain('No pudimos cargar tus datos financieros');
  });

  it('renders ExpensesPage with accounts, transactions and FX banner', async () => {
    await failAllProviders();
    const ExpensesPage = (await import('@/app/(authenticated)/expenses/page')).default;
    const html = renderToStaticMarkup(await ExpensesPage({ searchParams: Promise.resolve({}) }));
    expect(html).toContain('Caja de ahorro');
    expect(html).toContain('150000');
    expect(html).toContain('Supermercado');
    expect(html).toContain('Cotizaciones no disponibles');
    expect(html).not.toContain('No pudimos cargar tus datos financieros');
  });
});
