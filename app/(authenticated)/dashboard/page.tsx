import FxStatusBanner, { combinedFxStatus } from '@/components/ui/FxStatusBanner';
import { Suspense } from 'react';
import { redirect, unstable_rethrow } from 'next/navigation';
import dynamic from 'next/dynamic';
import { getCachedUser } from '@/lib/auth/session';
import { FxUnavailableError } from '@/lib/executable-fx';
import FinancialDataError from '@/components/ui/FinancialDataError';
import { accountsService } from '@/lib/services/accounts';
import { transactionsService } from '@/lib/services/transactions';
import { cotizacionesService } from '@/lib/services/cotizaciones';
import { investmentsService } from '@/lib/services/investments';
import { getNetWorthHistory } from '@/lib/services/net-worth';
import { composeLiquidNetWorth } from '@/lib/services/liquid-net-worth';
import { getPresentationPreferences } from '@/lib/services/presentation-preferences';
import { getInflacionSeries } from '@/lib/services/inflacion';
import { getMarketSparklines } from '@/lib/services/market-history';
import { getMonthFlow } from '@/lib/services/month-flow';
import { getUpcoming } from '@/lib/services/upcoming';
import { getCardStatements } from '@/lib/services/card-statement';
import { getRealReturnsReport } from '@/lib/services/real-returns';
import { getTopBudgets } from '@/lib/services/budget-summary';
import NetWorthHero from '@/components/dashboard/NetWorthHero';
import MarketStrip from '@/components/dashboard/MarketStrip';
import MonthFlowCard from '@/components/dashboard/MonthFlowCard';
import UpcomingRail from '@/components/dashboard/UpcomingRail';
import BudgetCluster from '@/components/dashboard/BudgetCluster';
import StickyNetWorthBar from '@/components/dashboard/StickyNetWorthBar';
import DashboardSpendingAnalyzerSection from '@/components/dashboard/DashboardSpendingAnalyzerSection';
import DashboardMore from '@/components/dashboard/DashboardMore';
import RealReturnsPanel from '@/components/dashboard/RealReturnsPanel';
import { PageScaffold } from '@/components/ui/PageScaffold';
import MotionSection from '@/components/ui/MotionSection';

function unavailableSection<T>(fallback: T) {
  return (error: unknown): T => {
    unstable_rethrow(error);
    if (!(error instanceof FxUnavailableError)) throw error;
    return fallback;
  };
}

const CreditCardsWidget = dynamic(() => import('@/components/dashboard/CreditCardsWidget'), {
  loading: () => <div className="card h-40 animate-pulse bg-secondary" />,
});
const AccountCards = dynamic(() => import('@/components/dashboard/AccountCards'), {
  loading: () => <div className="h-32 animate-pulse bg-secondary rounded-2xl" />,
});
const RecentTransactions = dynamic(() => import('@/components/dashboard/RecentTransactions'), {
  loading: () => <div className="card h-64 animate-pulse bg-secondary" />,
});
const AnomaliesWidget = dynamic(() => import('@/components/dashboard/AnomaliesWidget'), {
  loading: () => <div className="card h-40 animate-pulse bg-secondary" />,
});

export default async function DashboardPage() {
  try {
    const user = await getCachedUser();

    if (!user) {
      redirect('/login');
    }

    // Pre-calienta la cache de cotización con la última persistida en DB (rápido)
    // para que las conversiones no esperen a las APIs externas en el render frío.
    await Promise.race([
      cotizacionesService.getDolarQuotes({ preferCache: true, require: ['blue'] }),
      new Promise((resolve) => setTimeout(resolve, 1500)),
    ]).catch(unavailableSection(undefined));

    const cardStatementsPromise = getCardStatements(user.id);
    const [
      accounts,
      recentTransactions,
      portfolio,
      quotes,
      netWorthHistory,
      inflacion,
      sparklines,
      monthFlow,
      cardStatements,
      realReturns,
      upcoming,
      budgets,
      preferences,
    ] = await Promise.all([
      accountsService.list(user.id, { allowPartialValuation: true }),
      transactionsService.list(user.id, { limit: 5 }),
      investmentsService
        .getPortfolioSummary(user.id, { skipQuoteRefresh: true, skipDailySnapshot: true }),
      cotizacionesService.getAllQuotes().catch(unavailableSection(null)),
      getNetWorthHistory(user.id).catch(unavailableSection(null)),
      getInflacionSeries(),
      getMarketSparklines(),
      getMonthFlow(user.id).catch(unavailableSection(null)),
      cardStatementsPromise,
      getRealReturnsReport(user.id).catch(unavailableSection(null)),
      cardStatementsPromise
        .then((statements) => getUpcoming(user.id, 5, { cardStatements: statements }))
        .catch(unavailableSection(null)),
      getTopBudgets(user.id).catch(unavailableSection(null)),
      getPresentationPreferences(user.id).catch(unavailableSection({ default_currency: 'ARS' as const, net_worth_widget_visible: false })),
    ]);

    // Patrimonio HOY: misma composición que computeNetWorth pero reutilizando
    // lo ya traído (evita repetir las queries de accounts/portfolio).
    const balances =
      accounts.length > 0
        ? accountsService.aggregateAccountTotals(accounts)
        : {
            liquidUSD: 0,
            liquidARSBlue: 0,
            investmentsUSD: 0,
            investmentsARSBlue: 0,
            availableUSD: 0,
            availableARSBlue: 0,
            creditCardDebtUSD: 0,
            creditCardDebtARSBlue: 0,
            creditCards: [],
            totalUSD: 0,
            totalARSBlue: 0,
            totalCreditUsed: 0,
            totalCreditLimit: 0,
            creditUtilization: 0,
            blueReferences: [],
            valuation: undefined,
          };
    const netWorthNow = composeLiquidNetWorth({
      balances,
      portfolio,
      blueRate: balances.blueReferences?.[0]?.rate ?? portfolio?.blueArsPerUsd ?? quotes?.dolar?.blue?.sell ?? null,
    });

    // Reading or changing presentation preferences never rewrites history.
    // The existing scheduled snapshot writer owns the persisted daily series.

    // Top 2 posiciones por valor para el strip de mercado
    const topHoldings = (portfolio?.investments ?? [])
      .filter(inv => inv.market_value_usd != null)
      .sort((a, b) => b.market_value_usd! - a.market_value_usd!)
      .slice(0, 2)
      .map((inv) => ({
        ticker: inv.ticker ?? inv.name,
        name: inv.name,
        valueUSD: inv.market_value_usd!,
        dailyPct: inv.daily_change_pct ?? 0,
      }));

    const fxStatus = combinedFxStatus([
      ...accounts,
      ...(portfolio ? [portfolio] : []),
      ...(['blue', 'oficial', 'mep', 'ccl'] as const).map(type => ({
        fxStale: quotes?.dolar?.[type]?.stale,
        fxAsOf: quotes?.dolar?.[type]?.asOf?.toISOString(),
      })),
      { fxUnavailable: !quotes?.dolar?.blue && accounts.length === 0 },
    ]);

    return (
      <>
        {preferences.net_worth_widget_visible && !balances.valuation && !netWorthNow.fxUnavailable && <StickyNetWorthBar
          key={user.id}
          totalARSBlue={netWorthNow.totalARSBlue}
          totalUSD={netWorthNow.totalUSD}
          sentinelId="networth-sentinel"
          baseCurrency={preferences.default_currency}
          fxStale={netWorthNow.fxStale}
          fxAsOf={netWorthNow.fxAsOf}
        />}
        <PageScaffold
          hero={(
            preferences.net_worth_widget_visible ? <>
              <NetWorthHero key={user.id} now={netWorthNow} history={netWorthHistory ?? []} inflacion={inflacion} baseCurrency={preferences.default_currency} />
              {netWorthHistory == null && <p role="status" className="text-sm text-muted-foreground">Historial de patrimonio no disponible.</p>}
              <div id="networth-sentinel" aria-hidden="true" />
            </> : null
          )}
        >
          <FxStatusBanner {...fxStatus} />
          {portfolio == null && <p role="status" className="text-sm text-muted-foreground">Resumen de inversiones no disponible.</p>}
          {/* Bento desktop: 12 columnas; mobile: columna única en orden de jerarquía */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
            <MotionSection delay={0.04} intensity="normal" className="lg:col-span-12">
              {quotes ? (
                <MarketStrip quotes={quotes} sparklines={sparklines} topHoldings={topHoldings} />
              ) : (
                <p role="status" className="card p-4 text-muted-foreground">Cotizaciones no disponibles. Volvé a intentar en unos minutos.</p>
              )}
            </MotionSection>

            <MotionSection delay={0.08} intensity="normal" className="lg:col-span-4">
              {monthFlow ? <MonthFlowCard flow={monthFlow} /> : <p role="status" className="card p-4">Resumen mensual no disponible.</p>}
            </MotionSection>

            <MotionSection delay={0.1} intensity="normal" className="lg:col-span-4">
              {budgets ? <BudgetCluster budgets={budgets} /> : <p role="status" className="card p-4">Presupuestos no disponibles.</p>}
            </MotionSection>

            <MotionSection delay={0.12} intensity="normal" className="lg:col-span-4">
              {upcoming ? <UpcomingRail items={upcoming} /> : <p role="status" className="card p-4">Próximos movimientos no disponibles.</p>}
            </MotionSection>

            <MotionSection delay={0.14} intensity="normal" className="lg:col-span-12">
              {realReturns ? (
                <RealReturnsPanel report={realReturns} />
              ) : (
                <p role="status" className="card p-4 text-muted-foreground">
                  Rendimiento real no disponible.
                </p>
              )}
            </MotionSection>

            {quotes?.dolar.blue ? (
              <MotionSection delay={0.16} intensity="subtle" className="lg:col-span-12">
                <Suspense fallback={<div className="card h-80 animate-pulse-subtle bg-surface-soft" />}>
                  <DashboardSpendingAnalyzerSection quotes={quotes} />
                </Suspense>
              </MotionSection>
            ) : null}

            <DashboardMore>
              <MotionSection delay={0.2} intensity="subtle" className="lg:col-span-6">
                <CreditCardsWidget accounts={accounts} statements={cardStatements} />
              </MotionSection>

              <MotionSection delay={0.22} intensity="subtle" className="lg:col-span-6">
                <AccountCards accounts={accounts} />
              </MotionSection>

              <MotionSection delay={0.26} intensity="subtle" className="lg:col-span-7">
                <RecentTransactions transactions={recentTransactions} />
              </MotionSection>

              <MotionSection delay={0.28} intensity="subtle" className="lg:col-span-5">
                <AnomaliesWidget />
              </MotionSection>
            </DashboardMore>
          </div>
        </PageScaffold>
      </>
    );
  } catch (error) {
    unstable_rethrow(error);
    console.error('[dashboard] Financial data unavailable');
    return (
      <PageScaffold>
        <FinancialDataError retryHref="/dashboard" />
      </PageScaffold>
    );
  }
}
