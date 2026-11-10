import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  user: vi.fn(), accounts: vi.fn(), transactions: vi.fn(), portfolio: vi.fn(),
  quotes: vi.fn(), dolar: vi.fn(), history: vi.fn(), snapshot: vi.fn(),
  inflacion: vi.fn(), sparklines: vi.fn(), monthFlow: vi.fn(), cardStatements: vi.fn(), realReturns: vi.fn(), upcoming: vi.fn(), budgets: vi.fn(),
  totals: vi.fn(),
  preferences: vi.fn(),
}));

vi.mock('@/lib/auth/session', () => ({ getCachedUser: mocks.user }));
vi.mock('@/lib/services/accounts', () => ({ accountsService: { list: mocks.accounts, aggregateAccountTotals: mocks.totals } }));
vi.mock('@/lib/services/transactions', () => ({ transactionsService: { list: mocks.transactions } }));
vi.mock('@/lib/services/investments', () => ({ investmentsService: { getPortfolioSummary: mocks.portfolio } }));
vi.mock('@/lib/services/cotizaciones', () => ({ cotizacionesService: { getAllQuotes: mocks.quotes, getDolarQuotes: mocks.dolar } }));
vi.mock('@/lib/services/net-worth', () => ({ getNetWorthHistory: mocks.history, recordNetWorthSnapshot: mocks.snapshot }));
vi.mock('@/lib/services/presentation-preferences', () => ({ getPresentationPreferences: mocks.preferences }));
vi.mock('@/lib/services/inflacion', () => ({ getInflacionSeries: mocks.inflacion }));
vi.mock('@/lib/services/market-history', () => ({ getMarketSparklines: mocks.sparklines }));
vi.mock('@/lib/services/month-flow', () => ({ getMonthFlow: mocks.monthFlow }));
vi.mock('@/lib/services/card-statement', () => ({ getCardStatements: mocks.cardStatements }));
vi.mock('@/lib/services/real-returns', () => ({ getRealReturnsReport: mocks.realReturns }));
vi.mock('@/lib/services/upcoming', () => ({ getUpcoming: mocks.upcoming }));
vi.mock('@/lib/services/budget-summary', () => ({ getTopBudgets: mocks.budgets }));
vi.mock('next/dynamic', () => ({ default: () => () => null }));
vi.mock('@/components/dashboard/NetWorthHero', () => ({ default: ({ now, baseCurrency }: { now: unknown; baseCurrency: unknown }) => createElement('div', { 'data-testid': 'net-worth', 'data-base-currency': baseCurrency }, JSON.stringify(now)) }));
vi.mock('@/components/dashboard/MarketStrip', () => ({ default: ({ quotes }: { quotes: unknown }) => createElement('div', { 'data-testid': 'quotes' }, JSON.stringify(quotes)) }));
vi.mock('@/components/dashboard/MonthFlowCard', () => ({ default: () => null }));
vi.mock('@/components/dashboard/UpcomingRail', () => ({ default: () => null }));
vi.mock('@/components/dashboard/BudgetCluster', () => ({ default: () => null }));
vi.mock('@/components/dashboard/StickyNetWorthBar', () => ({ default: () => createElement('div', { 'data-testid': 'sticky-net-worth' }) }));
vi.mock('@/components/dashboard/DashboardSpendingAnalyzerSection', () => ({ default: () => null }));
vi.mock('@/components/dashboard/DashboardMore', () => ({ default: ({ children }: { children: ReactNode }) => children }));
vi.mock('@/components/ui/MotionSection', () => ({ default: ({ children }: { children: ReactNode }) => children }));

import DashboardPage from '@/app/(authenticated)/dashboard/page';
import { FxUnavailableError } from '@/lib/executable-fx';

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  mocks.user.mockResolvedValue({ id: 'synthetic-user' });
  mocks.preferences.mockResolvedValue({ default_currency: 'ARS', net_worth_widget_visible: true });
  mocks.accounts.mockResolvedValue([{ id: 'synthetic-account' }]);
  mocks.transactions.mockResolvedValue([]);
  mocks.portfolio.mockResolvedValue({ totalCurrentValue: 20, totalCurrentValueArsBlue: 24000, blueArsPerUsd: 1200, investments: [] });
  mocks.quotes.mockResolvedValue({ dolar: { blue: { sell: 1200 } }, crypto: {} });
  mocks.dolar.mockResolvedValue({ blue: { sell: 1200 } });
  mocks.history.mockResolvedValue([]);
  mocks.snapshot.mockResolvedValue(true);
  mocks.inflacion.mockResolvedValue([]);
  mocks.sparklines.mockResolvedValue({ blue: [], btc: [], eth: [] });
  mocks.monthFlow.mockResolvedValue({ incomeARS: 100, spentARS: 20 });
  mocks.cardStatements.mockResolvedValue([]);
  mocks.realReturns.mockResolvedValue(null);
  mocks.upcoming.mockResolvedValue([]);
  mocks.budgets.mockResolvedValue([]);
  mocks.totals.mockReturnValue({
    liquidUSD: 100, liquidARSBlue: 120000, investmentsUSD: 0, totalUSD: 100, totalARSBlue: 120000,
    availableUSD: 100, availableARSBlue: 120000, creditCardDebtUSD: 0, creditCardDebtARSBlue: 0, creditCards: [],
    blueReferences: [],
  });
});
afterEach(() => vi.restoreAllMocks());

describe('dashboard read failures preserve financial truth', () => {
  it.each(['dolar', 'quotes', 'history', 'monthFlow', 'upcoming', 'budgets', 'preferences', 'sparklines'] as const)(
    'M4: surfaces %s DB/RLS errors distinctly from FX outages', async source => {
      const failure = Object.assign(new Error('Fixture permission failure'), { code: '42501' });
      mocks[source].mockRejectedValueOnce(failure);
      const html = renderToStaticMarkup(await DashboardPage());
      expect(html).toContain('role="alert"');
      expect(html).toContain('No pudimos cargar tus datos financieros');
      expect(html).not.toContain('Cotizaciones no disponibles');
      expect(html).not.toContain('data-testid="net-worth"');
      expect(mocks.snapshot).not.toHaveBeenCalled();
    },
  );

  it.each(['dolar', 'quotes', 'history', 'monthFlow', 'upcoming', 'budgets', 'preferences', 'sparklines'] as const)(
    'M4: preserves framework redirects from %s', async source => {
      const redirect = Object.assign(new Error('Fixture redirect'), { digest: 'NEXT_REDIRECT;replace;/login;307;' });
      mocks[source].mockRejectedValueOnce(redirect);
      await expect(DashboardPage()).rejects.toBe(redirect);
    },
  );
  it('CP3-17: uses the current owner saved base and never writes financial history on render', async () => {
    mocks.preferences.mockResolvedValue({ default_currency: 'USD', net_worth_widget_visible: true });
    const html = renderToStaticMarkup(await DashboardPage());
    expect(html).toContain('data-base-currency="USD"');
    expect(mocks.preferences).toHaveBeenCalledExactlyOnceWith('synthetic-user');
    expect(mocks.snapshot).not.toHaveBeenCalled();
  });
  it('CP3-17: hides both patrimoine widgets without hiding accounts, markets or rewriting history', async () => {
    mocks.preferences.mockResolvedValue({ default_currency: 'USD', net_worth_widget_visible: false });
    const html = renderToStaticMarkup(await DashboardPage());
    expect(html).not.toContain('data-testid="net-worth"');
    expect(html).not.toContain('networth-sentinel');
    expect(html).toContain('data-testid="quotes"');
    expect(mocks.snapshot).not.toHaveBeenCalled();
  });
  it('propagates explicit known-subtotal exclusions and never records a partial current point', async () => {
    mocks.portfolio.mockResolvedValue({ totalCurrentValue: 0, totalCurrentValueArsBlue: 0, investments: [] });
    mocks.totals.mockReturnValue({ liquidUSD: 100, liquidARSBlue: 120000, investmentsUSD: 0, totalUSD: 100, totalARSBlue: 120000,
      availableUSD: 100, availableARSBlue: 120000, creditCardDebtUSD: 0, creditCardDebtARSBlue: 0, creditCards: [],
      valuation: { status: 'partial', excludedAccounts: [{ accountId: 'legacy', name: 'Legacy', currency: 'ZZZ', balance: 10, currencies: ['ZZZ'], reason: 'unsupported_currency' }] } });
    const html = renderToStaticMarkup(await DashboardPage());
    expect(html).toContain('&quot;totalARSBlue&quot;:120000');
    expect(html).toContain('&quot;status&quot;:&quot;partial&quot;');
    expect(html).toContain('&quot;currency&quot;:&quot;ZZZ&quot;');
    expect(html).not.toContain('No pudimos cargar tus datos financieros');
    expect(mocks.accounts).toHaveBeenCalledWith('synthetic-user', { allowPartialValuation: true });
    expect(mocks.snapshot).not.toHaveBeenCalled();
  });
  it.each(['accounts', 'transactions', 'portfolio'] as const)(
    'shows unavailable and retry instead of partial financial values when %s fails', async source => {
      mocks[source].mockRejectedValueOnce(new Error('synthetic database timeout'));
      const html = renderToStaticMarkup(await DashboardPage());
      expect(html).toContain('role="alert"');
      expect(html).toContain('No pudimos cargar tus datos financieros');
      expect(html).toContain('href="/dashboard"');
      expect(html).not.toContain('data-testid="net-worth"');
      expect(mocks.snapshot).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['history', 'Historial de patrimonio no disponible.'],
    ['monthFlow', 'Resumen mensual no disponible.'],
    ['upcoming', 'Próximos movimientos no disponibles.'],
    ['budgets', 'Presupuestos no disponibles.'],
  ] as const)('isolates the %s section failure while preserving available accounts', async (source, fallback) => {
    mocks[source].mockRejectedValueOnce(new FxUnavailableError('blue'));
    const html = renderToStaticMarkup(await DashboardPage());
    expect(html).toContain(fallback);
    expect(html).toContain('data-testid="net-worth"');
    expect(html).not.toContain('No pudimos cargar tus datos financieros');
    expect(mocks.snapshot).not.toHaveBeenCalled();
  });

  it('finding 8: keeps both net-worth widgets hidden when saved preferences cannot be read', async () => {
    mocks.preferences.mockResolvedValueOnce({ default_currency: 'USD', net_worth_widget_visible: false });
    expect(renderToStaticMarkup(await DashboardPage())).not.toContain('data-testid="net-worth"');
    mocks.preferences.mockRejectedValueOnce(Object.assign(new Error('synthetic preferences permission error'), { code: '42501' }));
    const html = renderToStaticMarkup(await DashboardPage());
    expect(html).not.toContain('data-testid="net-worth"');
    expect(html).not.toContain('data-testid="sticky-net-worth"');
    expect(html).not.toContain('networth-sentinel');
    expect(html).not.toContain('data-testid="quotes"');
    expect(html).toContain('No pudimos cargar tus datos financieros');
  });

  it('adds complete account and portfolio values when every financial read succeeds', async () => {
    const html = renderToStaticMarkup(await DashboardPage());
    expect(html).toContain('&quot;totalUSD&quot;:100');
    expect(html).toContain('&quot;totalARSBlue&quot;:120000');
    expect(html).toContain('&quot;positionsUSD&quot;:20');
    expect(mocks.snapshot).not.toHaveBeenCalled();
  });

  it('labels unavailable market quotes without fabricating current zero rates', async () => {
    mocks.quotes.mockRejectedValueOnce(new FxUnavailableError('blue'));
    const html = renderToStaticMarkup(await DashboardPage());
    expect(html).toContain('&quot;totalUSD&quot;:100');
    expect(html).toContain('Cotizaciones no disponibles');
    expect(html).not.toContain('data-testid="quotes"');
  });

  it('keeps the normal login redirect for a missing session', async () => {
    mocks.user.mockResolvedValueOnce(null);
    await expect(DashboardPage()).rejects.toMatchObject({ digest: expect.stringContaining('NEXT_REDIRECT;replace;/login;') });
    expect(mocks.accounts).not.toHaveBeenCalled();
  });

  it('preserves framework redirects thrown during a financial read', async () => {
    const sentinel = Object.assign(new Error('synthetic framework control flow'), { digest: 'NEXT_REDIRECT;replace;/login;307;' });
    mocks.accounts.mockRejectedValueOnce(sentinel);
    await expect(DashboardPage()).rejects.toBe(sentinel);
    expect(mocks.snapshot).not.toHaveBeenCalled();
  });
});
