import { createServiceClientSync } from '@/lib/supabase/server';

interface DolarQuote {
  type: 'blue' | 'oficial' | 'mep' | 'ccl';
  buy: number;
  sell: number;
  timestamp: Date;
}

interface CryptoQuote {
  symbol: string;
  priceUSD: number;
  priceARS: number;
  change24h: number;
  timestamp: Date;
}

interface StockQuote {
  ticker: string;
  price: number;
  currency: string;
  change: number;
  timestamp: Date;
}

interface CacheEntry {
  data: any;
  timestamp: number;
}

const cache: Record<string, CacheEntry> = {};
const CACHE_TTL = parseInt(process.env.EXCHANGE_RATE_CACHE_TTL || '300') * 1000;

class CotizacionesService {
  private criptoyaBaseURL: string;
  private coingeckoBaseURL: string;

  constructor() {
    this.criptoyaBaseURL = process.env.CRIPTOYA_API_URL || 'https://criptoya.com/api';
    this.coingeckoBaseURL = process.env.COINGECKO_API_URL || 'https://api.coingecko.com/api/v3';
  }

  private getCacheKey(source: string, from: string, to: string): string {
    return `${source}:${from}:${to}`;
  }

  private getFromCache<T>(key: string): T | null {
    const cached = cache[key];
    if (!cached) return null;

    const now = Date.now();
    if (now - cached.timestamp > CACHE_TTL) {
      delete cache[key];
      return null;
    }

    return cached.data as T;
  }

  private setCache<T>(key: string, data: T): void {
    cache[key] = {
      data,
      timestamp: Date.now(),
    };
  }

  private async saveLatestDolarQuotes(quotes: Record<string, DolarQuote>): Promise<void> {
    try {
      const supabase = createServiceClientSync();
      const nowIso = new Date().toISOString();

      const rows = Object.values(quotes).map((q) => ({
        source: q.type,
        from_currency: 'USD',
        to_currency: 'ARS',
        rate: q.sell || q.buy || 0,
        timestamp: nowIso,
      }));

      await supabase.from('exchange_rates').insert(rows);
    } catch (error) {
      console.error('Error saving dollar quotes:', error);
    }
  }

  private async getLatestDolarQuotesFromDB(): Promise<Record<string, DolarQuote> | null> {
    try {
      const supabase = createServiceClientSync();
      const sources = ['blue', 'oficial', 'mep', 'ccl'];

      const queries = await Promise.all(
        sources.map(async (source) => {
          const { data } = await supabase
            .from('exchange_rates')
            .select('rate, timestamp')
            .eq('source', source)
            .eq('from_currency', 'USD')
            .eq('to_currency', 'ARS')
            .order('timestamp', { ascending: false })
            .limit(1)
            .single();

          return { source, data };
        })
      );

      const hasAny = queries.some((q) => q.data?.rate);
      if (!hasAny) return null;

      const result: Record<string, DolarQuote> = {
        blue: { type: 'blue', buy: 0, sell: 0, timestamp: new Date() },
        oficial: { type: 'oficial', buy: 0, sell: 0, timestamp: new Date() },
        mep: { type: 'mep', buy: 0, sell: 0, timestamp: new Date() },
        ccl: { type: 'ccl', buy: 0, sell: 0, timestamp: new Date() },
      };

      for (const q of queries) {
        if (q.data?.rate) {
          result[q.source] = {
            type: q.source as DolarQuote['type'],
            buy: Number(q.data.rate),
            sell: Number(q.data.rate),
            timestamp: new Date(q.data.timestamp),
          };
        }
      }

      return result;
    } catch (error) {
      console.error('Error reading latest dollar quotes from DB:', error);
      return null;
    }
  }

  async getDolarQuotes(): Promise<Record<string, DolarQuote>> {
    const cacheKey = this.getCacheKey('criptoya', 'dolar', 'all');
    const cached = this.getFromCache<Record<string, DolarQuote>>(cacheKey);

    if (cached) {
      return cached;
    }

    try {
      const response = await fetch(`${this.criptoyaBaseURL}/dolar`, {
        next: { revalidate: 300 },
      });

      if (!response.ok) {
        throw new Error(`CriptoYa API error: ${response.status}`);
      }

      const data = await response.json();

      const quotes: Record<string, DolarQuote> = {
        blue: {
          type: 'blue',
          buy: data.blue?.ask || data.blue || 0,
          sell: data.blue?.bid || data.blue || 0,
          timestamp: new Date(),
        },
        oficial: {
          type: 'oficial',
          buy: data.oficial?.ask || data.oficial || 0,
          sell: data.oficial?.bid || data.oficial || 0,
          timestamp: new Date(),
        },
        mep: {
          type: 'mep',
          buy: data.mep?.al30?.['24hs']?.price || 0,
          sell: data.mep?.al30?.['24hs']?.price || 0,
          timestamp: new Date(),
        },
        ccl: {
          type: 'ccl',
          buy: data.ccl?.al30?.['24hs']?.price || 0,
          sell: data.ccl?.al30?.['24hs']?.price || 0,
          timestamp: new Date(),
        },
      };

      this.setCache(cacheKey, quotes);
      this.saveLatestDolarQuotes(quotes);
      return quotes;
    } catch (error) {
      console.error('Error fetching dolar quotes:', error);
      const fallbackFromDb = await this.getLatestDolarQuotesFromDB();
      if (fallbackFromDb) {
        this.setCache(cacheKey, fallbackFromDb);
        return fallbackFromDb;
      }
      throw error;
    }
  }

  async getCryptoQuote(symbol: string): Promise<CryptoQuote> {
    const cacheKey = this.getCacheKey('coingecko', symbol, 'USD');
    const cached = this.getFromCache<CryptoQuote>(cacheKey);

    if (cached) {
      return cached;
    }

    const coinIdMap: Record<string, string> = {
      BTC: 'bitcoin',
      ETH: 'ethereum',
      USDT: 'tether',
      USDC: 'usd-coin',
      DAI: 'dai',
    };

    const coinId = coinIdMap[symbol.toUpperCase()] || symbol.toLowerCase();

    try {
      const response = await fetch(
        `${this.coingeckoBaseURL}/simple/price?ids=${coinId}&vs_currencies=usd,ars&include_24hr_change=true`,
        { next: { revalidate: 60 } }
      );

      if (!response.ok) {
        throw new Error(`CoinGecko API error: ${response.status}`);
      }

      const data = await response.json();
      const coinData = data[coinId];

      if (!coinData) {
        throw new Error(`Crypto ${symbol} not found`);
      }

      const quote: CryptoQuote = {
        symbol: symbol.toUpperCase(),
        priceUSD: coinData.usd || 0,
        priceARS: coinData.ars || 0,
        change24h: coinData.usd_24h_change || 0,
        timestamp: new Date(),
      };

      this.setCache(cacheKey, quote);
      return quote;
    } catch (error) {
      console.error(`Error fetching crypto quote for ${symbol}:`, error);
      throw error;
    }
  }

  async getStockQuote(
    ticker: string,
    market: 'us' | 'arg' | 'cedear' = 'us'
  ): Promise<StockQuote> {
    const normalizedTicker = ticker.trim().toUpperCase();
    const cacheKey = this.getCacheKey('yahoo', normalizedTicker, market);
    const cached = this.getFromCache<StockQuote>(cacheKey);
    if (cached) return cached;

    const yahooSymbol =
      market === 'us'
        ? normalizedTicker
        : normalizedTicker.endsWith('.BA')
          ? normalizedTicker
          : `${normalizedTicker}.BA`;

    try {
      const response = await fetch(
        `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?range=1d&interval=1d`,
        { next: { revalidate: 300 } }
      );

      if (!response.ok) {
        throw new Error(`Yahoo API error: ${response.status}`);
      }

      const data = await response.json();
      const result = data?.chart?.result?.[0];
      const meta = result?.meta;

      const price = Number(meta?.regularMarketPrice || 0);
      const prevClose = Number(meta?.chartPreviousClose || meta?.previousClose || 0);
      const currency = String(meta?.currency || (market === 'us' ? 'USD' : 'ARS'));
      const change = prevClose > 0 ? ((price - prevClose) / prevClose) * 100 : 0;

      if (!price) {
        throw new Error(`No price for ${yahooSymbol}`);
      }

      const quote: StockQuote = {
        ticker: normalizedTicker,
        price,
        currency,
        change,
        timestamp: new Date(),
      };

      this.setCache(cacheKey, quote);
      return quote;
    } catch (error) {
      console.error(`Error fetching stock quote for ${ticker}:`, error);
      throw error;
    }
  }

  /**
   * EUR/USD spot (cuántos USD por 1 EUR), vía Yahoo. Solo para pares fiat de transacciones.
   */
  private async getEurUsdRate(): Promise<number> {
    const cacheKey = this.getCacheKey('yahoo', 'EURUSD', 'spot');
    const cached = this.getFromCache<number>(cacheKey);
    if (cached) return cached;

    const response = await fetch(
      'https://query1.finance.yahoo.com/v8/finance/chart/EURUSD=X?range=1d&interval=1d',
      { next: { revalidate: 300 } }
    );
    if (!response.ok) {
      throw new Error(`Yahoo EURUSD error: ${response.status}`);
    }
    const data = await response.json();
    const price = Number(data?.chart?.result?.[0]?.meta?.regularMarketPrice);
    if (!Number.isFinite(price) || price <= 0) {
      throw new Error('Invalid EUR/USD from Yahoo');
    }
    this.setCache(cacheKey, price);
    return price;
  }

  /** Cotizaciones mínimas para movimientos (ARS / USD / EUR), sin crypto ni otros mercados. */
  async getTransactionsFxRates(): Promise<{ usdArs: number; eurArs: number }> {
    const dolar = await this.getDolarQuotes();
    const usdArs = dolar.blue.sell;
    const eurUsd = await this.getEurUsdRate();
    const eurArs = eurUsd * usdArs;
    return { usdArs, eurArs };
  }

  async getExchangeRate(
    from: string,
    to: string = 'ARS'
  ): Promise<number> {
    const fromU = from.trim().toUpperCase();
    const toU = to.trim().toUpperCase();
    if (fromU === toU) return 1;

    const cacheKey = this.getCacheKey('auto', fromU, toU);
    const cached = this.getFromCache<number>(cacheKey);
    if (cached) return cached;

    if (fromU === 'USD' && toU === 'ARS') {
      const dolar = await this.getDolarQuotes();
      const rate = dolar.blue.sell;
      this.setCache(cacheKey, rate);
      return rate;
    }

    if (fromU === 'ARS' && toU === 'USD') {
      const dolar = await this.getDolarQuotes();
      const rate = 1 / dolar.blue.buy;
      this.setCache(cacheKey, rate);
      return rate;
    }

    if (fromU === 'EUR' && toU === 'ARS') {
      const eurUsd = await this.getEurUsdRate();
      const dolar = await this.getDolarQuotes();
      const rate = eurUsd * dolar.blue.sell;
      this.setCache(cacheKey, rate);
      return rate;
    }

    if (fromU === 'ARS' && toU === 'EUR') {
      const eurArs = await this.getExchangeRate('EUR', 'ARS');
      const rate = 1 / eurArs;
      this.setCache(cacheKey, rate);
      return rate;
    }

    if (fromU === 'EUR' && toU === 'USD') {
      const rate = await this.getEurUsdRate();
      this.setCache(cacheKey, rate);
      return rate;
    }

    if (fromU === 'USD' && toU === 'EUR') {
      const eurUsd = await this.getEurUsdRate();
      const rate = 1 / eurUsd;
      this.setCache(cacheKey, rate);
      return rate;
    }

    const cryptoSymbols = new Set(['BTC', 'ETH', 'USDT', 'USDC', 'DAI']);
    if (cryptoSymbols.has(from) && to === 'USD') {
      const crypto = await this.getCryptoQuote(from);
      this.setCache(cacheKey, crypto.priceUSD);
      return crypto.priceUSD;
    }

    if (cryptoSymbols.has(from) && to === 'ARS') {
      const crypto = await this.getCryptoQuote(from);
      this.setCache(cacheKey, crypto.priceARS);
      return crypto.priceARS;
    }

    throw new Error(`Exchange rate ${from}→${to} not supported`);
  }

  async getAllQuotes() {
    const [dolar, btc, eth, usdt] = await Promise.all([
      this.getDolarQuotes(),
      this.getCryptoQuote('BTC'),
      this.getCryptoQuote('ETH'),
      this.getCryptoQuote('USDT'),
    ]);

    return {
      dolar,
      crypto: { btc, eth, usdt },
      timestamp: dolar.blue.timestamp.toISOString(),
    };
  }
}

export const cotizacionesService = new CotizacionesService();
