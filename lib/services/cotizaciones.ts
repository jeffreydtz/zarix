import { createServiceClientSync } from '@/lib/supabase/server';
import { YAHOO_FINANCE_HEADERS } from '@/lib/yahoo-finance-headers';
import { unstable_rethrow } from 'next/navigation';
import { EXECUTABLE_FX_MAX_AGE_MS, FxUnavailableError, isExecutableDolarQuote, requireExecutableDolarQuote } from '@/lib/executable-fx';
export { FxUnavailableError } from '@/lib/executable-fx';

export type DolarRateType = 'blue' | 'oficial' | 'mep' | 'ccl';

export interface DolarQuote {
  type: DolarRateType;
  buy: number;
  sell: number;
  timestamp: Date;
  provider?: string | null;
  origin?: 'provider' | 'persisted';
  stale?: boolean;
  asOf?: Date;
}

type DolarRates = Partial<Record<DolarRateType, DolarQuote>>;
export type DolarQuotes = DolarRates & {
  status: 'available' | 'partial' | 'unavailable';
  missing: DolarRateType[];
};

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
const MAX_MARKET_RATE_AGE_MS = positiveConfig(process.env.EXCHANGE_RATE_MARKET_MAX_AGE_SECONDS, 345600) * 1000;
const FRESH_RATE_AGE_MS = Math.min(MAX_RATE_AGE_MS, EXECUTABLE_FX_MAX_AGE_MS);
const MARKET_TIMEOUT_MS = positiveConfig(process.env.MARKET_DATA_TIMEOUT_MS, 8000);
const DOLAR_SOURCES = ['blue', 'oficial', 'mep', 'ccl'] as const;

function assertFreshQuote(
  timestamp: Date,
  prices: number[],
  pair?: string,
  maxAgeMs: number = MAX_RATE_AGE_MS
): void {
  const time = timestamp.getTime();
  if (!Number.isFinite(time) || Date.now() - time > maxAgeMs || time > Date.now() + 300000 ||
      prices.some(price => !Number.isFinite(price) || price <= 0)) {
    if (pair) throw new FxUnavailableError(pair);
    throw new Error('Cotización no disponible, inválida o vencida');
  }
}

/** Normalize expected provider I/O failures where they originate, never service/DB errors. */
async function fetchFxJson(url: string, options: RequestInit & { next?: { revalidate: number } }, pair: string): Promise<any> {
  try {
    const response = await fetch(url, options);
    if (!response.ok) throw new FxUnavailableError(pair);
    return await response.json();
  } catch (error) {
    unstable_rethrow(error);
    throw new FxUnavailableError(pair);
  }
}

function unavailableFx(error: unknown): null {
  unstable_rethrow(error);
  if (error instanceof FxUnavailableError) return null;
  throw error;
}

/** Invalid values and future timestamps are never usable, even as last-known data. */
function validDolarQuote(quote: DolarQuote | undefined): quote is DolarQuote {
  if (!quote) return false;
  const time = quote.timestamp.getTime();
  return Number.isFinite(quote.buy) && quote.buy > 0 &&
    Number.isFinite(quote.sell) && quote.sell > 0 && Number.isFinite(time) &&
    time <= Date.now() + 5 * 60 * 1000;
}

function acceptedDolarQuote(quote: DolarQuote | undefined): quote is DolarQuote {
  return validDolarQuote(quote) && Date.now() - quote.timestamp.getTime() <=
    (quote.type === 'blue' ? MAX_RATE_AGE_MS : MAX_MARKET_RATE_AGE_MS);
}

function dolarResult(quotes: DolarRates, required: readonly DolarRateType[]): DolarQuotes {
  const missing = required.filter(type => !quotes[type]);
  return {
    ...quotes,
    status: missing.length === 0 ? 'available' : missing.length === required.length ? 'unavailable' : 'partial',
    missing,
  };
}

function currentDolarRates(quotes: DolarRates): DolarRates {
  const result: DolarRates = {};
  for (const type of DOLAR_SOURCES) {
    const quote = quotes[type];
    if (acceptedDolarQuote(quote)) {
      result[type] = {
        ...quote, asOf: quote.timestamp,
        stale: Boolean(quote.stale) || quote.origin === 'persisted' ||
          Date.now() - quote.timestamp.getTime() > FRESH_RATE_AGE_MS,
      };
    }
  }
  return result;
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
 * combina por tasa, conservando la muestra válida más reciente. Agregar una
 * fuente nueva = implementar esta interfaz y sumarla al arreglo `dolarProviders`.
 */
interface DolarRateProvider {
  readonly name: string;
  /** Devuelve las tasas disponibles con su propia fecha de origen. */
  fetch(): Promise<DolarRates>;
}

/** Estrategia primaria: API de CriptoYa. */
class CriptoYaProvider implements DolarRateProvider {
  readonly name = 'criptoya';
  constructor(private readonly baseURL: string) {}

  async fetch(): Promise<Record<string, DolarQuote>> {
    const data = await fetchFxJson(`${this.baseURL}/dolar`, {
      next: { revalidate: 300 },
      signal: AbortSignal.timeout(MARKET_TIMEOUT_MS),
    }, 'USD/ARS');
    if (!data || typeof data !== 'object') throw new FxUnavailableError('USD/ARS');

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
    const rows: unknown = await fetchFxJson(`${this.baseURL}/dolares`, {
      headers: { Accept: 'application/json' },
      next: { revalidate: 300 },
      signal: AbortSignal.timeout(MARKET_TIMEOUT_MS),
    }, 'USD/ARS');
    if (!Array.isArray(rows)) {
      throw new FxUnavailableError('USD/ARS');
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

  async fetch(): Promise<DolarRates> {
    const supabase = createServiceClientSync();
    const queries = await Promise.allSettled(DOLAR_SOURCES.map(async source => {
      const { data, error } = await supabase
        .from('exchange_rates')
        .select('rate, timestamp')
        .eq('source', source)
        .eq('from_currency', 'USD')
        .eq('to_currency', 'ARS')
        .order('timestamp', { ascending: false })
        .limit(1)
        .single();
      if (error?.code === 'PGRST116') return null;
      if (error) throw error;
      if (!data) return null;
      // Both sides must belong to the same provider sample; never invent a spread.
      const { data: buy, error: buyError } = await supabase
        .from('exchange_rates').select('rate, timestamp')
        .eq('source', `${source}_buy`).eq('from_currency', 'USD').eq('to_currency', 'ARS')
        .eq('timestamp', data.timestamp).limit(1).maybeSingle();
      if (buyError) throw buyError;
      if (!buy) return null;
      return {
        type: source, buy: Number(buy.rate), sell: Number(data.rate),
        timestamp: sourceTimestamp(data.timestamp),
      } satisfies DolarQuote;
    }));

    const result: DolarRates = {};
    for (const query of queries) {
      if (query.status === 'rejected') throw query.reason;
      if (query.status === 'fulfilled' && query.value) {
        result[query.value.type] = query.value;
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

  private async saveLatestDolarQuotes(quotes: DolarRates): Promise<void> {
    const writableQuotes = Object.values(quotes)
      // Historical observations retain provider time, including accepted market closes.
      // Saving this history does not make a quote executable for monetary writes.
      .filter(q => q.origin === 'provider' && acceptedDolarQuote(q));
    if (writableQuotes.length === 0) return;
    for (const q of writableQuotes) {
      try {
        // One atomic buy/sell pair per insert: an unchanged market sample cannot
        // roll back another rate's fresh sample under unique_rate_per_timestamp.
        const rows = [
          { source: q.type, from_currency: 'USD', to_currency: 'ARS', rate: q.sell, timestamp: q.timestamp.toISOString() },
          { source: `${q.type}_buy`, from_currency: 'USD', to_currency: 'ARS', rate: q.buy, timestamp: q.timestamp.toISOString() },
        ];
        const { error } = await createServiceClientSync().from('exchange_rates').insert(rows);
        if (error && error.code !== '23505') throw error;
      } catch (error) {
        console.error(`Error saving dollar quote ${q.type}:`, error);
        throw error;
      }
    }
  }

  async getDolarQuotes(
    opts?: { preferCache?: boolean; require?: readonly DolarRateType[]; executable?: boolean }
  ): Promise<DolarQuotes> {
    const required = opts?.require ?? DOLAR_SOURCES;
    const cacheKey = this.getCacheKey('providers', 'dolar', 'all');
    const dbCacheKey = this.getCacheKey('db', 'dolar', 'all');
    const cached = this.getFromCache<DolarRates>(cacheKey);
    if (cached) {
      const current = currentDolarRates(cached);
      // A memory entry must never extend a rate's provider-time age limit.
      if (required.every(type => current[type] && (!opts?.executable || isExecutableDolarQuote(current[type], type)))) {
        return dolarResult(current, required);
      }
    }

    let persisted: DolarRates | undefined;
    const dbProvider = this.dolarProviders.find(provider => provider.name === 'db')!;
    if (opts?.preferCache && !opts.executable) {
      try {
        persisted = this.getFromCache<DolarRates>(dbCacheKey) ?? undefined;
        if (!persisted) {
          persisted = this.withProviderMetadata(await dbProvider.fetch(), 'db');
          this.setCache(dbCacheKey, persisted);
        }
        const current = currentDolarRates(persisted);
        if (required.every(type => current[type])) return dolarResult(current, required);
      } catch (error) {
        unavailableFx(error);
      }
    }

    const merged: DolarRates = {};
    const live: DolarRates = {};
    for (const provider of this.dolarProviders) {
      try {
        const quotes = provider.name === 'db' && persisted ? persisted :
          this.withProviderMetadata(await provider.fetch(), provider.name);
        if (provider.name === 'db' && !persisted) {
          persisted = quotes;
          this.setCache(dbCacheKey, persisted);
        }
        for (const type of DOLAR_SOURCES) {
          const quote = quotes[type];
          if (!acceptedDolarQuote(quote)) continue;
          // On equal timestamps preserve the provider priority: CriptoYa, DolarApi, DB.
          if (!merged[type] || quote.timestamp > merged[type]!.timestamp) merged[type] = quote;
          if (provider.name !== 'db' && (!live[type] || quote.timestamp > live[type]!.timestamp)) {
            live[type] = quote;
          }
        }
      } catch (error) {
        unavailableFx(error);
        console.error(`Dolar provider "${provider.name}" failed:`, error);
      }
    }

    await this.saveLatestDolarQuotes(live);
    const hasLive = Object.keys(live).length > 0;
    if (Object.keys(merged).length === 0) {
      // Total outage: display last-known persisted values explicitly as stale.
      // Never rescue rejected live data, invalid prices, or future provider dates.
      for (const type of DOLAR_SOURCES) {
        const quote = persisted?.[type];
        if (validDolarQuote(quote)) merged[type] = { ...quote, stale: true, asOf: quote.timestamp };
      }
    }
    // A DB fallback must not suppress the next live refresh attempt.
    if (hasLive) this.setCache(cacheKey, merged);
    return dolarResult(merged, required);
  }

  private withProviderMetadata(quotes: DolarRates, provider: string): DolarRates {
    return Object.fromEntries(Object.entries(quotes).map(([type, quote]) => [type, {
      ...quote, provider: provider === 'db' ? null : provider,
      origin: provider === 'db' ? 'persisted' as const : 'provider' as const,
      stale: provider === 'db' || Date.now() - quote.timestamp.getTime() > FRESH_RATE_AGE_MS,
      asOf: quote.timestamp,
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
      const data = await fetchFxJson(
        `${this.coingeckoBaseURL}/simple/price?ids=${coinId}&vs_currencies=usd,ars&include_24hr_change=true&include_last_updated_at=true`,
        { next: { revalidate: 60 }, signal: AbortSignal.timeout(MARKET_TIMEOUT_MS) },
        `${symbol}/USD`
      );
      const coinData = data?.[coinId];

      if (!coinData) {
        throw new FxUnavailableError(`${symbol}/USD`);
      }

      const quote: CryptoQuote = {
        symbol: symbol.toUpperCase(),
        priceUSD: coinData.usd || 0,
        priceARS: coinData.ars || 0,
        change24h: coinData.usd_24h_change || 0,
        timestamp: sourceTimestamp(coinData.last_updated_at),
      };
      assertFreshQuote(quote.timestamp, [quote.priceUSD, quote.priceARS], `${symbol}/USD`);

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
  private async getEurUsdRate(opts?: { executable?: boolean }): Promise<number> {
    const maxAgeMs = opts?.executable ? EXECUTABLE_FX_MAX_AGE_MS : MAX_RATE_AGE_MS;
    const cacheKey = this.getCacheKey('yahoo', 'EURUSD', 'spot');
    const cached = this.getFromCache<{ rate: number; timestamp: Date }>(cacheKey);
    if (cached) {
      try {
        assertFreshQuote(cached.timestamp, [cached.rate], opts?.executable ? 'EUR/USD' : undefined, maxAgeMs);
        return cached.rate;
      } catch { delete cache[cacheKey]; }
    }

    const data = await fetchFxJson(
      'https://query1.finance.yahoo.com/v8/finance/chart/EURUSD=X?range=1d&interval=1d',
      { headers: { ...YAHOO_FINANCE_HEADERS }, next: { revalidate: 300 }, signal: AbortSignal.timeout(MARKET_TIMEOUT_MS) },
      'EUR/USD'
    );
    const price = Number(data?.chart?.result?.[0]?.meta?.regularMarketPrice);
    if (!Number.isFinite(price) || price <= 0) {
      throw new FxUnavailableError('EUR/USD');
    }
    const timestamp = sourceTimestamp(data?.chart?.result?.[0]?.meta?.regularMarketTime);
    assertFreshQuote(timestamp, [price], 'EUR/USD', maxAgeMs);
    this.setCache(cacheKey, { rate: price, timestamp });
    return price;
  }

  /** Only request the fiat rates needed by the caller; previews request both by default. */
  async getTransactionsFxRates(currencies: readonly string[] = ['USD', 'EUR']): Promise<{
    usdArs: number | null;
    eurArs: number | null;
    fxUnavailable: boolean;
    stale: boolean;
    asOf: Date | null;
  }> {
    const required = new Set(currencies.map(currency => currency.trim().toUpperCase()));
    const needsEur = required.has('EUR');
    const needsBlue = required.has('USD') || needsEur;
    const [dolar, eurUsd] = await Promise.all([
      needsBlue ? this.getDolarQuotes({ require: ['blue'] }).catch(unavailableFx) : null,
      needsEur ? this.getEurUsdRate().catch(unavailableFx) : null,
    ]);
    const blue = dolar?.blue;
    const usdArs = blue && Number.isFinite(blue.sell) && blue.sell > 0 ? blue.sell : null;
    const eurArs = eurUsd && usdArs ? eurUsd * usdArs : null;
    return {
      usdArs, eurArs, fxUnavailable: (needsBlue && usdArs === null) || (needsEur && eurArs === null),
      stale: Boolean(blue?.stale), asOf: blue?.asOf ?? blue?.timestamp ?? null,
    };
  }

  /** Executable rate for monetary writes; display callers use getDolarQuotes. */
  async getExchangeRate(
    from: string,
    to: string = 'ARS'
  ): Promise<number> {
    const fromU = from.trim().toUpperCase();
    const toU = to.trim().toUpperCase();
    try {
      return await this.fetchExecutableExchangeRate(fromU, toU);
    } catch (error) {
      unstable_rethrow(error);
      if (error instanceof FxUnavailableError) throw new FxUnavailableError(`${fromU}→${toU}`);
      throw error;
    }
  }

  private async fetchExecutableExchangeRate(fromU: string, toU: string): Promise<number> {
    if (fromU === toU) return 1;

    // Source caches retain quote time; a derived numeric cache would extend freshness.

    if (fromU === 'USD' && toU === 'ARS') {
      const dolar = await this.getDolarQuotes({ require: ['blue'], executable: true });
      return requireExecutableDolarQuote(dolar.blue, 'USD→ARS', 'blue').sell;
    }

    if (fromU === 'ARS' && toU === 'USD') {
      const dolar = await this.getDolarQuotes({ require: ['blue'], executable: true });
      const buy = requireExecutableDolarQuote(dolar.blue, 'ARS→USD', 'blue').buy;
      const rate = 1 / buy;
      return rate;
    }

    if (fromU === 'EUR' && toU === 'ARS') {
      const eurUsd = await this.getEurUsdRate({ executable: true });
      const dolar = await this.getDolarQuotes({ require: ['blue'], executable: true });
      const sell = requireExecutableDolarQuote(dolar.blue, 'EUR→ARS', 'blue').sell;
      const rate = eurUsd * sell;
      return rate;
    }

    if (fromU === 'ARS' && toU === 'EUR') {
      const eurArs = await this.getExchangeRate('EUR', 'ARS');
      const rate = 1 / eurArs;
      return rate;
    }

    if (fromU === 'EUR' && toU === 'USD') {
      const rate = await this.getEurUsdRate({ executable: true });
      return rate;
    }

    if (fromU === 'USD' && toU === 'EUR') {
      const eurUsd = await this.getEurUsdRate({ executable: true });
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

    throw new FxUnavailableError(`${fromU}→${toU}`);
  }

  async getAllQuotes() {
    const [dolar, btc, eth, usdt] = await Promise.all([
      this.getDolarQuotes(),
      this.getCryptoQuote('BTC').catch(unavailableFx),
      this.getCryptoQuote('ETH').catch(unavailableFx),
      this.getCryptoQuote('USDT').catch(unavailableFx),
    ]);

    return {
      dolar,
      crypto: { btc, eth, usdt },
      timestamp: dolar.blue?.timestamp.toISOString() ?? null,
    };
  }
}

export const cotizacionesService = new CotizacionesService();
