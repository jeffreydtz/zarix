import { Suspense } from 'react';
import { redirect, unstable_rethrow } from 'next/navigation';
import dynamic from 'next/dynamic';
import { getCachedUser } from '@/lib/auth/session';
import { accountsService } from '@/lib/services/accounts';
import { transactionsService } from '@/lib/services/transactions';
import { cotizacionesService } from '@/lib/services/cotizaciones';
import { investmentsService } from '@/lib/services/investments';
import {
  getNetWorthHistory,
  recordNetWorthSnapshot,
} from '@/lib/services/net-worth';
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

    const [
      accounts,
      recentTransactions,
      portfolio,
      quotes,
      netWorthHistory,
      inflacion,
      sparklines,
      monthFlow,
      upcoming,
      budgets,
    ] = await Promise.all([
      accountsService.list(user.id, { allowPartialValuation: true }),
      transactionsService.list(user.id, { limit: 5 }),
      investmentsService
        .getPortfolioSummary(user.id, { skipQuoteRefresh: true, skipDailySnapshot: true }),
      cotizacionesService.getAllQuotes().catch(error => {
        unstable_rethrow(error);
        return null;
      }),
      getNetWorthHistory(user.id),
      getInflacionSeries().catch(() => []),
      getMarketSparklines().catch(() => ({ blue: [], btc: [], eth: [] })),
      getMonthFlow(user.id),
      getUpcoming(user.id),
      getTopBudgets(user.id),
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
            totalUSD: 0,
            totalARSBlue: 0,
            totalCreditUsed: 0,
            totalCreditLimit: 0,
            creditUtilization: 0,
            blueReferences: [],
            valuation: undefined,
          };
    const netWorthNow = {
      ...(balances.valuation ? { valuation: balances.valuation } : {}),
      liquidUSD: balances.liquidUSD,
      investmentsUSD: balances.investmentsUSD + (portfolio?.totalCurrentValue ?? 0),
      totalUSD: balances.totalUSD + (portfolio?.totalCurrentValue ?? 0),
      totalARSBlue: balances.totalARSBlue + (portfolio?.totalCurrentValueArsBlue ?? 0),
      blueRate: portfolio?.blueArsPerUsd ?? quotes?.dolar?.blue?.sell ?? 0,
      blueReferences: [
        ...(balances.blueReferences ?? []).map(reference => ({ component: 'accounts' as const, reference })),
        ...(portfolio?.blueReference && portfolio.investments.length > 0
          ? [{ component: 'portfolio' as const, reference: portfolio.blueReference }] : []),
      ],
    };

    // A partial current subtotal must never overwrite a complete historical point.
    if (!balances.valuation) void recordNetWorthSnapshot(user.id);

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
        {!balances.valuation && <StickyNetWorthBar
          totalARSBlue={netWorthNow.totalARSBlue}
          totalUSD={netWorthNow.totalUSD}
          sentinelId="networth-sentinel"
        />}
        <PageScaffold
          hero={(
            <>
              <NetWorthHero now={netWorthNow} history={netWorthHistory} inflacion={inflacion} />
              <div id="networth-sentinel" aria-hidden="true" />
            </>
          )}
        >
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
              {monthFlow ? <MonthFlowCard flow={monthFlow} /> : null}
            </MotionSection>

            <MotionSection delay={0.1} intensity="normal" className="lg:col-span-4">
              <BudgetCluster budgets={budgets} />
            </MotionSection>

            <MotionSection delay={0.12} intensity="normal" className="lg:col-span-4">
              <UpcomingRail items={upcoming} />
            </MotionSection>

            {quotes ? (
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
