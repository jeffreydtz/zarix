import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import dynamic from 'next/dynamic';
import { getCachedUser } from '@/lib/auth/session';
import { accountsService } from '@/lib/services/accounts';
import { transactionsService } from '@/lib/services/transactions';
import { cotizacionesService } from '@/lib/services/cotizaciones';
import { investmentsService } from '@/lib/services/investments';
import {
  computeNetWorth,
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
      accountsService.list(user.id).catch(() => []),
      transactionsService.list(user.id, { limit: 5 }).catch(() => []),
      investmentsService
        .getPortfolioSummary(user.id, { skipQuoteRefresh: true, skipDailySnapshot: true })
        .catch(() => null),
      cotizacionesService.getAllQuotes().catch(() => ({
        dolar: {
          blue: { type: 'blue' as const, buy: 0, sell: 0, timestamp: new Date() },
          oficial: { type: 'oficial' as const, buy: 0, sell: 0, timestamp: new Date() },
          mep: { type: 'mep' as const, buy: 0, sell: 0, timestamp: new Date() },
          ccl: { type: 'ccl' as const, buy: 0, sell: 0, timestamp: new Date() },
        },
        crypto: {
          btc: { symbol: 'BTC', priceUSD: 0, priceARS: 0, change24h: 0, timestamp: new Date() },
          eth: { symbol: 'ETH', priceUSD: 0, priceARS: 0, change24h: 0, timestamp: new Date() },
          usdt: { symbol: 'USDT', priceUSD: 1, priceARS: 0, change24h: 0, timestamp: new Date() },
        },
        timestamp: new Date().toISOString(),
      })),
      getNetWorthHistory(user.id).catch(() => []),
      getInflacionSeries().catch(() => []),
      getMarketSparklines().catch(() => ({ blue: [], btc: [], eth: [] })),
      getMonthFlow(user.id).catch(() => null),
      getUpcoming(user.id).catch(() => []),
      getTopBudgets(user.id).catch(() => []),
    ]);

    // Snapshot del día best-effort (idempotente con el cron por unique user+día):
    // así el gráfico ancla acumula historia aunque el cron no haya corrido.
    void recordNetWorthSnapshot(user.id);

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
          };
    const netWorthNow = {
      liquidUSD: balances.liquidUSD,
      investmentsUSD: balances.investmentsUSD + (portfolio?.totalCurrentValue ?? 0),
      totalUSD: balances.totalUSD + (portfolio?.totalCurrentValue ?? 0),
      totalARSBlue: balances.totalARSBlue + (portfolio?.totalCurrentValueArsBlue ?? 0),
      blueRate: portfolio?.blueArsPerUsd ?? quotes?.dolar?.blue?.sell ?? 0,
    };

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
        <StickyNetWorthBar
          totalARSBlue={netWorthNow.totalARSBlue}
          totalUSD={netWorthNow.totalUSD}
          sentinelId="networth-sentinel"
        />
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
              <MarketStrip quotes={quotes} sparklines={sparklines} topHoldings={topHoldings} />
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

            <MotionSection delay={0.16} intensity="subtle" className="lg:col-span-12">
              <Suspense fallback={<div className="card h-80 animate-pulse-subtle bg-surface-soft" />}>
                <DashboardSpendingAnalyzerSection quotes={quotes} />
              </Suspense>
            </MotionSection>

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
    console.error('Dashboard error:', error);
    redirect('/login');
  }
}
