import { createServiceClientSync } from '@/lib/supabase/server';
import { YAHOO_FINANCE_HEADERS } from '@/lib/yahoo-finance-headers';
import { positiveNumber, quoteDate, singleFlight } from '@/lib/market-data/requests';

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
const configuredTtl = Number(process.env.EXCHANGE_RATE_CACHE_TTL || 300);
const CACHE_TTL = Number.isFinite(configuredTtl) && configuredTtl > 0 ? configuredTtl * 1000 : 300_000;
const FETCH_TIMEOUT_MS = 5000;
const COIN_IDS: Record<string, string> = {
  BTC: 'bitcoin', ETH: 'ethereum', USDT: 'tether', USDC: 'usd-coin', DAI: 'dai',
  SOL: 'solana', XRP: 'ripple', BNB: 'binancecoin', ADA: 'cardano', DOGE: 'dogecoin',
  AVAX: 'avalanche-2', DOT: 'polkadot', LINK: 'chainlink', LTC: 'litecoin',
};

function validateDollarQuotes(quotes: Record<string, DolarQuote>): void {
  for (const type of ['blue', 'oficial', 'mep', 'ccl']) {
    const q = quotes[type];
    if (!q || !positiveNumber(q.buy) || !positiveNumber(q.sell) || !Number.isFinite(q.timestamp.getTime())) {
      throw new Error(`Cotización ${type} inválida o incompleta`);
    }
    q.buy = Number(q.buy);
    q.sell = Number(q.sell);
  }
}

interface DolarApiRow {
  casa: string;
  compra: number;
  venta: number;
  fechaActualizacion?: string;
}

/**
 * Patrón Strategy: cada fuente de cotización del dólar es una estrategia
 * intercambiable que cumple esta interfaz. CotizacionesService (Context) las
 * recorre en orden hasta obtener una cotización válida (fallback). Agregar una
 * fuente nueva = implementar esta interfaz y sumarla al arreglo `dolarProviders`.
 */
interface DolarRateProvider {
  readonly name: string;
  /** Devuelve blue/oficial/mep/ccl o lanza si la fuente no está disponible. */
  fetch(): Promise<Record<string, DolarQuote>>;
}

/** Estrategia primaria: API de CriptoYa. */
class CriptoYaProvider implements DolarRateProvider {
  readonly name = 'criptoya';
  constructor(private readonly baseURL: string) {}

  async fetch(): Promise<Record<string, DolarQuote>> {
    const response = await fetch(`${this.baseURL}/dolar`, {
      next: { revalidate: 300 },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    if (!response.ok) {
      throw new Error(`CriptoYa API error: ${response.status}`);
    }

    const data = await response.json();

    // CriptoYa: `bid` = compra (lo que la casa te paga por 1 USD), `ask` = venta
    // (lo que te cuesta comprar 1 USD). Convención de la app: buy=compra, sell=venta.
    const quotes: Record<string, DolarQuote> = {
      blue: {
        type: 'blue',
        buy: data.blue?.bid || data.blue || 0,
        sell: data.blue?.ask || data.blue || 0,
        timestamp: quoteDate(data.timestamp),
      },
      oficial: {
        type: 'oficial',
        buy: data.oficial?.bid || data.oficial || 0,
        sell: data.oficial?.ask || data.oficial || 0,
        timestamp: quoteDate(data.timestamp),
      },
      mep: {
        type: 'mep',
        buy: data.mep?.al30?.['24hs']?.price || 0,
        sell: data.mep?.al30?.['24hs']?.price || 0,
        timestamp: quoteDate(data.timestamp),
      },
      ccl: {
        type: 'ccl',
        buy: data.ccl?.al30?.['24hs']?.price || 0,
        sell: data.ccl?.al30?.['24hs']?.price || 0,
        timestamp: quoteDate(data.timestamp),
      },
    };

    // Si el blue vino en 0 (respuesta degradada), tratarlo como fallo para caer
    // al siguiente proveedor en vez de cachear ceros que rompen toda conversión.
    if (!(quotes.blue.sell > 0) || !(quotes.blue.buy > 0)) {
      throw new Error('CriptoYa: dólar blue en 0');
    }

    validateDollarQuotes(quotes);
    return quotes;
  }
}

/** Estrategia de respaldo: API pública de DolarApi (sin API key). */
class DolarApiProvider implements DolarRateProvider {
  readonly name = 'dolarapi';
  constructor(private readonly baseURL: string) {}

  async fetch(): Promise<Record<string, DolarQuote>> {
    const response = await fetch(`${this.baseURL}/dolares`, {
      headers: { Accept: 'application/json' },
      next: { revalidate: 300 },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    if (!response.ok) {
      throw new Error(`DolarApi error: ${response.status}`);
    }

    const rows = (await response.json()) as unknown;
    if (!Array.isArray(rows)) {
      throw new Error('DolarApi: respuesta inválida');
    }

    const byCasa = new Map<string, DolarApiRow>();
    for (const r of rows) {
      if (r && typeof r === 'object' && 'casa' in r) {
        const row = r as DolarApiRow;
        byCasa.set(row.casa, row);
      }
    }

    const blue = byCasa.get('blue');
    const oficial = byCasa.get('oficial');
    const bolsa = byCasa.get('bolsa');
    const ccl = byCasa.get('contadoconliqui');
    const quotes: Record<string, DolarQuote> = {
      blue: { type: 'blue', buy: Number(blue?.compra) || 0, sell: Number(blue?.venta) || 0, timestamp: quoteDate(blue?.fechaActualizacion) },
      oficial: { type: 'oficial', buy: Number(oficial?.compra) || 0, sell: Number(oficial?.venta) || 0, timestamp: quoteDate(oficial?.fechaActualizacion) },
      mep: { type: 'mep', buy: Number(bolsa?.compra) || 0, sell: Number(bolsa?.venta) || 0, timestamp: quoteDate(bolsa?.fechaActualizacion) },
      ccl: { type: 'ccl', buy: Number(ccl?.compra) || 0, sell: Number(ccl?.venta) || 0, timestamp: quoteDate(ccl?.fechaActualizacion) },
    };

    // Igual que CriptoYa: blue en 0 = respuesta degradada → fallar para caer al
    // siguiente proveedor en vez de cachear/persistir ceros que rompen conversiones.
    if (!(quotes.blue.sell > 0) || !(quotes.blue.buy > 0)) {
      throw new Error('DolarApi: dólar blue en 0');
    }

    validateDollarQuotes(quotes);
    return quotes;
  }
}

/** Estrategia de último recurso: último valor persistido en exchange_rates. */
class DbCacheProvider implements DolarRateProvider {
  readonly name = 'db';

  async fetch(): Promise<Record<string, DolarQuote>> {
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
          .abortSignal(AbortSignal.timeout(2000))
          .single();

        return { source, data };
      })
    );

    const hasAny = queries.some((q) => q.data?.rate);
    if (!hasAny) {
      throw new Error('Sin cotizaciones previas en exchange_rates');
    }

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

    validateDollarQuotes(result);
    return result;
  }
}

class CotizacionesService {
  private criptoyaBaseURL: string;
  private coingeckoBaseURL: string;
  private dolarApiBaseURL: string;
  /** Estrategias de cotización del dólar, en orden de preferencia (fallback). */
  private dolarProviders: DolarRateProvider[];

  constructor() {
    this.criptoyaBaseURL = process.env.CRIPTOYA_API_URL || 'https://criptoya.com/api';
    this.coingeckoBaseURL = process.env.COINGECKO_API_URL || 'https://api.coingecko.com/api/v3';
    this.dolarApiBaseURL = process.env.DOLARAPI_URL || 'https://dolarapi.com/v1';
    this.dolarProviders = [
      new CriptoYaProvider(this.criptoyaBaseURL),
      new DolarApiProvider(this.dolarApiBaseURL),
      new DbCacheProvider(),
    ];
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
    // Los símbolos vienen de requests: mantener acotado el caché de proceso.
    if (Object.keys(cache).length >= 500) delete cache[Object.keys(cache)[0]];
    cache[key] = {
      data,
      timestamp: Date.now(),
    };
  }

  private async saveLatestDolarQuotes(quotes: Record<string, DolarQuote>): Promise<void> {
    try {
      const supabase = createServiceClientSync();

      // Nunca persistir tasas <= 0: quedan en exchange_rates y las lee DbCacheProvider.
      const rows = Object.values(quotes)
        .map((q) => ({
          source: q.type,
          from_currency: 'USD',
          to_currency: 'ARS',
          rate: q.sell || q.buy || 0,
          timestamp: q.timestamp.toISOString(),
        }))
        .filter((r) => Number.isFinite(r.rate) && r.rate > 0);

      if (rows.length === 0) return;

      await supabase.from('exchange_rates').insert(rows).abortSignal(AbortSignal.timeout(2000));
    } catch (error) {
      console.error('Error saving dollar quotes:', error);
    }
  }

  async getDolarQuotes(
    opts?: { preferCache?: boolean }
  ): Promise<Record<string, DolarQuote>> {
    const cacheKey = this.getCacheKey('criptoya', 'dolar', opts?.preferCache ? 'db' : 'all');
    const cached = this.getFromCache<Record<string, DolarQuote>>(cacheKey);

    if (cached) {
      return cached;
    }

    return singleFlight(`dolar:${opts?.preferCache ? 'db' : 'live'}`, async () => {
      // Camino rápido (dashboard): última cotización persistida en DB en vez de
      // esperar a las APIs externas en vivo (que en frío tardan segundos). La
      // frescura la mantiene el cron update-prices. Si no hay cache en DB, cae al
      // camino en vivo. El caller (dashboard) lo envuelve en un timeout duro.
      if (opts?.preferCache) {
        const dbProvider = this.dolarProviders.find((p) => p.name === 'db');
        if (dbProvider) {
          try {
            const quotes = await dbProvider.fetch();
            this.setCache(cacheKey, quotes);
            return quotes;
          } catch {
            // sin cache previa en DB → seguimos al camino en vivo
          }
        }
      }

      // Patrón Strategy + fallback: recorre los proveedores en orden hasta que uno
      // devuelve una cotización válida. Solo se persisten las fuentes en vivo
      // (no el proveedor de respaldo en BD, que ya lee de exchange_rates).
      let lastError: unknown;
      for (const provider of this.dolarProviders) {
        try {
          const quotes = await provider.fetch();
          this.setCache(cacheKey, quotes);
          if (provider.name !== 'db') {
            await this.saveLatestDolarQuotes(quotes);
          }
          return quotes;
        } catch (error) {
          console.error(`Dolar provider "${provider.name}" failed:`, error);
          lastError = error;
        }
      }

      throw lastError ?? new Error('No hay proveedor de cotización disponible');
    });
  }

  /** CoinGecko simple/price admite IDs separados por coma; una consulta por lote. */
  async getCryptoQuotes(symbols: string[]): Promise<Record<string, CryptoQuote>> {
    const normalized = [...new Set(symbols.map((s) => s.trim().toUpperCase()))];
    if (normalized.length > 100 || normalized.some((s) => !/^[A-Z0-9-]{1,64}$/.test(s))) {
      throw new Error('Símbolos cripto inválidos');
    }
    const result: Record<string, CryptoQuote> = {};
    const missing = normalized.filter((symbol) => {
      const cached = this.getFromCache<CryptoQuote>(this.getCacheKey('coingecko', symbol, 'USD'));
      if (cached) result[symbol] = cached;
      return !cached;
    });
    if (!missing.length) return result;
    const fresh = await singleFlight(`crypto:${missing.slice().sort().join(',')}`, async () => {
      const ids = [...new Set(missing.map((s) => COIN_IDS[s] || s.toLowerCase()))];
      const query = new URLSearchParams({ ids: ids.join(','), vs_currencies: 'usd,ars', include_24hr_change: 'true', include_last_updated_at: 'true' });
      const response = await fetch(`${this.coingeckoBaseURL}/simple/price?${query}`, {
        next: { revalidate: 60 }, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      if (!response.ok) throw new Error(`CoinGecko API error: ${response.status}`);
      const data = await response.json();
      const quotes: Record<string, CryptoQuote> = {};
      for (const symbol of missing) {
        const row = data?.[COIN_IDS[symbol] || symbol.toLowerCase()];
        const priceUSD = positiveNumber(row?.usd);
        const priceARS = positiveNumber(row?.ars);
        if (!priceUSD || !priceARS) continue;
        const quote: CryptoQuote = { symbol, priceUSD, priceARS,
          change24h: typeof row.usd_24h_change === 'number' && Number.isFinite(row.usd_24h_change) ? row.usd_24h_change : 0,
          timestamp: quoteDate(row.last_updated_at),
        };
        this.setCache(this.getCacheKey('coingecko', symbol, 'USD'), quote);
        quotes[symbol] = quote;
      }
      return quotes;
    });
    return { ...result, ...fresh };
  }

  async getCryptoQuote(symbol: string): Promise<CryptoQuote> {
    const normalized = symbol.trim().toUpperCase();
    const quotes = await this.getCryptoQuotes([normalized]);
    if (!quotes[normalized]) throw new Error(`Crypto ${normalized} no disponible`);
    return quotes[normalized];
  }

  async getStockQuote(
    ticker: string,
    market: 'us' | 'arg' | 'cedear' = 'us'
  ): Promise<StockQuote> {
    const normalizedTicker = ticker.trim().toUpperCase();
    const cacheKey = this.getCacheKey('yahoo', normalizedTicker, market);
    const cached = this.getFromCache<StockQuote>(cacheKey);
    if (cached) return cached;

    if (!/^[A-Z0-9.^=-]{1,40}$/.test(normalizedTicker)) throw new Error('Ticker inválido');
    return singleFlight(cacheKey, async () => {
      const yahooSymbol =
        market === 'us'
          ? normalizedTicker
          : normalizedTicker.endsWith('.BA')
            ? normalizedTicker
            : `${normalizedTicker}.BA`;

      try {
        const response = await fetch(
          `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?range=1d&interval=1d`,
          { headers: { ...YAHOO_FINANCE_HEADERS }, next: { revalidate: 300 }, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) }
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
        const change = Number.isFinite(prevClose) && prevClose > 0 ? ((price - prevClose) / prevClose) * 100 : 0;

        if (!Number.isFinite(price) || price <= 0) {
          throw new Error(`No price for ${yahooSymbol}`);
        }

        const quote: StockQuote = {
          ticker: normalizedTicker,
          price,
          currency,
          change,
          timestamp: quoteDate(meta?.regularMarketTime),
        };

        this.setCache(cacheKey, quote);
        return quote;
      } catch (error) {
        console.error(`Error fetching stock quote for ${ticker}:`, error);
        throw error;
      }
    });
  }

  /**
   * EUR/USD spot (cuántos USD por 1 EUR), vía Yahoo. Solo para pares fiat de transacciones.
   */
  private async getEurUsdRate(): Promise<number> {
    const cacheKey = this.getCacheKey('yahoo', 'EURUSD', 'spot');
    const cached = this.getFromCache<number>(cacheKey);
    if (cached) return cached;

    return singleFlight(cacheKey, async () => {
      const response = await fetch(
        'https://query1.finance.yahoo.com/v8/finance/chart/EURUSD=X?range=1d&interval=1d',
        { headers: { ...YAHOO_FINANCE_HEADERS }, next: { revalidate: 300 }, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) }
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
    });
  }

  /** Cotizaciones mínimas para movimientos (ARS / USD / EUR), sin crypto ni otros mercados. */
  async getTransactionsFxRates(): Promise<{ usdArs: number; eurArs: number }> {
    const [dolar, eurUsd] = await Promise.all([
      this.getDolarQuotes(),
      this.getEurUsdRate(),
    ]);
    const usdArs = dolar.blue.sell;
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
      // Lanzar en vez de devolver 0: un 0 silencioso se multiplica aguas arriba
      // y guarda movimientos con amount_in_account_currency = 0.
      if (!(rate > 0)) {
        throw new Error('Cotización USD→ARS no disponible');
      }
      this.setCache(cacheKey, rate);
      return rate;
    }

    if (fromU === 'ARS' && toU === 'USD') {
      const dolar = await this.getDolarQuotes();
      const buy = dolar.blue.buy;
      // Evitar Infinity/NaN si el blue viene en 0.
      if (!(buy > 0)) {
        throw new Error('Cotización ARS→USD no disponible');
      }
      const rate = 1 / buy;
      this.setCache(cacheKey, rate);
      return rate;
    }

    if (fromU === 'EUR' && toU === 'ARS') {
      const eurUsd = await this.getEurUsdRate();
      const dolar = await this.getDolarQuotes();
      if (!(dolar.blue.sell > 0)) {
        throw new Error('Cotización EUR→ARS no disponible');
      }
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
    if (cryptoSymbols.has(fromU) && toU === 'USD') {
      const crypto = await this.getCryptoQuote(from);
      this.setCache(cacheKey, crypto.priceUSD);
      return crypto.priceUSD;
    }

    if (cryptoSymbols.has(fromU) && toU === 'ARS') {
      const crypto = await this.getCryptoQuote(from);
      this.setCache(cacheKey, crypto.priceARS);
      return crypto.priceARS;
    }

    throw new Error(`Exchange rate ${from}→${to} not supported`);
  }

  async getAllQuotes() {
    const [dolar, quotes] = await Promise.all([
      this.getDolarQuotes(),
      this.getCryptoQuotes(['BTC', 'ETH', 'USDT']),
    ]);
    const { BTC: btc, ETH: eth, USDT: usdt } = quotes;
    if (!btc || !eth || !usdt) throw new Error('Cotizaciones cripto incompletas');

    return {
      dolar,
      crypto: { btc, eth, usdt },
      timestamp: dolar.blue.timestamp.toISOString(),
    };
  }
}

export const cotizacionesService = new CotizacionesService();
