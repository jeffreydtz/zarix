import dynamic from 'next/dynamic';
import { transactionsService } from '@/lib/services/transactions';
import type { TransactionWithCategory } from '@/lib/services/transactions';
import type { SpendingAnalyzerTxItem } from '@/components/dashboard/SpendingAnalyzer';
import { cotizacionesService } from '@/lib/services/cotizaciones';

const SpendingAnalyzer = dynamic(() => import('@/components/dashboard/SpendingAnalyzer'), {
  ssr: false,
  loading: () => <div className="card h-80 animate-pulse bg-slate-100 dark:bg-slate-800" />,
});

type QuotesPayload = Awaited<ReturnType<typeof cotizacionesService.getAllQuotes>>;

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

/**
 * Carga el pool grande del analizador fuera del camino crítico del dashboard
 * (Suspense en la página) para que la navegación muestre el resto del resumen antes.
 */
export default async function DashboardSpendingAnalyzerSection({
  userId,
  quotes,
}: {
  userId: string;
  quotes: QuotesPayload;
}) {
  const analyzerPoolRaw = await transactionsService.list(userId, { limit: 10000 }).catch(() => null);

  const analyzerInitialTxs: SpendingAnalyzerTxItem[] | undefined =
    analyzerPoolRaw === null ? undefined : analyzerPoolRaw.map(mapToAnalyzerTx);
  const analyzerTruncated = analyzerPoolRaw !== null && analyzerPoolRaw.length >= 10000;

  return (
    <SpendingAnalyzer
      initialTransactions={analyzerInitialTxs}
      initialTransactionsTruncated={analyzerTruncated}
      usdToArsBlue={quotes.dolar.blue.sell || 0}
      cryptoPriceArs={{
        btc: quotes.crypto.btc.priceARS,
        eth: quotes.crypto.eth.priceARS,
      }}
    />
  );
}
