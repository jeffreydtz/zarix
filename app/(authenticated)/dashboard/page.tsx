import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import Image from 'next/image';
import dynamic from 'next/dynamic';
import { createClient } from '@/lib/supabase/server';
import { accountsService } from '@/lib/services/accounts';
import { transactionsService } from '@/lib/services/transactions';
import { cotizacionesService } from '@/lib/services/cotizaciones';
import BalanceHeader from '@/components/dashboard/BalanceHeader';
import FloatingAddButton from '@/components/dashboard/FloatingAddButton';
import DashboardSpendingAnalyzerSection from '@/components/dashboard/DashboardSpendingAnalyzerSection';
import { brandAsset } from '@/lib/brand';

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
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

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
      <div className="min-h-screen bg-slate-50 dark:bg-[#06070A] transition-colors duration-300">
        <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-700 shadow-sm bg-white dark:bg-slate-800 flex items-center justify-center p-1">
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
              <h1 className="text-xl font-bold text-emerald-700 dark:text-emerald-400">Zarix</h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">Tu resumen financiero de hoy</p>
            </div>
          </div>

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

          <QuotesWidget quotes={quotes} />

          <Suspense
            fallback={<div className="card h-80 animate-pulse bg-slate-100 dark:bg-slate-800" />}
          >
            <DashboardSpendingAnalyzerSection userId={user.id} quotes={quotes} />
          </Suspense>

          <CreditCardsWidget accounts={accounts} />

          <AccountCards accounts={accounts} />

          <RecentTransactions transactions={recentTransactions} />

          <AnomaliesWidget />

          <FloatingAddButton />
        </div>
      </div>
    );
  } catch (error) {
    console.error('Dashboard error:', error);
    redirect('/login');
  }
}
