import { NextRequest } from 'next/server';
import { IterativeCronJob, ServiceClient } from '@/lib/cron/cron-job';
import { cotizacionesService } from '@/lib/services/cotizaciones';
import { mapConcurrent } from '@/lib/market-data/requests';

export const dynamic = 'force-dynamic';
// Precarga acotada y escrituras con deadline para terminar dentro del presupuesto de Vercel.
export const maxDuration = 60;

class UpdatePricesJob extends IterativeCronJob<any> {
  readonly name = 'update-prices';

  private priceCache: Record<string, number> = {};
  private priceTimes: Record<string, string> = {};
  private deadline = Date.now() + 50_000;

  protected async fetchItems(supabase: ServiceClient): Promise<any[]> {
    // Get all active investments with crypto or USD-priced assets
    const { data: investments, error } = await supabase
      .from('investments')
      .select('id, type, ticker, purchase_currency')
      .eq('is_active', true)
      .eq('is_manual_price', false)
      .in('type', ['crypto', 'stock_us', 'etf', 'cedear', 'stock_arg'])
      .abortSignal(AbortSignal.timeout(3000));

    if (error) throw error;
    return investments || [];
  }

  /** Precarga precios agrupando tickers para no repetir llamadas a las APIs. */
  protected async beforeAll(_supabase: ServiceClient, investments: any[]): Promise<void> {
    const cryptoTickers = new Set<string>();
    const usTickers = new Set<string>();
    const argTickers = new Set<string>();
    const cedearTickers = new Set<string>();

    for (const inv of investments) {
      if (inv.type === 'crypto' && inv.ticker) {
        cryptoTickers.add(inv.ticker.toUpperCase());
      } else if ((inv.type === 'stock_us' || inv.type === 'etf') && inv.ticker) {
        usTickers.add(inv.ticker.toUpperCase());
      } else if (inv.type === 'stock_arg' && inv.ticker) {
        argTickers.add(inv.ticker.toUpperCase());
      } else if (inv.type === 'cedear' && inv.ticker) {
        cedearTickers.add(inv.ticker.toUpperCase());
      }
    }

    const preloadDeadline = Date.now() + 20_000;
    const cryptoBatches: string[][] = [];
    const symbols = [...cryptoTickers];
    for (let i = 0; i < symbols.length; i += 100) cryptoBatches.push(symbols.slice(i, i + 100));
    const stocks = [
      ...[...usTickers].map((ticker) => ({ ticker, market: 'us' as const, prefix: 'US' })),
      ...[...argTickers].map((ticker) => ({ ticker, market: 'arg' as const, prefix: 'ARG' })),
      ...[...cedearTickers].map((ticker) => ({ ticker, market: 'cedear' as const, prefix: 'CEDEAR' })),
    ];
    await Promise.all([
      mapConcurrent(cryptoBatches, 2, async (batch) => {
        if (Date.now() >= preloadDeadline) return;
        try {
          const quotes = await cotizacionesService.getCryptoQuotes(batch);
          for (const [ticker, quote] of Object.entries(quotes)) {
            this.priceCache[ticker] = quote.priceUSD;
            this.priceTimes[ticker] = quote.timestamp.toISOString();
          }
        } catch (error) { console.error('Crypto batch failed:', error); }
      }),
      mapConcurrent(stocks, 4, async ({ ticker, market, prefix }) => {
        if (Date.now() >= preloadDeadline) return;
        try {
          const quote = await cotizacionesService.getStockQuote(ticker, market);
          this.priceCache[`${prefix}:${ticker}`] = quote.price;
          this.priceTimes[`${prefix}:${ticker}`] = quote.timestamp.toISOString();
        } catch (error) { console.error(`Quote ${ticker} failed:`, error); }
      }),
      cotizacionesService.getDolarQuotes().then((quotes) => {
        this.priceCache.USD_ARS = quotes.blue.sell;
        this.priceTimes.USD_ARS = quotes.blue.timestamp.toISOString();
      }).catch((error) => console.error('USD quote failed:', error)),
    ]);
  }

  private resolvePrice(inv: any): number | null {
    if (inv.type === 'crypto' && inv.ticker) {
      return this.priceCache[inv.ticker.toUpperCase()] || null;
    }
    if ((inv.type === 'stock_us' || inv.type === 'etf') && inv.ticker) {
      return this.priceCache[`US:${inv.ticker.toUpperCase()}`] || null;
    }
    if (inv.type === 'stock_arg' && inv.ticker) {
      return this.priceCache[`ARG:${inv.ticker.toUpperCase()}`] || null;
    }
    if (inv.type === 'cedear' && inv.ticker) {
      return this.priceCache[`CEDEAR:${inv.ticker.toUpperCase()}`] || null;
    }
    return null;
  }

  protected async processItem(supabase: ServiceClient, inv: any): Promise<void> {
    const price = this.resolvePrice(inv);
    // El template cuenta errores y alerta: jamás omitir silenciosamente una cotización caída.
    if (!price || !Number.isFinite(price)) throw new Error(`Sin cotización válida para ${inv.ticker}`);
    if (Date.now() >= this.deadline) throw new Error('Tiempo máximo de actualización alcanzado');
    const prefix = inv.type === 'stock_us' || inv.type === 'etf' ? 'US:' : inv.type === 'stock_arg' ? 'ARG:' : inv.type === 'cedear' ? 'CEDEAR:' : '';
    const timestamp = this.priceTimes[`${prefix}${inv.ticker.toUpperCase()}`];
    const { error } = await supabase
      .from('investments')
      .update({
        current_price: price,
        current_price_updated_at: timestamp,
      })
      .eq('id', inv.id)
      .eq('is_active', true)
      .eq('is_manual_price', false)
      .abortSignal(AbortSignal.timeout(Math.max(1, Math.min(2000, this.deadline - Date.now()))));

    if (error) throw error;
  }

  /** Persiste el histórico de cotizaciones obtenidas en esta corrida. */
  protected async afterAll(supabase: ServiceClient, _items: any[]): Promise<void> {
    const rows = Object.entries(this.priceCache)
      .filter(([ticker, price]) => !ticker.includes(':') && Number.isFinite(price) && price > 0)
      .map(([ticker, price]) => ({
        source: ticker === 'USD_ARS' ? 'blue' : 'coingecko',
        from_currency: ticker === 'USD_ARS' ? 'USD' : ticker,
        to_currency: ticker === 'USD_ARS' ? 'ARS' : 'USD',
        rate: price,
        timestamp: this.priceTimes[ticker],
      }));
    if (!rows.length) return;
    const { error } = await supabase.from('exchange_rates').upsert(rows, {
      onConflict: 'source,from_currency,to_currency,timestamp',
    }).abortSignal(AbortSignal.timeout(2000));
    if (error) throw error;
  }

  protected emptyMessage(): string {
    return 'No investments to update';
  }
}

export async function GET(request: NextRequest) {
  return new UpdatePricesJob().run(request);
}
