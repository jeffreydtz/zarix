import { redirect } from 'next/navigation';
import Image from 'next/image';
import dynamic from 'next/dynamic';
import { createClient } from '@/lib/supabase/server';
import { accountsService } from '@/lib/services/accounts';
import { transactionsService } from '@/lib/services/transactions';
import type { TransactionWithCategory } from '@/lib/services/transactions';
import type { SpendingAnalyzerTxItem } from '@/components/dashboard/SpendingAnalyzer';
import { cotizacionesService } from '@/lib/services/cotizaciones';
import BalanceHeader from '@/components/dashboard/BalanceHeader';
import FloatingAddButton from '@/components/dashboard/FloatingAddButton';

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
const SpendingAnalyzer = dynamic(() => import('@/components/dashboard/SpendingAnalyzer'), {
  ssr: false,
  loading: () => <div className="card h-80 animate-pulse bg-slate-100 dark:bg-slate-800" />,
});

function mapToAnalyzerTx(tx: TransactionWithCategory): SpendingAnalyzerTxItem {
  return {
    id: tx.id,
    type: tx.type,
    amount: Number(tx.amount),
    currency: tx.currency,
    amount_in_account_currency: Number(tx.amount_in_account_currency ?? 0),
    category: tx.category ?? null,
    account: tx.account ?? null,
    transaction_date: tx.transaction_date,
    description: tx.description ?? null,
  };
}

export default async function DashboardPage() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      redirect('/login');
    }

    const [accounts, balances, recentTransactions, quotes, analyzerPoolRaw] = await Promise.all([
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
      transactionsService.list(user.id, { limit: 10000 }).catch(() => null as TransactionWithCategory[] | null),
    ]);

    const analyzerInitialTxs: SpendingAnalyzerTxItem[] | undefined =
      analyzerPoolRaw === null ? undefined : analyzerPoolRaw.map(mapToAnalyzerTx);
    const analyzerTruncated = analyzerPoolRaw !== null && analyzerPoolRaw.length >= 10000;

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

          <SpendingAnalyzer
            initialTransactions={analyzerInitialTxs}
            initialTransactionsTruncated={analyzerTruncated}
            usdToArsBlue={quotes.dolar.blue.sell || 0}
            cryptoPriceArs={{
              btc: quotes.crypto.btc.priceARS,
              eth: quotes.crypto.eth.priceARS,
            }}
          />

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
