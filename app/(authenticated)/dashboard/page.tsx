import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import Image from 'next/image';
import dynamic from 'next/dynamic';
import { getCachedUser } from '@/lib/auth/session';
import { accountsService } from '@/lib/services/accounts';
import { transactionsService } from '@/lib/services/transactions';
import { cotizacionesService } from '@/lib/services/cotizaciones';
import BalanceHeader from '@/components/dashboard/BalanceHeader';
import FloatingAddButton from '@/components/dashboard/FloatingAddButton';
import DashboardSpendingAnalyzerSection from '@/components/dashboard/DashboardSpendingAnalyzerSection';
import { brandAsset } from '@/lib/brand';
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

    const [accounts, recentTransactions, quotes] = await Promise.all([
      accountsService.list(user.id).catch(() => []),
      transactionsService.list(user.id, { limit: 5 }).catch(() => []),
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

    return (
      <PageScaffold
        hero={(
          <PageHero
            eyebrow="Hoy"
            title="Centro de control financiero"
            subtitle="Visión en tiempo real de patrimonio, liquidez y alertas para decidir con claridad."
            rightSlot={(
              <div className="flex items-center gap-3 rounded-card border border-border bg-surface-soft/70 px-3 py-2">
                <div className="w-11 h-11 rounded-control overflow-hidden border border-border shadow-sm bg-surface flex items-center justify-center p-1">
                  <Image
                    src={brandAsset.logoSvg}
                    alt="Zarix"
                    width={40}
                    height={40}
                    className="w-10 h-10 object-contain"
                    priority
                    unoptimized
                  />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">Zarix</p>
                  <p className="text-xs text-muted-foreground">Resumen inteligente del dia</p>
                </div>
              </div>
            )}
          />
        )}
      >
        <MotionSection delay={0.02} intensity="hero">
          <BalanceHeader
            liquidUSD={balances.liquidUSD}
            liquidARSBlue={balances.liquidARSBlue}
            investmentsUSD={balances.investmentsUSD}
            investmentsARSBlue={balances.investmentsARSBlue}
            totalUSD={balances.totalUSD}
            totalARSBlue={balances.totalARSBlue}
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
