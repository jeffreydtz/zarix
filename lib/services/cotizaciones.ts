import { createServiceClientSync } from '@/lib/supabase/server';
import { YAHOO_FINANCE_HEADERS } from '@/lib/yahoo-finance-headers';

export interface DolarQuote {
  type: 'blue' | 'oficial' | 'mep' | 'ccl';
  buy: number;
  sell: number;
  timestamp: Date;
  provider?: string | null;
  origin?: 'provider' | 'persisted';
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
function positiveConfig(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
const CACHE_TTL = positiveConfig(process.env.EXCHANGE_RATE_CACHE_TTL, 300) * 1000;
const MAX_RATE_AGE_MS = positiveConfig(process.env.EXCHANGE_RATE_MAX_AGE_SECONDS, 86400) * 1000;
const MARKET_TIMEOUT_MS = positiveConfig(process.env.MARKET_DATA_TIMEOUT_MS, 8000);
const DOLAR_SOURCES = ['blue', 'oficial', 'mep', 'ccl'] as const;

function assertFreshQuote(timestamp: Date, prices: number[]): void {
  const time = timestamp.getTime();
  if (!Number.isFinite(time) || Date.now() - time > MAX_RATE_AGE_MS || time > Date.now() + 300000 ||
      prices.some(price => !Number.isFinite(price) || price <= 0)) {
    throw new Error('Cotización no disponible, inválida o vencida');
  }
}

function validateDolarQuotes(quotes: Record<string, DolarQuote>): void {
  for (const source of DOLAR_SOURCES) {
    const quote = quotes[source];
    const timestamp = quote?.timestamp?.getTime();
    if (
      !quote || !Number.isFinite(quote.buy) || quote.buy <= 0 ||
      !Number.isFinite(quote.sell) || quote.sell <= 0 ||
      !Number.isFinite(timestamp) || Date.now() - timestamp > MAX_RATE_AGE_MS ||
      timestamp > Date.now() + 5 * 60 * 1000
    ) {
      throw new Error(`Cotización ${source} no disponible, inválida o vencida`);
    }
  }
}

interface DolarApiRow {
  casa: string;
  compra: number;
  venta: number;
  fechaActualizacion?: string;
}

/** Provider time, never retrieval time: absent/invalid dates must fail freshness checks. */
function sourceTimestamp(value: unknown): Date {
  if (typeof value === 'number' && Number.isFinite(value)) return new Date(value * 1000);
  if (typeof value === 'string' && value.trim()) return new Date(value);
  return new Date(Number.NaN);
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
      signal: AbortSignal.timeout(MARKET_TIMEOUT_MS),
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
        timestamp: sourceTimestamp(data.blue?.timestamp),
      },
      oficial: {
        type: 'oficial',
        buy: data.oficial?.bid || data.oficial || 0,
        sell: data.oficial?.ask || data.oficial || 0,
        timestamp: sourceTimestamp(data.oficial?.timestamp),
      },
      mep: {
        type: 'mep',
        buy: data.mep?.al30?.['24hs']?.price || 0,
        sell: data.mep?.al30?.['24hs']?.price || 0,
        timestamp: sourceTimestamp(data.mep?.al30?.['24hs']?.timestamp),
      },
      ccl: {
        type: 'ccl',
        buy: data.ccl?.al30?.['24hs']?.price || 0,
        sell: data.ccl?.al30?.['24hs']?.price || 0,
        timestamp: sourceTimestamp(data.ccl?.al30?.['24hs']?.timestamp),
      },
    };

    // Si el blue vino en 0 (respuesta degradada), tratarlo como fallo para caer
    // al siguiente proveedor en vez de cachear ceros que rompen toda conversión.
    if (!(quotes.blue.sell > 0) || !(quotes.blue.buy > 0)) {
      throw new Error('CriptoYa: dólar blue en 0');
    }

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
      signal: AbortSignal.timeout(MARKET_TIMEOUT_MS),
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
      blue: { type: 'blue', buy: Number(blue?.compra) || 0, sell: Number(blue?.venta) || 0, timestamp: sourceTimestamp(blue?.fechaActualizacion) },
      oficial: { type: 'oficial', buy: Number(oficial?.compra) || 0, sell: Number(oficial?.venta) || 0, timestamp: sourceTimestamp(oficial?.fechaActualizacion) },
      mep: { type: 'mep', buy: Number(bolsa?.compra) || 0, sell: Number(bolsa?.venta) || 0, timestamp: sourceTimestamp(bolsa?.fechaActualizacion) },
      ccl: { type: 'ccl', buy: Number(ccl?.compra) || 0, sell: Number(ccl?.venta) || 0, timestamp: sourceTimestamp(ccl?.fechaActualizacion) },
    };

    // Igual que CriptoYa: blue en 0 = respuesta degradada → fallar para caer al
    // siguiente proveedor en vez de cachear/persistir ceros que rompen conversiones.
    if (!(quotes.blue.sell > 0) || !(quotes.blue.buy > 0)) {
      throw new Error('DolarApi: dólar blue en 0');
    }

    return quotes;
  }
}

/** Estrategia de último recurso: último valor persistido en exchange_rates. */
class DbCacheProvider implements DolarRateProvider {
  readonly name = 'db';

  async fetch(): Promise<Record<string, DolarQuote>> {
    const supabase = createServiceClientSync();
    const sources = DOLAR_SOURCES;

    const queries = await Promise.all(
      sources.map(async (source) => {
        const { data, error } = await supabase
          .from('exchange_rates')
          .select('rate, timestamp')
          .eq('source', source)
          .eq('from_currency', 'USD')
          .eq('to_currency', 'ARS')
          .order('timestamp', { ascending: false })
          .limit(1)
          .single();

        if (error) throw error;
        // Legacy rows contain only sell. Require a buy side from the same sample;
        // copying sell into buy silently fabricates a zero spread.
        const { data: buy, error: buyError } = data ? await supabase
          .from('exchange_rates').select('rate, timestamp')
          .eq('source', `${source}_buy`).eq('from_currency', 'USD').eq('to_currency', 'ARS')
          .eq('timestamp', data.timestamp).limit(1).maybeSingle() : { data: null, error: null };
        if (buyError) throw buyError;
        return { source, data, buy };
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
          buy: q.buy ? Number(q.buy.rate) : 0,
          sell: Number(q.data.rate),
          timestamp: new Date(q.data.timestamp),
        };
      }
    }

    validateDolarQuotes(result);
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
        .flatMap((q) => [
          { source: q.type, from_currency: 'USD', to_currency: 'ARS', rate: q.sell, timestamp: q.timestamp.toISOString() },
          { source: `${q.type}_buy`, from_currency: 'USD', to_currency: 'ARS', rate: q.buy, timestamp: q.timestamp.toISOString() },
        ])
        .filter((r) => r.rate > 0);

      if (rows.length === 0) return;

      const { error } = await supabase.from('exchange_rates').insert(rows);
      if (error) throw error;
    } catch (error) {
      console.error('Error saving dollar quotes:', error);
    }
  }

  async getDolarQuotes(
    opts?: { preferCache?: boolean }
  ): Promise<Record<string, DolarQuote>> {
    const cacheKey = this.getCacheKey('criptoya', 'dolar', 'all');
    const dbCacheKey = this.getCacheKey('db', 'dolar', 'all');
    const cached = this.getFromCache<Record<string, DolarQuote>>(cacheKey);

    if (cached) {
      try {
        validateDolarQuotes(cached);
        return cached;
      } catch {
        delete cache[cacheKey];
      }
    }

    // Camino rápido (dashboard): última cotización persistida en DB en vez de
    // esperar a las APIs externas en vivo (que en frío tardan segundos). La
    // frescura la mantiene el cron update-prices. Si no hay cache en DB, cae al
    // camino en vivo. El caller (dashboard) lo envuelve en un timeout duro.
    if (opts?.preferCache) {
      const dbCached = this.getFromCache<Record<string, DolarQuote>>(dbCacheKey);
      if (dbCached) {
        try {
          validateDolarQuotes(dbCached);
          return dbCached;
        } catch {
          delete cache[dbCacheKey];
        }
      }
      const dbProvider = this.dolarProviders.find((p) => p.name === 'db');
      if (dbProvider) {
        try {
          const quotes = this.withProviderMetadata(await dbProvider.fetch(), dbProvider.name);
          this.setCache(dbCacheKey, quotes);
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
        const quotes = this.withProviderMetadata(await provider.fetch(), provider.name);
        validateDolarQuotes(quotes);
        this.setCache(provider.name === 'db' ? dbCacheKey : cacheKey, quotes);
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
  }

  private withProviderMetadata(quotes: Record<string, DolarQuote>, provider: string): Record<string, DolarQuote> {
    return Object.fromEntries(Object.entries(quotes).map(([type, quote]) => [type, {
      ...quote, provider: provider === 'db' ? null : provider,
      origin: provider === 'db' ? 'persisted' as const : 'provider' as const,
    }]));
  }

  async getCryptoQuote(symbol: string): Promise<CryptoQuote> {
    const cacheKey = this.getCacheKey('coingecko', symbol, 'USD');
    const cached = this.getFromCache<CryptoQuote>(cacheKey);

    if (cached) {
      try { assertFreshQuote(cached.timestamp, [cached.priceUSD, cached.priceARS]); return cached; }
      catch { delete cache[cacheKey]; }
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
        `${this.coingeckoBaseURL}/simple/price?ids=${coinId}&vs_currencies=usd,ars&include_24hr_change=true&include_last_updated_at=true`,
        { next: { revalidate: 60 }, signal: AbortSignal.timeout(MARKET_TIMEOUT_MS) }
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
        timestamp: sourceTimestamp(coinData.last_updated_at),
      };
      assertFreshQuote(quote.timestamp, [quote.priceUSD, quote.priceARS]);

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
    if (cached) {
      try { assertFreshQuote(cached.timestamp, [cached.price]); return cached; }
      catch { delete cache[cacheKey]; }
    }

    const yahooSymbol =
      market === 'us'
        ? normalizedTicker
        : normalizedTicker.endsWith('.BA')
          ? normalizedTicker
          : `${normalizedTicker}.BA`;

    try {
      const response = await fetch(
        `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?range=1d&interval=1d`,
        { headers: { ...YAHOO_FINANCE_HEADERS }, next: { revalidate: 300 }, signal: AbortSignal.timeout(MARKET_TIMEOUT_MS) }
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
        timestamp: sourceTimestamp(meta?.regularMarketTime),
      };
      assertFreshQuote(quote.timestamp, [quote.price]);

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
    const cached = this.getFromCache<{ rate: number; timestamp: Date }>(cacheKey);
    if (cached) {
      try { assertFreshQuote(cached.timestamp, [cached.rate]); return cached.rate; }
      catch { delete cache[cacheKey]; }
    }

    const response = await fetch(
      'https://query1.finance.yahoo.com/v8/finance/chart/EURUSD=X?range=1d&interval=1d',
      { headers: { ...YAHOO_FINANCE_HEADERS }, next: { revalidate: 300 }, signal: AbortSignal.timeout(MARKET_TIMEOUT_MS) }
    );
    if (!response.ok) {
      throw new Error(`Yahoo EURUSD error: ${response.status}`);
    }
    const data = await response.json();
    const price = Number(data?.chart?.result?.[0]?.meta?.regularMarketPrice);
    if (!Number.isFinite(price) || price <= 0) {
      throw new Error('Invalid EUR/USD from Yahoo');
    }
    const timestamp = sourceTimestamp(data?.chart?.result?.[0]?.meta?.regularMarketTime);
    assertFreshQuote(timestamp, [price]);
    this.setCache(cacheKey, { rate: price, timestamp });
    return price;
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

    // Source caches retain quote time; a derived numeric cache would extend freshness.

    if (fromU === 'USD' && toU === 'ARS') {
      const dolar = await this.getDolarQuotes();
      const rate = dolar.blue.sell;
      // Lanzar en vez de devolver 0: un 0 silencioso se multiplica aguas arriba
      // y guarda movimientos con amount_in_account_currency = 0.
      if (!(rate > 0)) {
        throw new Error('Cotización USD→ARS no disponible');
      }
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
      return rate;
    }

    if (fromU === 'EUR' && toU === 'ARS') {
      const eurUsd = await this.getEurUsdRate();
      const dolar = await this.getDolarQuotes();
      if (!(dolar.blue.sell > 0)) {
        throw new Error('Cotización EUR→ARS no disponible');
      }
      const rate = eurUsd * dolar.blue.sell;
      return rate;
    }

    if (fromU === 'ARS' && toU === 'EUR') {
      const eurArs = await this.getExchangeRate('EUR', 'ARS');
      const rate = 1 / eurArs;
      return rate;
    }

    if (fromU === 'EUR' && toU === 'USD') {
      const rate = await this.getEurUsdRate();
      return rate;
    }

    if (fromU === 'USD' && toU === 'EUR') {
      const eurUsd = await this.getEurUsdRate();
      const rate = 1 / eurUsd;
      return rate;
    }

    const cryptoSymbols = new Set(['BTC', 'ETH', 'USDT', 'USDC', 'DAI']);
    if (cryptoSymbols.has(fromU) && toU === 'USD') {
      const crypto = await this.getCryptoQuote(fromU);
      return crypto.priceUSD;
    }

    if (cryptoSymbols.has(fromU) && toU === 'ARS') {
      const crypto = await this.getCryptoQuote(fromU);
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
