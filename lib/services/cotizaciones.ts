import { createServiceClientSync } from '@/lib/supabase/server';
import { YAHOO_FINANCE_HEADERS } from '@/lib/yahoo-finance-headers';

export const DOLAR_SOURCES = ['blue', 'oficial', 'mep', 'ccl'] as const;
export type DolarSource = (typeof DOLAR_SOURCES)[number];

export interface DolarQuote {
  type: DolarSource;
  buy: number;
  sell: number;
  timestamp: Date;
  provider?: string | null;
  origin?: 'provider' | 'persisted';
  /** True when the quote is older than the 24h blue window but within the market-closed window. */
  stale?: boolean;
  /** ISO observation time of this source, independent of retrieval. */
  asOf?: string;
}

export type DolarQuotes = Partial<Record<DolarSource, DolarQuote>>;

export class FxUnavailableError extends Error {
  readonly code = 'FX_UNAVAILABLE' as const;
  constructor(message = 'Cotizaciones no disponibles') {
    super(message);
    this.name = 'FxUnavailableError';
  }
}

export function isFxUnavailableError(error: unknown): error is FxUnavailableError {
  return (
    error instanceof FxUnavailableError
    || (error instanceof Error && (error as { code?: unknown }).code === 'FX_UNAVAILABLE')
  );
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
/** Oficial/MEP/CCL: last close may sit through a weekend. Default 96h. */
const MAX_MARKET_AGE_MS = positiveConfig(process.env.EXCHANGE_RATE_MARKET_MAX_AGE_SECONDS, 345600) * 1000;
const MARKET_TIMEOUT_MS = positiveConfig(process.env.MARKET_DATA_TIMEOUT_MS, 8000);
const MARKET_DOLAR_SOURCES = new Set<DolarSource>(['oficial', 'mep', 'ccl']);

function assertFreshQuote(timestamp: Date, prices: number[]): void {
  const time = timestamp.getTime();
  if (!Number.isFinite(time) || Date.now() - time > MAX_RATE_AGE_MS || time > Date.now() + 300000 ||
      prices.some(price => !Number.isFinite(price) || price <= 0)) {
    throw new Error('Cotización no disponible, inválida o vencida');
  }
}

function maxAgeMsFor(source: DolarSource): number {
  return MARKET_DOLAR_SOURCES.has(source) ? MAX_MARKET_AGE_MS : MAX_RATE_AGE_MS;
}

function quoteTimestampMs(quote: Pick<DolarQuote, 'timestamp'> | undefined): number {
  const timestamp = quote?.timestamp;
  if (timestamp instanceof Date) return timestamp.getTime();
  if (typeof timestamp === 'string' && timestamp) return Date.parse(timestamp);
  return Number.NaN;
}

/** Per-source validity. Never rejects the rest of a payload because one source is stale. */
export function evaluateDolarQuote(
  source: DolarSource,
  quote: DolarQuote | undefined,
  now = Date.now(),
): DolarQuote | null {
  if (!quote) return null;
  if (!Number.isFinite(quote.buy) || quote.buy <= 0) return null;
  if (!Number.isFinite(quote.sell) || quote.sell <= 0) return null;
  const timestamp = quoteTimestampMs(quote);
  if (!Number.isFinite(timestamp) || timestamp > now + 5 * 60 * 1000) return null;
  const age = now - timestamp;
  if (age > maxAgeMsFor(source)) return null;
  const stale = MARKET_DOLAR_SOURCES.has(source) && age > MAX_RATE_AGE_MS;
  return {
    ...quote,
    type: source,
    stale,
    asOf: new Date(timestamp).toISOString(),
  };
}

function revalidateDolarQuotes(quotes: DolarQuotes | Record<string, DolarQuote> | null | undefined, now = Date.now()): DolarQuotes {
  const out: DolarQuotes = {};
  if (!quotes) return out;
  for (const source of DOLAR_SOURCES) {
    const evaluated = evaluateDolarQuote(source, quotes[source], now);
    if (evaluated) out[source] = evaluated;
  }
  return out;
}

function hasAnyDolarQuote(quotes: DolarQuotes): boolean {
  return DOLAR_SOURCES.some((source) => quotes[source] != null);
}

function hasRequiredSources(
  quotes: DolarQuotes,
  required?: readonly DolarSource[],
): boolean {
  if (!required?.length) return true;
  return required.every((source) => quotes[source] != null);
}

function pickFresher(current: DolarQuote | undefined, candidate: DolarQuote): DolarQuote {
  if (!current) return candidate;
  return quoteTimestampMs(candidate) > quoteTimestampMs(current) ? candidate : current;
}

function mergeDolarQuotes(into: DolarQuotes, incoming: DolarQuotes | Record<string, DolarQuote>): DolarQuotes {
  const valid = revalidateDolarQuotes(incoming);
  for (const source of DOLAR_SOURCES) {
    const candidate = valid[source];
    if (!candidate) continue;
    into[source] = pickFresher(into[source], candidate);
  }
  return into;
}

function cacheLostSource(cached: DolarQuotes, revalidated: DolarQuotes): boolean {
  return DOLAR_SOURCES.some((source) => cached[source] != null && revalidated[source] == null);
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
  /** Devuelve cada fuente con su propio timestamp; fuentes inválidas se filtran después. */
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
        try {
          const { data, error } = await supabase
            .from('exchange_rates')
            .select('rate, timestamp')
            .eq('source', source)
            .eq('from_currency', 'USD')
            .eq('to_currency', 'ARS')
            .order('timestamp', { ascending: false })
            .limit(1)
            .maybeSingle();

          if (error) throw error;
          // Legacy rows contain only sell. Require a buy side from the same sample;
          // copying sell into buy silently fabricates a zero spread.
          const { data: buy, error: buyError } = data ? await supabase
            .from('exchange_rates').select('rate, timestamp')
            .eq('source', `${source}_buy`).eq('from_currency', 'USD').eq('to_currency', 'ARS')
            .eq('timestamp', data.timestamp).limit(1).maybeSingle() : { data: null, error: null };
          if (buyError) throw buyError;
          return { source, data, buy };
        } catch (error) {
          console.error(`DB exchange_rates "${source}" failed:`, error);
          return { source, data: null, buy: null };
        }
      })
    );

    const hasAny = queries.some((q) => q.data?.rate);
    if (!hasAny) {
      throw new Error('Sin cotizaciones previas en exchange_rates');
    }

    const result: Record<string, DolarQuote> = {};

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
    if (now - cached.timestamp >= CACHE_TTL) {
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

  private async saveLatestDolarQuotes(quotes: DolarQuotes | Record<string, DolarQuote>): Promise<void> {
    try {
      const supabase = createServiceClientSync();

      // Persist each individually valid source. Fresh blue must be saved even when MEP is stale.
      const rows = Object.values(revalidateDolarQuotes(quotes))
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

  private fromMemoryCache(key: string): DolarQuotes | null {
    const cached = this.getFromCache<DolarQuotes>(key);
    if (!cached) return null;
    const revalidated = revalidateDolarQuotes(cached);
    if (!hasAnyDolarQuote(revalidated) || cacheLostSource(cached, revalidated)) {
      delete cache[key];
      return null;
    }
    return revalidated;
  }

  /**
   * Merge the freshest valid value per source across CriptoYa → DolarApi → DB.
   * Callers that need a specific source (blue for balances, mep for conversions)
   * must read it from the result; a missing source degrades that feature.
   */
  async getDolarQuotes(
    opts?: { preferCache?: boolean; require?: readonly DolarSource[] }
  ): Promise<DolarQuotes> {
    const cacheKey = this.getCacheKey('criptoya', 'dolar', 'all');
    const dbCacheKey = this.getCacheKey('db', 'dolar', 'all');
    const liveCached = this.fromMemoryCache(cacheKey);
    if (liveCached && hasRequiredSources(liveCached, opts?.require)) return liveCached;

    const merged: DolarQuotes = {};

    // Camino rápido (dashboard): última cotización persistida en DB en vez de
    // esperar a las APIs externas en vivo (que en frío tardan segundos). La
    // frescura la mantiene el cron update-prices. Si falta blue, cae al vivo.
    if (opts?.preferCache) {
      const dbCached = this.fromMemoryCache(dbCacheKey);
      if (dbCached) {
        mergeDolarQuotes(merged, dbCached);
        if (merged.blue && hasRequiredSources(merged, opts?.require)) return merged;
      }
      const dbProvider = this.dolarProviders.find((p) => p.name === 'db');
      if (dbProvider) {
        try {
          const quotes = this.withProviderMetadata(await dbProvider.fetch(), dbProvider.name);
          mergeDolarQuotes(merged, quotes);
          if (hasAnyDolarQuote(merged)) this.setCache(dbCacheKey, { ...merged });
          if (merged.blue && hasRequiredSources(merged, opts?.require)) return merged;
        } catch {
          // sin cache previa en DB → seguimos al camino en vivo
        }
      }
    }

    let lastError: unknown;
    let liveHit = false;
    for (const provider of this.dolarProviders) {
      try {
        const quotes = this.withProviderMetadata(await provider.fetch(), provider.name);
        const validFromProvider = revalidateDolarQuotes(quotes);
        mergeDolarQuotes(merged, validFromProvider);
        if (provider.name !== 'db' && hasAnyDolarQuote(validFromProvider)) {
          liveHit = true;
          await this.saveLatestDolarQuotes(validFromProvider);
        }
        if (DOLAR_SOURCES.every((source) => merged[source])) break;
      } catch (error) {
        console.error(`Dolar provider "${provider.name}" failed:`, error);
        lastError = error;
      }
    }

    if (!hasAnyDolarQuote(merged)) {
      throw lastError instanceof FxUnavailableError
        ? lastError
        : new FxUnavailableError(
          lastError instanceof Error ? lastError.message : 'No hay proveedor de cotización disponible',
        );
    }

    this.setCache(liveHit ? cacheKey : dbCacheKey, merged);
    if (!hasRequiredSources(merged, opts?.require)) {
      const missing = (opts?.require ?? []).filter((source) => merged[source] == null);
      throw new FxUnavailableError(
        `Cotización ${missing.join(', ')} no disponible, inválida o vencida`,
      );
    }
    return merged;
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
  async getTransactionsFxRates(): Promise<{
    usdArs: number | null;
    eurArs: number | null;
    fxUnavailable?: boolean;
    asOf?: string | null;
  }> {
    try {
      const dolar = await this.getDolarQuotes({ require: ['blue'] });
      const usdArs = dolar.blue?.sell;
      if (!(typeof usdArs === 'number' && usdArs > 0)) {
        return {
          usdArs: null,
          eurArs: null,
          fxUnavailable: true,
          asOf: dolar.blue?.asOf ?? null,
        };
      }
      let eurArs: number | null = null;
      try {
        const eurUsd = await this.getEurUsdRate();
        if (Number.isFinite(eurUsd) && eurUsd > 0) eurArs = eurUsd * usdArs;
      } catch {
        /* EUR is optional for native ARS/USD movements. */
      }
      return { usdArs, eurArs, asOf: dolar.blue?.asOf ?? null };
    } catch (error) {
      console.error('getTransactionsFxRates:', error);
      return { usdArs: null, eurArs: null, fxUnavailable: true };
    }
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
      const rate = dolar.blue?.sell;
      // Lanzar en vez de devolver 0: un 0 silencioso se multiplica aguas arriba
      // y guarda movimientos con amount_in_account_currency = 0.
      if (!(typeof rate === 'number' && rate > 0)) {
        throw new Error('Cotización USD→ARS no disponible');
      }
      return rate;
    }

    if (fromU === 'ARS' && toU === 'USD') {
      const dolar = await this.getDolarQuotes();
      const buy = dolar.blue?.buy;
      // Evitar Infinity/NaN si el blue viene en 0.
      if (!(typeof buy === 'number' && buy > 0)) {
        throw new Error('Cotización ARS→USD no disponible');
      }
      const rate = 1 / buy;
      return rate;
    }

    if (fromU === 'EUR' && toU === 'ARS') {
      const eurUsd = await this.getEurUsdRate();
      const dolar = await this.getDolarQuotes();
      if (!(typeof dolar.blue?.sell === 'number' && dolar.blue.sell > 0)) {
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

    const asOf =
      dolar.blue?.timestamp
      ?? dolar.oficial?.timestamp
      ?? dolar.mep?.timestamp
      ?? dolar.ccl?.timestamp;
    return {
      dolar,
      crypto: { btc, eth, usdt },
      timestamp: asOf instanceof Date && Number.isFinite(asOf.getTime()) ? asOf.toISOString() : null,
    };
  }
}

export const cotizacionesService = new CotizacionesService();
