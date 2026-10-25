import SpendingAnalyzer from '@/components/dashboard/DeferredSpendingAnalyzer';
import { cotizacionesService } from '@/lib/services/cotizaciones';


type QuotesPayload = Awaited<ReturnType<typeof cotizacionesService.getAllQuotes>>;

/**
 * Carga el pool grande del analizador fuera del camino crítico del dashboard
 * (Suspense en la página) para que la navegación muestre el resto del resumen antes.
 */
export default async function DashboardSpendingAnalyzerSection({
  quotes,
}: {
  quotes: QuotesPayload;
}) {
  if (!quotes.dolar.blue) return null;
  return (
    <SpendingAnalyzer
      usdToArsBlue={quotes.dolar.blue.sell}
      cryptoPriceArs={{
        btc: quotes.crypto.btc?.priceARS,
        eth: quotes.crypto.eth?.priceARS,
      }}
    />
  );
}
