import { NextRequest } from 'next/server';
import { IterativeCronJob, ServiceClient } from '@/lib/cron/cron-job';
import { cotizacionesService } from '@/lib/services/cotizaciones';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const CRYPTO_TICKER_MAP: Record<string, string> = {
  BTC: 'BTC',
  ETH: 'ETH',
  USDT: 'USDT',
  USDC: 'USDT',
  DAI: 'USDT',
};

class UpdatePricesJob extends IterativeCronJob<any> {
  readonly name = 'update-prices';

  private priceCache: Record<string, number> = {};

  protected async fetchItems(supabase: ServiceClient): Promise<any[]> {
    // Get all active investments with crypto or USD-priced assets
    const { data: investments, error } = await supabase
      .from('investments')
      .select('id, type, ticker, purchase_currency')
      .eq('is_active', true)
      .eq('is_manual_price', false)
      .in('type', ['crypto', 'stock_us', 'etf', 'cedear']);

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
        const mappedTicker = CRYPTO_TICKER_MAP[inv.ticker.toUpperCase()] || inv.ticker.toUpperCase();
        cryptoTickers.add(mappedTicker);
      } else if ((inv.type === 'stock_us' || inv.type === 'etf') && inv.ticker) {
        usTickers.add(inv.ticker.toUpperCase());
      } else if (inv.type === 'stock_arg' && inv.ticker) {
        argTickers.add(inv.ticker.toUpperCase());
      } else if (inv.type === 'cedear' && inv.ticker) {
        cedearTickers.add(inv.ticker.toUpperCase());
      }
    }

    // Fetch crypto prices
    for (const ticker of cryptoTickers) {
      try {
        const quote = await cotizacionesService.getCryptoQuote(ticker);
        this.priceCache[ticker] = quote.priceUSD;
      } catch (e) {
        console.error(`Error fetching price for ${ticker}:`, e);
      }
    }

    // Fetch US stock/ETF prices
    for (const ticker of usTickers) {
      try {
        const quote = await cotizacionesService.getStockQuote(ticker, 'us');
        this.priceCache[`US:${ticker}`] = quote.price;
      } catch (e) {
        console.error(`Error fetching US stock price for ${ticker}:`, e);
      }
    }

    // Fetch Argentina stock prices (MERVAL)
    for (const ticker of argTickers) {
      try {
        const quote = await cotizacionesService.getStockQuote(ticker, 'arg');
        this.priceCache[`ARG:${ticker}`] = quote.price;
      } catch (e) {
        console.error(`Error fetching ARG stock price for ${ticker}:`, e);
      }
    }

    // Fetch CEDEAR prices (usually .BA)
    for (const ticker of cedearTickers) {
      try {
        const quote = await cotizacionesService.getStockQuote(ticker, 'cedear');
        this.priceCache[`CEDEAR:${ticker}`] = quote.price;
      } catch (e) {
        console.error(`Error fetching CEDEAR price for ${ticker}:`, e);
      }
    }

    // Fetch USD/ARS rate (useful for USDT plazo fijo)
    try {
      const dolar = await cotizacionesService.getDolarQuotes();
      this.priceCache['USD_ARS'] = dolar.blue.sell;
    } catch (e) {
      console.error('Error fetching USD rate:', e);
    }
  }

  private resolvePrice(inv: any): number | null {
    if (inv.type === 'crypto' && inv.ticker) {
      const mappedTicker = CRYPTO_TICKER_MAP[inv.ticker.toUpperCase()] || inv.ticker.toUpperCase();
      return this.priceCache[mappedTicker] || null;
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

  protected shouldProcess(inv: any): boolean {
    return this.resolvePrice(inv) !== null;
  }

  protected async processItem(supabase: ServiceClient, inv: any): Promise<void> {
    const { error } = await supabase
      .from('investments')
      .update({
        current_price: this.resolvePrice(inv),
        current_price_updated_at: new Date().toISOString(),
      })
      .eq('id', inv.id);

    if (error) throw error;
  }

  /** Persiste el histórico de cotizaciones obtenidas en esta corrida. */
  protected async afterAll(supabase: ServiceClient, _items: any[]): Promise<void> {
    try {
      const usdRate = this.priceCache['USD_ARS'] ?? 0;
      if (usdRate > 0) {
        await supabase.from('exchange_rates').upsert({
          source: 'blue',
          from_currency: 'USD',
          to_currency: 'ARS',
          rate: usdRate,
          timestamp: new Date().toISOString(),
        }, { onConflict: 'source,from_currency,to_currency,timestamp' });
      }

      for (const [ticker, price] of Object.entries(this.priceCache)) {
        if (ticker === 'USD_ARS') continue;
        await supabase.from('exchange_rates').upsert({
          source: 'coingecko',
          from_currency: ticker,
          to_currency: 'USD',
          rate: price,
          timestamp: new Date().toISOString(),
        }, { onConflict: 'source,from_currency,to_currency,timestamp' });
      }
    } catch (e) {
      console.error('Error storing exchange rates:', e);
    }
  }

  protected emptyMessage(): string {
    return 'No investments to update';
  }
}

export async function GET(request: NextRequest) {
  return new UpdatePricesJob().run(request);
}
