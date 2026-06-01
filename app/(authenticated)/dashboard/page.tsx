import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import dynamic from 'next/dynamic';
import { getCachedUser } from '@/lib/auth/session';
import { accountsService } from '@/lib/services/accounts';
import { transactionsService } from '@/lib/services/transactions';
import { cotizacionesService } from '@/lib/services/cotizaciones';
import { investmentsService } from '@/lib/services/investments';
import BalanceHeader from '@/components/dashboard/BalanceHeader';
import DashboardHeroStats from '@/components/dashboard/DashboardHeroStats';
import FloatingAddButton from '@/components/dashboard/FloatingAddButton';
import DashboardSpendingAnalyzerSection from '@/components/dashboard/DashboardSpendingAnalyzerSection';
import { PageHero, PageScaffold } from '@/components/ui/PageScaffold';
import MotionSection from '@/components/ui/MotionSection';

const QuotesWidget = dynamic(() => import('@/components/dashboard/QuotesWidget'), {
  loading: () => <div className="card h-40 animate-pulse bg-slate-100 dark:bg-slate-800" />,
});
const CreditCardsWidget = dynamic(() => import('@/components/dashboard/CreditCardsWidget'), {
  loading: () => <div className="card h-40 animate-pulse bg-slate-100 dark:bg-slate-800" />,
});
const AccountCards = dynamic(() => import('@/components/dashboard/AccountCards'), {
  loading: () => <div className="h-32 animate-pulse bg-slate-100 dark:bg-slate-800 rounded-2xl" />,
});
const RecentTransactions = dynamic(() => import('@/components/dashboard/RecentTransactions'), {
  loading: () => <div className="card h-64 animate-pulse bg-slate-100 dark:bg-slate-800" />,
});
const AnomaliesWidget = dynamic(() => import('@/components/dashboard/AnomaliesWidget'), {
  loading: () => <div className="card h-40 animate-pulse bg-slate-100 dark:bg-slate-800" />,
});
export default async function DashboardPage() {
  try {
    const user = await getCachedUser();

    if (!user) {
      redirect('/login');
    }

    const [accounts, recentTransactions, portfolio, quotes] = await Promise.all([
      accountsService.list(user.id).catch(() => []),
      transactionsService.list(user.id, { limit: 5 }).catch(() => []),
      // Inversiones del dashboard = valor del portafolio (posiciones), no el saldo
      // de la cuenta. Precios guardados (sin refresh) para no demorar el dashboard.
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
    ]);

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

    // Inversiones = posiciones del portafolio + efectivo de las cuentas de inversión.
    // No se descarta el cash del broker; las posiciones son filas aparte (sin doble conteo).
    const portfolioUSD = portfolio?.totalCurrentValue ?? 0;
    const portfolioARSBlue = portfolio?.totalCurrentValueArsBlue ?? 0;
    const investmentsUSD = balances.investmentsUSD + portfolioUSD;
    const investmentsARSBlue = balances.investmentsARSBlue + portfolioARSBlue;
    const totalUSD = balances.totalUSD + portfolioUSD;
    const totalARSBlue = balances.totalARSBlue + portfolioARSBlue;
    const investmentsDailyPct = portfolio?.totalDailyPnLPercent ?? null;

    return (
      <PageScaffold
        hero={(
          <PageHero
            eyebrow="Hoy"
            title="Centro de control financiero"
            subtitle="Visión en tiempo real de patrimonio, liquidez y alertas para decidir con claridad."
            rightSlot={(
              <DashboardHeroStats
                liquidARSBlue={balances.liquidARSBlue}
                investmentsARSBlue={investmentsARSBlue}
                dailyPct={investmentsDailyPct}
              />
            )}
          />
        )}
      >
        <MotionSection delay={0.02} intensity="hero">
          <BalanceHeader
            liquidUSD={balances.liquidUSD}
            liquidARSBlue={balances.liquidARSBlue}
            investmentsUSD={investmentsUSD}
            investmentsARSBlue={investmentsARSBlue}
            totalUSD={totalUSD}
            totalARSBlue={totalARSBlue}
            totalCreditUsed={balances.totalCreditUsed}
            totalCreditLimit={balances.totalCreditLimit}
            creditUtilization={balances.creditUtilization}
          />
        </MotionSection>

        <MotionSection delay={0.08} intensity="normal">
          <QuotesWidget quotes={quotes} />
        </MotionSection>

        <MotionSection delay={0.14} intensity="normal">
          <Suspense fallback={<div className="card h-80 animate-pulse-subtle bg-surface-soft" />}>
            <DashboardSpendingAnalyzerSection quotes={quotes} />
          </Suspense>
        </MotionSection>

        <MotionSection delay={0.2} intensity="subtle">
          <CreditCardsWidget accounts={accounts} />
        </MotionSection>

        <MotionSection delay={0.24} intensity="subtle">
          <AccountCards accounts={accounts} />
        </MotionSection>

        <MotionSection delay={0.28} intensity="subtle">
          <RecentTransactions transactions={recentTransactions} />
        </MotionSection>

        <MotionSection delay={0.32} intensity="subtle">
          <AnomaliesWidget />
        </MotionSection>

        <FloatingAddButton />
      </PageScaffold>
    );
  } catch (error) {
    console.error('Dashboard error:', error);
    redirect('/login');
  }
}
