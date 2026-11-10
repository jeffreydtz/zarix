import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  user: vi.fn(), auth: vi.fn(), from: vi.fn(), portfolio: vi.fn(), investments: vi.fn(),
  accounts: vi.fn(), archived: vi.fn(), investmentAccounts: vi.fn(), account: vi.fn(),
  transactions: vi.fn(), subscription: vi.fn(), queryError: null as unknown,
}));
vi.mock('@/lib/auth/session', () => ({ getCachedUser: mocks.user }));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: mocks.auth }, from: mocks.from }),
}));
vi.mock('@/lib/services/investments', () => ({ investmentsService: {
  getPortfolioSummary: mocks.portfolio, list: mocks.investments,
} }));
vi.mock('@/lib/services/accounts', () => ({ accountsService: {
  list: mocks.accounts, listArchived: mocks.archived, listInvestmentAccounts: mocks.investmentAccounts,
  getById: mocks.account, aggregateAccountTotals: () => null,
} }));
vi.mock('@/lib/services/transactions', () => ({ transactionsService: { list: mocks.transactions } }));
vi.mock('@/lib/services/subscriptions', () => ({ subscriptionsService: { getUserState: mocks.subscription } }));
vi.mock('@/lib/services/cotizaciones', () => ({ cotizacionesService: {
  getTransactionsFxRates: async () => ({ usdArs: null, eurArs: null, fxUnavailable: true }),
} }));
vi.mock('@/lib/services/card-statement', () => ({
  getCardStatement: async () => null,
  getCardStatements: async () => [],
}));
vi.mock('@/lib/services/real-returns', () => ({ getRealReturnsReport: async () => ({
  todayISO: '2026-11-10', disclaimer: 'Información comparativa.', inflationSource: { source: 'INDEC vía argentinadatos.com', lastFecha: null },
  quotes: { mep: { rate: null, source: null, asOf: null }, ccl: { rate: null, source: null, asOf: null } },
  periods: [],
}) }));
vi.mock('@/components/investments/PortfolioWidgets', () => ({ MarketDataWidget: () => null, InvestmentAccountsList: () => null }));
vi.mock('@/components/investments/InvestmentsWorkspace', () => ({
  default: ({ initialPortfolio }: { initialPortfolio: { fxUnavailable?: boolean; investments: { name: string }[] } }) =>
    createElement('div', {}, initialPortfolio.fxUnavailable ? 'Cotizaciones no disponibles' : '',
      ...initialPortfolio.investments.map(inv => createElement('p', { key: inv.name }, inv.name))),
}));
vi.mock('@/components/ui/MotionSection', () => ({ default: ({ children }: { children: ReactNode }) => children }));
vi.mock('@/components/accounts/AccountsList', () => ({ default: () => null }));
vi.mock('@/components/accounts/ArchivedAccountsPanel', () => ({ default: () => null }));
vi.mock('@/components/accounts/CreateAccountButton', () => ({ default: () => null }));
vi.mock('@/components/expenses/CreateTransactionButton', () => ({ default: () => null }));
vi.mock('@/components/expenses/TransactionsList', () => ({ default: () => null }));
vi.mock('@/components/expenses/TransactionsFilters', () => ({ default: () => null }));
vi.mock('@/components/accounts/CorrectDebtBalanceSign', () => ({ default: () => null }));
vi.mock('@/components/accounts/RepairCurrencyRangePanel', () => ({ default: () => null }));
vi.mock('@/components/accounts/ReconcileBalanceButton', () => ({ default: () => null }));
vi.mock('@/components/accounts/AccountDetailEditButton', () => ({ default: () => null }));

import InvestmentsPage from '@/app/(authenticated)/investments/page';
import AccountsPage from '@/app/(authenticated)/accounts/page';
import AccountDetailPage from '@/app/(authenticated)/accounts/[id]/page';
import ExpensesPage from '@/app/(authenticated)/expenses/page';
import { GET as getAccounts } from '@/app/api/accounts/route';
import { GET as getAccount } from '@/app/api/accounts/[id]/route';
import { GET as getInvestments } from '@/app/api/investments/route';
import { GET as getPortfolio } from '@/app/api/investments/portfolio/route';
import { GET as getTransactions } from '@/app/api/transactions/route';
import { errorResponse } from '@/lib/api-handler';
import { FxUnavailableError } from '@/lib/executable-fx';

const permissionError = () => Object.assign(new Error('Fixture permission failure'), { code: '42501' });
const request = new NextRequest('http://localhost/api/fixture');
const detail = { params: Promise.resolve({ id: 'fixture-account' }) };
const pageLoaders = [
  ['investments', () => InvestmentsPage()],
  ['accounts', () => AccountsPage()],
  ['expenses', () => ExpensesPage({ searchParams: Promise.resolve({}) })],
  ['account detail', () => AccountDetailPage(detail)],
] as const;
const apiLoaders = [
  ['investments', () => getInvestments()],
  ['portfolio', () => getPortfolio(request)],
  ['accounts', () => getAccounts(request)],
  ['account detail', () => getAccount(request, detail)],
  ['transactions', () => getTransactions(request)],
] as const;

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Real network forbidden')));
  mocks.user.mockResolvedValue({ id: 'fixture-user' });
  mocks.auth.mockResolvedValue({ data: { user: { id: 'fixture-user' } }, error: null });
  mocks.portfolio.mockResolvedValue({ fxUnavailable: true, investments: [{ name: 'Fondo de prueba' }] });
  mocks.investments.mockResolvedValue([{ name: 'Fondo de prueba', fxUnavailable: true }]);
  mocks.accounts.mockResolvedValue([]);
  mocks.archived.mockResolvedValue([]);
  mocks.investmentAccounts.mockResolvedValue([]);
  mocks.account.mockResolvedValue(null);
  mocks.transactions.mockResolvedValue([]);
  mocks.subscription.mockResolvedValue(null);
  mocks.queryError = null;
  mocks.from.mockImplementation(() => {
    const query: Record<string, unknown> = {};
    for (const method of ['select', 'eq', 'not', 'gte', 'lte', 'order', 'or']) query[method] = () => query;
    query.then = (resolve: (value: unknown) => unknown) => Promise.resolve({ data: [], error: mocks.queryError }).then(resolve);
    return query;
  });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('finding 5: read errors are distinct from FX outages', () => {
  it('preserves native investments and an FX banner during an FX outage', async () => {
    const html = renderToStaticMarkup(await InvestmentsPage());
    expect(html).toContain('Fondo de prueba');
    expect(html).toContain('Cotizaciones no disponibles');
    expect(html).not.toContain('role="alert"');
  });

  it.each(['portfolio', 'investmentAccounts', 'subscription', 'maturities'] as const)(
    'surfaces investment %s DB/RLS errors without an empty portfolio or FX banner', async source => {
      if (source === 'maturities') mocks.queryError = permissionError();
      else mocks[source].mockRejectedValueOnce(permissionError());
      const html = renderToStaticMarkup(await InvestmentsPage());
      expect(html).toContain('No pudimos cargar tus datos financieros');
      expect(html).not.toContain('Cotizaciones no disponibles');
      expect(html).not.toContain('Fondo de prueba');
    },
  );

  it.each(pageLoaders)('%s preserves session redirects', async (_name, load) => {
    mocks.user.mockResolvedValueOnce(null);
    await expect(load()).rejects.toMatchObject({ digest: expect.stringContaining('NEXT_REDIRECT;replace;/login;') });
  });

  it.each(pageLoaders)('%s surfaces auth outages without redirecting to login', async (_name, load) => {
    mocks.user.mockRejectedValueOnce(new Error('Fixture auth outage'));
    expect(renderToStaticMarkup(await load())).toContain('No pudimos cargar tus datos financieros');
  });

  it.each(pageLoaders)('%s preserves notFound control flow from a dependency', async (_name, load) => {
    const sentinel = Object.assign(new Error('Fixture not found'), { digest: 'NEXT_HTTP_ERROR_FALLBACK;404' });
    mocks.user.mockRejectedValueOnce(sentinel);
    await expect(load()).rejects.toBe(sentinel);
  });

  it('account detail distinguishes a missing row from a DB/RLS failure', async () => {
    await expect(AccountDetailPage(detail)).rejects.toMatchObject({ digest: 'NEXT_HTTP_ERROR_FALLBACK;404' });
    mocks.account.mockRejectedValueOnce(permissionError());
    expect(renderToStaticMarkup(await AccountDetailPage(detail))).toContain('No pudimos cargar tus datos financieros');
    mocks.account.mockRejectedValueOnce(permissionError());
    expect((await getAccount(request, detail)).status).toBe(500);
    expect((await getAccount(request, detail)).status).toBe(404);
  });

  it.each(apiLoaders)('%s API reports DB errors as errors', async (_name, load) => {
    for (const service of ['investments', 'portfolio', 'accounts', 'account', 'transactions'] as const) {
      mocks[service].mockRejectedValue(permissionError());
    }
    const response = await load();
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'Ocurrió un error procesando la solicitud.' });
  });

  it.each(apiLoaders)('%s API distinguishes auth outage and missing session', async (_name, load) => {
    mocks.auth.mockResolvedValueOnce({ data: { user: null }, error: new Error('Fixture auth outage') });
    expect((await load()).status).toBe(503);
    mocks.auth.mockResolvedValueOnce({ data: { user: null }, error: null });
    expect((await load()).status).toBe(401);
  });

  it('keeps clear Spanish executable-FX errors and framework control flow in API responses', async () => {
    const response = errorResponse(new FxUnavailableError('USD/ARS'));
    expect(response.status).toBe(503);
    expect((await response.json()).error).toMatch(/Cotización.*USD\/ARS.*vencida/);
    const sentinel = Object.assign(new Error('Fixture redirect'), { digest: 'NEXT_REDIRECT;replace;/login;307;' });
    expect(() => errorResponse(sentinel)).toThrow(sentinel);
  });
});
