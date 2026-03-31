import { redirect } from 'next/navigation';
import Image from 'next/image';
import dynamic from 'next/dynamic';
import { createClient } from '@/lib/supabase/server';
import { accountsService } from '@/lib/services/accounts';
import { transactionsService } from '@/lib/services/transactions';
import { cotizacionesService } from '@/lib/services/cotizaciones';
import BalanceHeader from '@/components/dashboard/BalanceHeader';

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

    const [accounts, balances, recentTransactions, quotes] = await Promise.all([
      accountsService.list(user.id).catch(() => []),
      accountsService.getTotalBalanceWithInvestments(user.id).catch(() => ({ 
        liquidUSD: 0,
        liquidARSBlue: 0,
        investmentsUSD: 0,
        investmentsARSBlue: 0,
        totalUSD: 0,
        totalARSBlue: 0,
      })),
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

    const creditCards = accounts.filter((a) => a.type === 'credit_card');
    const totalCreditUsed = creditCards.reduce((sum, a) => sum + Math.abs(Number(a.balance || 0)), 0);
    const totalCreditLimit = creditCards.reduce((sum, a) => sum + Number(a.credit_limit || 0), 0);
    const creditUtilization = totalCreditLimit > 0 ? (totalCreditUsed / totalCreditLimit) * 100 : 0;

    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900 transition-colors duration-300">
        <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-700 shadow-sm bg-white dark:bg-slate-800 flex items-center justify-center">
              <Image
                src="/icons/icon-192.png"
                alt="Zarix Logo"
                width={36}
                height={36}
                className="w-9 h-9 object-contain"
                priority
              />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">Zarix</h1>
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
            totalCreditUsed={totalCreditUsed}
            totalCreditLimit={totalCreditLimit}
            creditUtilization={creditUtilization}
          />

          <QuotesWidget quotes={quotes} />

          <CreditCardsWidget accounts={accounts} />

          <AccountCards accounts={accounts} />

          <RecentTransactions transactions={recentTransactions} />

          <AnomaliesWidget />

          {process.env.TELEGRAM_BOT_USERNAME && (
            <a
              href={`https://t.me/${process.env.TELEGRAM_BOT_USERNAME}`}
              target="_blank"
              rel="noopener noreferrer"
              className="fixed bottom-6 right-6 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white rounded-2xl p-4 shadow-lg shadow-blue-500/30 flex items-center gap-3 transition-all hover:scale-105 active:scale-95 z-50"
            >
              <svg
                className="w-6 h-6"
                fill="currentColor"
                viewBox="0 0 24 24"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221l-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.446 1.394c-.14.18-.357.295-.6.295-.002 0-.003 0-.005 0l.213-3.054 5.56-5.022c.24-.213-.054-.334-.373-.121l-6.869 4.326-2.96-.924c-.64-.203-.658-.64.135-.954l11.566-4.458c.538-.196 1.006.128.832.941z" />
              </svg>
              <span className="font-semibold hidden sm:block">Telegram Bot</span>
            </a>
          )}
        </div>
      </div>
    );
  } catch (error) {
    console.error('Dashboard error:', error);
    redirect('/login');
  }
}
