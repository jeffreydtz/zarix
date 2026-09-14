import { Suspense, type ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { getCachedUser } from '@/lib/auth/session';
import { accountsService } from '@/lib/services/accounts';
import { transactionsService } from '@/lib/services/transactions';
import { cotizacionesService } from '@/lib/services/cotizaciones';
import { investmentsService } from '@/lib/services/investments';
import { getNetWorthHistory, type NetWorthNow } from '@/lib/services/net-worth';
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
import AccountCards from '@/components/dashboard/AccountCards';
import CreditCardsWidget from '@/components/dashboard/CreditCardsWidget';
import RecentTransactions from '@/components/dashboard/RecentTransactions';
import AnomaliesWidget from '@/components/dashboard/AnomaliesWidget';
import UnavailableCard from '@/components/dashboard/UnavailableCard';
import PrivateDetails from '@/components/dashboard/PrivateDetails';
import { PageScaffold } from '@/components/ui/PageScaffold';

// Attach error handling immediately: independent requests may reject before
// their streamed section is rendered. null means unavailable, never empty data.
async function available<T>(promise: Promise<T>): Promise<T | null> {
  try { return await promise; } catch (error) {
    console.error('[dashboard] No se pudo cargar una sección:', error);
    return null;
  }
}

function Skeleton() {
  return <div className="card min-h-40 animate-pulse bg-surface-soft" role="status" aria-label="Cargando resumen" />;
}

async function Section<T>({ data, title, children }: {
  data: Promise<T | null>; title: string; children: (value: T) => ReactNode;
}) {
  const value = await data;
  return value === null ? <UnavailableCard title={title} /> : <>{children(value)}</>;
}

type Accounts = Awaited<ReturnType<typeof accountsService.list>>;
type Portfolio = Awaited<ReturnType<typeof investmentsService.getPortfolioSummary>>;
type History = Awaited<ReturnType<typeof getNetWorthHistory>>;
type Inflation = Awaited<ReturnType<typeof getInflacionSeries>>;

async function HistoryHero({ now, history, inflation }: {
  now: NetWorthNow; history: Promise<History | null>; inflation: Promise<Inflation | null>;
}) {
  const [points, ipc] = await Promise.all([history, inflation]);
  return <NetWorthHero now={now} history={points ?? []} inflacion={ipc ?? []} historyUnavailable={points === null} />;
}

async function FinancialHero({ accounts, portfolio, history, inflation }: {
  accounts: Promise<Accounts | null>; portfolio: Promise<Portfolio | null>;
  history: Promise<History | null>; inflation: Promise<Inflation | null>;
}) {
  const [rows, positions] = await Promise.all([accounts, portfolio]);
  if (rows === null || positions === null) return <UnavailableCard title="Patrimonio total" />;
  const balances = accountsService.aggregateAccountTotals(rows);
  const now: NetWorthNow = {
    liquidUSD: balances.liquidUSD,
    investmentsUSD: balances.investmentsUSD + positions.totalCurrentValue,
    totalUSD: balances.totalUSD + positions.totalCurrentValue,
    totalARSBlue: balances.totalARSBlue + positions.totalCurrentValueArsBlue,
    blueRate: positions.blueArsPerUsd,
  };
  if (!(now.blueRate > 0) || !Object.values(now).every(Number.isFinite)) {
    return <UnavailableCard title="Patrimonio total" />;
  }
  return <>
    <Suspense fallback={<NetWorthHero now={now} history={[]} inflacion={[]} historyLoading />}>
      <HistoryHero now={now} history={history} inflation={inflation} />
    </Suspense>
    <div id="networth-sentinel" aria-hidden="true" />
    <StickyNetWorthBar totalARSBlue={now.totalARSBlue} totalUSD={now.totalUSD} sentinelId="networth-sentinel" />
  </>;
}

export default async function DashboardPage() {
  const user = await getCachedUser();
  if (!user) redirect('/login');

  const accounts = available(accountsService.list(user.id));
  const portfolio = available(investmentsService.getPortfolioSummary(user.id, {
    skipQuoteRefresh: true, skipDailySnapshot: true,
  }));
  const history = available(getNetWorthHistory(user.id));
  const inflation = available(getInflacionSeries());
  const quotes = available(cotizacionesService.getAllQuotes());
  const sparklines = available(getMarketSparklines());
  const flow = available(getMonthFlow(user.id));
  const upcoming = available(getUpcoming(user.id));
  const budgets = available(getTopBudgets(user.id));
  const recent = available(transactionsService.list(user.id, { limit: 5 }));
  const market = Promise.all([quotes, sparklines, portfolio]).then(([q, s, p]) => {
    if (!q) return null;
    return { q, s: s ?? { blue: [], btc: [], eth: [] }, holdings: (p?.investments ?? [])
      .slice().sort((a, b) => b.market_value_usd - a.market_value_usd).slice(0, 2)
      .map((inv) => ({ ticker: inv.ticker ?? inv.name, name: inv.name,
        valueUSD: inv.market_value_usd, dailyPct: inv.daily_change_pct ?? 0 })) };
  });

  return <PageScaffold hero={
    <Suspense fallback={<Skeleton />}>
      <FinancialHero accounts={accounts} portfolio={portfolio} history={history} inflation={inflation} />
    </Suspense>
  }>
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
      <div className="lg:col-span-12"><Suspense fallback={<Skeleton />}>
        <Section data={market} title="Mercado">
          {({ q, s, holdings }) => <MarketStrip quotes={q} sparklines={s} topHoldings={holdings} />}
        </Section>
      </Suspense></div>
      <div className="lg:col-span-4"><Suspense fallback={<Skeleton />}>
        <Section data={flow} title="Este mes">{(value) => <MonthFlowCard flow={value} />}</Section>
      </Suspense></div>
      <div className="lg:col-span-4"><Suspense fallback={<Skeleton />}>
        <Section data={budgets} title="Presupuestos">{(value) => <BudgetCluster budgets={value} />}</Section>
      </Suspense></div>
      <div className="lg:col-span-4"><Suspense fallback={<Skeleton />}>
        <Section data={upcoming} title="Próximos vencimientos">{(value) => <UpcomingRail items={value} />}</Section>
      </Suspense></div>
      <div className="lg:col-span-12"><PrivateDetails label="Análisis de gastos"><Suspense fallback={<Skeleton />}>
        <Section data={quotes} title="Análisis de gastos">
          {(value) => <DashboardSpendingAnalyzerSection quotes={value} />}
        </Section>
      </Suspense></PrivateDetails></div>
      <DashboardMore>
        <div className="lg:col-span-6"><PrivateDetails label="Tarjetas"><Suspense fallback={<Skeleton />}>
          <Section data={accounts} title="Tarjetas">{(value) => <CreditCardsWidget accounts={value} />}</Section>
        </Suspense></PrivateDetails></div>
        <div className="lg:col-span-6"><PrivateDetails label="Cuentas"><Suspense fallback={<Skeleton />}>
          <Section data={accounts} title="Cuentas">{(value) => <AccountCards accounts={value} />}</Section>
        </Suspense></PrivateDetails></div>
        <div className="lg:col-span-7"><Suspense fallback={<Skeleton />}>
          <Section data={recent} title="Últimos movimientos">{(value) => <RecentTransactions transactions={value} />}</Section>
        </Suspense></div>
        <div className="lg:col-span-5"><PrivateDetails label="Anomalías"><AnomaliesWidget /></PrivateDetails></div>
      </DashboardMore>
    </div>
  </PageScaffold>;
}
