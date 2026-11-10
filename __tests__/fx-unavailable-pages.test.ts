import { FxUnavailableError } from '@/lib/executable-fx';
// Server renders and API use the real FX/account/transaction services; all IO is fixtures.
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fixture = vi.hoisted(() => ({
  account: {
    id: 'fixture-account', user_id: 'fixture-user', name: 'Caja de prueba', type: 'cash',
    currency: 'ARS', balance: 45250, is_active: true, is_debt: false,
    include_in_total: true, include_in_liquid: true, is_multicurrency: false,
    color: '#335599', icon: null, sort_order: 0,
  },
  transaction: {
    id: 'fixture-transaction', user_id: 'fixture-user', account_id: 'fixture-account',
    description: 'Compra de prueba', type: 'expense', amount: 1250, currency: 'ARS',
    amount_in_account_currency: 1250, exchange_rate: 1,
    transaction_date: '2026-10-25T12:00:00Z', created_at: '2026-10-25T12:00:00Z',
    account: { name: 'Caja de prueba', currency: 'ARS' }, category: null,
  },
  accountError: false,
  transactionError: false,
  categoriesError: false,
  fetch: vi.fn(),
  from: vi.fn(),
  budget: vi.fn(),
}));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'fixture-user' } }, error: null }) },
    from: fixture.from,
  }),
  createServiceClientSync: () => ({ from: fixture.from }),
}));
vi.mock('@/lib/auth/session', () => ({ getCachedUser: async () => ({ id: 'fixture-user' }) }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/expenses',
  unstable_rethrow: () => {},
  redirect: (url: string) => { throw new Error(`Unexpected redirect: ${url}`); },
}));
vi.mock('@/components/ui/ConfirmDialog', () => ({ useConfirm: () => vi.fn() }));
vi.mock('@/components/add-transaction/AddTransactionProvider', () => ({ useAddTransaction: () => ({ open: vi.fn() }) }));
vi.mock('@/components/accounts/CreateAccountButton', () => ({ default: () => null }));
vi.mock('@/components/expenses/CreateTransactionButton', () => ({ default: () => null }));
vi.mock('@/components/accounts/ArchivedAccountsPanel', () => ({ default: () => null }));
vi.mock('@/components/ui/MotionSection', () => ({ default: ({ children }: { children: import('react').ReactNode }) => children }));
vi.mock('@/components/dashboard/DashboardMore', () => ({ default: ({ children }: { children: import('react').ReactNode }) => children }));
vi.mock('@/components/dashboard/DashboardSpendingAnalyzerSection', () => ({ default: () => null }));
vi.mock('next/dynamic', async () => {
  const accounts = (await import('@/components/dashboard/AccountCards')).default;
  const transactions = (await import('@/components/dashboard/RecentTransactions')).default;
  return { default: (loader: () => unknown) => {
    const source = loader.toString();
    return source.includes('AccountCards') ? accounts : source.includes('RecentTransactions') ? transactions : () => null;
  } };
});
vi.mock('@/lib/services/investments', () => ({ investmentsService: { getPortfolioSummary: async () => null } }));
vi.mock('@/lib/services/net-worth', () => ({ getNetWorthHistory: async () => [] }));
vi.mock('@/lib/services/inflacion', () => ({ getInflacionSeries: async () => [], deflatorToToday: () => 1 }));
vi.mock('@/lib/services/market-history', () => ({ getMarketSparklines: async () => ({ blue: [], btc: [], eth: [] }) }));
vi.mock('@/lib/services/month-flow', () => ({ getMonthFlow: async () => null }));
vi.mock('@/lib/services/card-statement', () => ({ getCardStatements: async () => [], getCardStatement: async () => null }));
vi.mock('@/lib/services/real-returns', () => ({ getRealReturnsReport: async () => null }));
vi.mock('@/lib/services/upcoming', () => ({ getUpcoming: async () => [] }));
vi.mock('@/lib/services/budget-summary', () => ({ getTopBudgets: fixture.budget }));
vi.mock('@/lib/services/presentation-preferences', () => ({
  getPresentationPreferences: async () => ({ default_currency: 'ARS', net_worth_widget_visible: true }),
}));

import DashboardPage from '@/app/(authenticated)/dashboard/page';
import AccountsPage from '@/app/(authenticated)/accounts/page';
import ExpensesPage from '@/app/(authenticated)/expenses/page';
import { GET } from '@/app/api/accounts/route';
import NetWorthHero from '@/components/dashboard/NetWorthHero';
import FxStatusBanner from '@/components/ui/FxStatusBanner';
import InvestmentsList from '@/components/investments/InvestmentsList';
import QuotesWidget from '@/components/dashboard/QuotesWidget';
import type { InvestmentWithPnL } from '@/lib/services/investments';

beforeEach(() => {
  vi.clearAllMocks();
  fixture.accountError = false;
  fixture.transactionError = false;
  fixture.categoriesError = false;
  fixture.budget.mockResolvedValue([]);
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.stubGlobal('fetch', fixture.fetch);
  fixture.fetch.mockImplementation(async (url: string) => {
    if (url.includes('dolarapi')) return new Response(JSON.stringify(
      ['blue', 'oficial', 'bolsa', 'contadoconliqui'].map(casa => ({
        casa, compra: 1200, venta: 1300, fechaActualizacion: '2020-01-01T00:00:00Z',
      }))
    ), { status: 200 });
    return new Response('Provider unavailable', { status: 500 });
  });
  fixture.from.mockImplementation((table: string) => {
    let active = true;
    let single = false;
    const result = () => ({
      data: table === 'accounts' ? (active ? [fixture.account] : []) : table === 'transactions'
        ? [fixture.transaction] : single ? null : [],
      error: (table === 'accounts' && fixture.accountError)
        || (table === 'transactions' && fixture.transactionError)
        || (table === 'categories' && fixture.categoriesError)
        ? Object.assign(new Error('Fixture DB failure'), { code: '42501' }) : null,
    });
    const query: Record<string, unknown> = {};
    for (const method of ['select', 'eq', 'neq', 'order', 'limit', 'filter', 'or', 'in', 'range', 'gte', 'lte']) {
      query[method] = (...args: unknown[]) => {
        if (method === 'eq' && args[0] === 'is_active') active = args[1] as boolean;
        return query;
      };
    }
    query.single = query.maybeSingle = () => { single = true; return query; };
    query.then = (resolve: (value: unknown) => unknown) => Promise.resolve(result()).then(resolve);
    return query;
  });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function readable(html: string) { return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' '); }

describe('FX outages preserve financial server renders', () => {
  it('renders dashboard accounts, native balances and recent transactions while every FX provider fails', async () => {
    fixture.budget.mockRejectedValueOnce(new FxUnavailableError('blue'));
    const html = renderToStaticMarkup(await DashboardPage());
    const text = readable(html);
    expect(text).toContain('Caja de prueba');
    expect(text).toContain('45.250');
    expect(text).toContain('Compra de prueba');
    expect(text).toContain('Cotizaciones no disponibles');
    expect(text).toContain('Presupuestos no disponibles');
    expect(text).not.toContain('No pudimos cargar tus datos financieros');
    expect(text).not.toMatch(/NaN|Infinity/);
    expect(fixture.fetch.mock.calls.some(([url]) => String(url).includes('criptoya'))).toBe(true);
    expect(fixture.fetch.mock.calls.some(([url]) => String(url).includes('dolarapi'))).toBe(true);
    expect(fixture.from).toHaveBeenCalledWith('exchange_rates');
  });

  it('renders account names and native balances without converted zero totals', async () => {
    const text = readable(renderToStaticMarkup(await AccountsPage()));
    expect(text).toContain('Caja de prueba');
    expect(text).toContain('45.250');
    expect(text).toContain('Cotizaciones no disponibles');
    expect(text).not.toContain('Totales (cotización dólar blue)');
  });

  it('renders expenses and account filter data despite unavailable FX', async () => {
    const text = readable(renderToStaticMarkup(await ExpensesPage({ searchParams: Promise.resolve({}) })));
    expect(text).toContain('Compra de prueba');
    expect(text).toContain('Caja de prueba');
    expect(text).toContain('1.250');
    expect(text).toContain('Cotizaciones no disponibles');
    expect(text).not.toContain('No pudimos cargar tus datos financieros');
  });

  it('returns /api/accounts 200 with native balance, null conversions and availability flags', async () => {
    const response = await GET(new NextRequest('http://localhost/api/accounts'));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([expect.objectContaining({
      name: 'Caja de prueba', balance: 45250,
      balance_usd: null, balance_ars_blue: null, fxUnavailable: true,
    })]);
  });

  it('keeps the page-level fallback for an actual account DB failure', async () => {
    fixture.accountError = true;
    const text = readable(renderToStaticMarkup(await DashboardPage()));
    expect(text).toContain('No pudimos cargar tus datos financieros');
  });

  it('finding 5: accounts DB failures remain errors in the page and API during an FX outage', async () => {
    fixture.accountError = true;
    const text = readable(renderToStaticMarkup(await AccountsPage()));
    expect(text).toContain('No pudimos cargar tus datos financieros');
    expect(text).not.toContain('Cotizaciones no disponibles');
    const response = await GET(new NextRequest('http://localhost/api/accounts'));
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'Ocurrió un error procesando la solicitud.' });
  });

  it.each(['accountError', 'transactionError', 'categoriesError'] as const)(
    'finding 5: expenses show an error instead of empty data when %s occurs', async source => {
      fixture[source] = true;
      const text = readable(renderToStaticMarkup(await ExpensesPage({ searchParams: Promise.resolve({}) })));
      expect(text).toContain('No pudimos cargar tus datos financieros');
      expect(text).not.toContain('Cotizaciones no disponibles');
      expect(text).not.toContain('Traídos: 0');
    },
  );

  it('does not render a current numeric net worth when FX is unavailable', () => {
    const html = renderToStaticMarkup(createElement(NetWorthHero, {
      now: { totalUSD: 0, totalARSBlue: 0, liquidUSD: 0, investmentsUSD: 0, blueRate: null, fxUnavailable: true },
      history: [], inflacion: [],
    }));
    expect(html).toContain('Cotizaciones no disponibles');
    expect(html).not.toContain('<data');
  });

  it('renders a native investment value when converted values are null', () => {
    const investment: InvestmentWithPnL = {
      id: 'fixture-position', user_id: 'fixture-user', account_id: 'fixture-account',
      type: 'fci', ticker: null, name: 'Fondo de prueba', quantity: 10,
      purchase_price: 1.7, purchase_currency: 'USD', purchase_date: null,
      current_price: 1.75, current_price_updated_at: '2026-10-23T18:00:00Z',
      current_price_change_pct: null, market_currency: 'USD', market_price_currency: 'USD',
      payment_currency: null, law: null, is_manual_price: false, maturity_date: null,
      interest_rate: null, notes: null, is_active: true, created_at: '2026-10-01', updated_at: '2026-10-23',
      valuation_price_source: 'cache', current_value_native: 17.5, fxUnavailable: true,
      current_value: null, profit_loss: null, profit_loss_percent: null, cost_basis_usd: null,
      market_value_usd: null, market_value_ars_blue: null, profit_loss_usd: null,
      profit_loss_percent_usd: null, daily_change_pct: null, daily_pnl_usd: null,
      realized_pnl_usd: 0, sales_count: 0,
    };
    const text = readable(renderToStaticMarkup(createElement(InvestmentsList, { investments: [investment] })));
    expect(text).toContain('Fondo de prueba');
    expect(text).toContain('USD 17.50');
    expect(text).toContain('Cotizaciones no disponibles');
    expect(text).not.toMatch(/NaN|Infinity|≈ ARS 0/);
  });

  it('renders the quotes widget with missing rates and crypto instead of dereferencing them', () => {
    const text = readable(renderToStaticMarkup(createElement(QuotesWidget, {
      quotes: {
        dolar: { status: 'unavailable', missing: ['blue', 'oficial', 'mep', 'ccl'] },
        crypto: { btc: null, eth: null, usdt: null }, timestamp: '2026-10-25T12:00:00Z',
      },
    })));
    expect(text).toContain('Cotizaciones no disponibles');
    expect(text).toContain('Bitcoin');
    expect(text).not.toContain('En vivo');
    expect(text).not.toMatch(/NaN|Infinity/);
  });

  it('labels stale conversions with the original quote date', () => {
    const text = readable(renderToStaticMarkup(createElement(FxStatusBanner, {
      fxStale: true, fxAsOf: '2026-10-23T18:00:00Z',
    })));
    expect(text).toContain('Cotización del 23/10/2026');
  });
});
