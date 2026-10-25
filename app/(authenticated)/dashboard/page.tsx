import { Suspense } from 'react';
import { redirect, unstable_rethrow } from 'next/navigation';
import dynamic from 'next/dynamic';
import { getCachedUser } from '@/lib/auth/session';
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
import { getTopBudgets } from '@/lib/services/budget-summary';
import NetWorthHero from '@/components/dashboard/NetWorthHero';
import MarketStrip from '@/components/dashboard/MarketStrip';
import MonthFlowCard from '@/components/dashboard/MonthFlowCard';
import UpcomingRail from '@/components/dashboard/UpcomingRail';
import BudgetCluster from '@/components/dashboard/BudgetCluster';
import StickyNetWorthBar from '@/components/dashboard/StickyNetWorthBar';
import DashboardSpendingAnalyzerSection from '@/components/dashboard/DashboardSpendingAnalyzerSection';
import DashboardMore from '@/components/dashboard/DashboardMore';
import { PageScaffold } from '@/components/ui/PageScaffold';
import MotionSection from '@/components/ui/MotionSection';
import FxUnavailableBanner from '@/components/ui/FxUnavailableBanner';
import { isFxUnavailableError } from '@/lib/services/cotizaciones';

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
      cotizacionesService.getDolarQuotes({ preferCache: true }),
      new Promise((resolve) => setTimeout(resolve, 1500)),
    ]).catch(() => {});

    const settled = await Promise.allSettled([
      accountsService.list(user.id, { allowPartialValuation: true }),
      transactionsService.list(user.id, { limit: 5 }),
      investmentsService
        .getPortfolioSummary(user.id, { skipQuoteRefresh: true, skipDailySnapshot: true }),
      cotizacionesService.getAllQuotes(),
      getNetWorthHistory(user.id),
      getInflacionSeries(),
      getMarketSparklines(),
      getMonthFlow(user.id),
      getUpcoming(user.id),
      getTopBudgets(user.id),
      getPresentationPreferences(user.id),
    ]);

    const unwrap = <T,>(result: PromiseSettledResult<T>, fallback: T, fatal = true): T => {
      if (result.status === 'fulfilled') return result.value;
      unstable_rethrow(result.reason);
      if (!fatal || isFxUnavailableError(result.reason)) {
        console.error('[dashboard] section unavailable', result.reason);
        return fallback;
      }
      throw result.reason;
    };

    const accounts = unwrap(settled[0], [] as Awaited<ReturnType<typeof accountsService.list>>);
    const recentTransactions = unwrap(settled[1], [] as Awaited<ReturnType<typeof transactionsService.list>>);
    const portfolio = unwrap(settled[2], null);
    const quotes = unwrap(settled[3], null, false);
    const netWorthHistory = unwrap(settled[4], [] as Awaited<ReturnType<typeof getNetWorthHistory>>);
    const inflacion = unwrap(settled[5], [], false);
    const sparklines = unwrap(settled[6], { blue: [], btc: [], eth: [] }, false);
    const monthFlow = unwrap(settled[7], null);
    const upcoming = unwrap(settled[8], [] as Awaited<ReturnType<typeof getUpcoming>>);
    const budgets = unwrap(settled[9], [] as Awaited<ReturnType<typeof getTopBudgets>>);
    const preferences = unwrap(settled[10], { default_currency: 'ARS' as const, net_worth_widget_visible: true });

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
    const blueSell = quotes?.dolar?.blue?.sell;
    const blueRate =
      (portfolio?.blueArsPerUsd && portfolio.blueArsPerUsd > 0 ? portfolio.blueArsPerUsd : null)
      ?? (typeof blueSell === 'number' && blueSell > 0 ? blueSell : null);
    const fxAsOf =
      accounts.find((account) => account.valuation?.asOf)?.valuation?.asOf
      ?? portfolio?.fxAsOf
      ?? quotes?.dolar?.blue?.asOf
      ?? (quotes?.dolar?.blue?.timestamp instanceof Date ? quotes.dolar.blue.timestamp.toISOString() : null);
    const fxUnavailable = Boolean(
      balances.valuation?.status === 'fx_unavailable'
      || portfolio?.fxUnavailable
      || !blueRate
    );
    const netWorthNow = composeLiquidNetWorth({
      balances,
      portfolio,
      blueRate: blueRate ?? 0,
    });

    // Reading or changing presentation preferences never rewrites history.
    // The existing scheduled snapshot writer owns the persisted daily series.

    // Top 2 posiciones por valor para el strip de mercado
    const topHoldings = (portfolio?.investments ?? [])
      .slice()
      .sort((a, b) => b.market_value_usd - a.market_value_usd)
      .slice(0, 2)
      .map((inv) => ({
        ticker: inv.ticker ?? inv.name,
        name: inv.name,
        valueUSD: inv.market_value_usd,
        dailyPct: inv.daily_change_pct ?? 0,
      }));

    return (
      <>
        {preferences.net_worth_widget_visible && !balances.valuation && !fxUnavailable && <StickyNetWorthBar
          key={user.id}
          totalARSBlue={netWorthNow.totalARSBlue}
          totalUSD={netWorthNow.totalUSD}
          sentinelId="networth-sentinel"
          baseCurrency={preferences.default_currency}
        />}
        <PageScaffold
          hero={(
            preferences.net_worth_widget_visible ? <>
              <NetWorthHero key={user.id} now={netWorthNow} history={netWorthHistory} inflacion={inflacion} baseCurrency={preferences.default_currency} />
              <div id="networth-sentinel" aria-hidden="true" />
            </> : null
          )}
        >
          {/* Bento desktop: 12 columnas; mobile: columna única en orden de jerarquía */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
            <MotionSection delay={0.04} intensity="normal" className="lg:col-span-12">
              {fxUnavailable || !quotes ? (
                <FxUnavailableBanner asOf={fxAsOf} />
              ) : (
                <MarketStrip quotes={{ ...quotes, timestamp: quotes.timestamp ?? undefined }} sparklines={sparklines} topHoldings={topHoldings} />
              )}
            </MotionSection>

            <MotionSection delay={0.08} intensity="normal" className="lg:col-span-4">
              {monthFlow ? <MonthFlowCard flow={monthFlow} /> : null}
            </MotionSection>

            <MotionSection delay={0.1} intensity="normal" className="lg:col-span-4">
              <BudgetCluster budgets={budgets} />
            </MotionSection>

            <MotionSection delay={0.12} intensity="normal" className="lg:col-span-4">
              <UpcomingRail items={upcoming} />
            </MotionSection>

            {quotes?.dolar?.blue && quotes.dolar.blue.sell > 0 ? (
              <MotionSection delay={0.16} intensity="subtle" className="lg:col-span-12">
                <Suspense fallback={<div className="card h-80 animate-pulse-subtle bg-surface-soft" />}>
                  <DashboardSpendingAnalyzerSection quotes={quotes} />
                </Suspense>
              </MotionSection>
            ) : null}

            <DashboardMore>
              <MotionSection delay={0.2} intensity="subtle" className="lg:col-span-6">
                <CreditCardsWidget accounts={accounts} />
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
        <section role="alert" className="card p-6 space-y-3">
          <h1 className="text-xl font-semibold">No pudimos cargar tus datos financieros</h1>
          <p>Volvé a intentar en unos minutos para consultar tu resumen completo.</p>
          <a href="/dashboard" className="btn-primary inline-flex">Reintentar</a>
        </section>
      </PageScaffold>
    );
  }
}
