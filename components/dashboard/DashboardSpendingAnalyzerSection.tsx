'use client';

import dynamic from 'next/dynamic';
import type { cotizacionesService } from '@/lib/services/cotizaciones';

const SpendingAnalyzer = dynamic(() => import('@/components/dashboard/SpendingAnalyzer'), {
  ssr: false,
  loading: () => <div className="card h-80 animate-pulse bg-secondary" />,
});

type QuotesPayload = Awaited<ReturnType<typeof cotizacionesService.getAllQuotes>>;

/**
 * Carga el pool grande del analizador fuera del camino crítico del dashboard
 * (Suspense en la página) para que la navegación muestre el resto del resumen antes.
 */
export default function DashboardSpendingAnalyzerSection({
  quotes,
}: {
  quotes: QuotesPayload;
}) {
  return (
    <SpendingAnalyzer
      usdToArsBlue={quotes.dolar.blue.sell || 0}
      cryptoPriceArs={{
        btc: quotes.crypto.btc.priceARS,
        eth: quotes.crypto.eth.priceARS,
      }}
    />
  );
}
