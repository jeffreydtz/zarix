import { FxUnavailableError, isExecutableDolarQuote } from '@/lib/executable-fx';
import type { InvestmentType } from '@/types/database';
import {
  adaptQuoteToMarketCurrency,
  fciPlausibilityAnchor,
  fciPricePlausible,
  listingCandidates,
  resolveFciQuoteCurrency,
  resolveQuoteCurrency,
  type ConvertibleQuote,
} from '@/lib/market-data/quote-currency';
import { loadArgentineQuotes, type ArgentineQuoteIndex, type Data912Quote } from '@/lib/market-data/data912-client';
import { fetchYahooStockQuotesMap } from '@/lib/yahoo-finance-quotes';
import { fetchStooqUsQuote } from '@/lib/stooq-us-quote';
import { cotizacionesService } from '@/lib/services/cotizaciones';
import { fetchFciQuote } from '@/lib/market-data/cafci-client';
import {
  FCI_DAILY_JUMP_MAX_AGE_MS,
  FCI_DAILY_JUMP_WIDE,
  fciJumpMaxAbs,
} from '@/lib/market-data/fci-daily-jump';
import {
  AR_MARKET_TZ,
  evaluateFciNavFreshness,
  FCI_NAV_MAX_BUSINESS_DAYS,
  navTimestampToCivilYmd,
} from '@/lib/market-data/fci-nav-freshness';
import { civilTodayYmd } from '@/lib/transaction-date';
import {
  isArgentineListedType,
  yahooSymbolFor,
} from '@/lib/investments/type-meta';

export interface QuoteResult {
  price: number;
  changePct: number | null;
  currency: string;
  timestamp: string | null;
  fxStale?: boolean;
  fxAsOf?: string | null;
  source?: string;
}

export class InvestmentQuoteMap extends Map<string, QuoteResult> {
  readonly unavailableFxKeys = new Set<string>();

  override set(key: string, quote: QuoteResult): this {
    this.unavailableFxKeys.delete(key);
    return super.set(key, quote);
  }
}

export interface QuoteRefreshPosition {
  type: InvestmentType;
  ticker: string | null;
  market_currency: string | null;
  purchase_currency: string | null;
  /** Last stored cuotaparte in market_currency, used as the plausibility anchor. */
  current_price?: number | string | null;
  purchase_price?: number | string | null;
  /** Last persisted NAV observation; FCI writes must not go backwards. */
  current_price_updated_at?: string | null;
  /** When set, FCI results are keyed per position so plausibility is not shared. */
  id?: string | null;
}

function quoteSourceTimestamp(quote: unknown): string | null {
  if (!quote || typeof quote !== 'object' || !('timestamp' in quote)) return null;
  const timestamp = (quote as { timestamp?: unknown }).timestamp;
  const time = timestamp instanceof Date ? timestamp.getTime()
    : typeof timestamp === 'string' && timestamp ? Date.parse(timestamp) : Number.NaN;
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

/** Prefer the source observation; if the feed omitted it, store the fetch time (UTC). */
export function quoteTimestampOrFetchedAt(quote: unknown, fetchedAtIso: string): string {
  return quoteSourceTimestamp(quote) ?? fetchedAtIso;
}

/** IOL is preview-only. Automatic FCI writes are CAFCI observations with a NAV timestamp. */
export function shouldPersistFciQuote(quote: Pick<QuoteResult, 'source' | 'timestamp'>): boolean {
  return quote.source === 'cafci' && typeof quote.timestamp === 'string' && quote.timestamp.length > 0;
}

export { FCI_DAILY_JUMP_MAX_AGE_MS } from '@/lib/market-data/fci-daily-jump';

/** Inclusive ±8%/±25% daily_jump endpoints; relative epsilon so +8% and +8%+1e-9 stay inside. */
export const FCI_DAILY_JUMP_EPS = 1e-6;

/**
 * Stored NAV date is after today's Argentina civil date (app clock).
 * Future stored timestamps are never overwritten automatically.
 */
export function isAnomalousFutureTimestamp(
  iso: string | null | undefined,
  nowMs: number = Date.now()
): boolean {
  if (!iso) return false;
  const ymd = navTimestampToCivilYmd(iso);
  if (!ymd) return false;
  return ymd > civilTodayYmd(AR_MARKET_TZ, new Date(nowMs));
}

function postgrestTimestamp(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

/** PostgREST `.or()` so a concurrent newer observation is not overwritten. */
export function monotonicCurrentPriceFilter(sourceTs: string): string {
  return [
    'current_price_updated_at.is.null',
    `current_price_updated_at.lt."${postgrestTimestamp(sourceTs)}"`,
  ].join(',');
}

export type ObservedRowMatch = {
  type: InvestmentType;
  ticker: string | null;
  market_currency: string | null;
};

/** @deprecated Use ObservedRowMatch; kept so existing FCI call sites type-check. */
export type FciRowMatch = ObservedRowMatch;

function applyRawTextMatch<Q extends {
  eq: (column: string, value: unknown) => Q;
  is: (column: string, value: null) => Q;
}>(query: Q, column: string, value: string | null): Q {
  return value == null ? query.is(column, null) : query.eq(column, value);
}

function rawTextEquals(observed: string | null, winning: unknown): boolean {
  if (observed == null) return winning == null;
  return winning === observed;
}

/**
 * Concurrent edits of type, ticker, currency, or price mode must not be overwritten.
 * Match the RAW observed ticker and market_currency (including `''` and `' USD '`);
 * `is()` only when the observed value was null. Business logic still normalizes.
 */
export function applyObservedRowMatch<Q extends {
  eq: (column: string, value: unknown) => Q;
  is: (column: string, value: null) => Q;
}>(query: Q, row: ObservedRowMatch): Q {
  const next = query
    .eq('type', row.type)
    .eq('is_manual_price', false);
  return applyRawTextMatch(
    applyRawTextMatch(next, 'ticker', row.ticker),
    'market_currency',
    row.market_currency,
  );
}

/** CAS so a slower writer cannot overwrite a newer `current_price_updated_at`. */
export function applyObservedTimestampMatch<Q extends {
  eq: (column: string, value: unknown) => Q;
  is: (column: string, value: null) => Q;
}>(query: Q, observedTs: string | null | undefined): Q {
  return applyRawTextMatch(query, 'current_price_updated_at', observedTs ?? null);
}

/** @deprecated Use applyObservedRowMatch. */
export const applyFciRowMatch = applyObservedRowMatch;

export type AutomaticPriceZeroRowReason =
  | 'row_changed'
  | 'older_than_stored'
  | 'future_stored';

export function observedRowStillMatches(
  observed: ObservedRowMatch,
  winning: {
    type?: unknown;
    ticker?: unknown;
    market_currency?: unknown;
    is_manual_price?: unknown;
  } | null | undefined
): boolean {
  if (!winning) return false;
  return winning.type === observed.type
    && rawTextEquals(observed.ticker, winning.ticker ?? null)
    && rawTextEquals(observed.market_currency, winning.market_currency ?? null)
    && winning.is_manual_price === false;
}

export function classifyAutomaticPriceZeroRows(opts: {
  observed: ObservedRowMatch & { current_price_updated_at?: string | null };
  winning?: {
    type?: unknown;
    ticker?: unknown;
    market_currency?: unknown;
    is_manual_price?: unknown;
    current_price_updated_at?: unknown;
  } | null;
  nowMs?: number;
}): AutomaticPriceZeroRowReason {
  if (!observedRowStillMatches(opts.observed, opts.winning)) return 'row_changed';
  const winningTs = typeof opts.winning?.current_price_updated_at === 'string'
    ? opts.winning.current_price_updated_at
    : null;
  const observedTs = opts.observed.current_price_updated_at ?? null;
  const nowMs = opts.nowMs ?? Date.now();
  if (isAnomalousFutureTimestamp(winningTs, nowMs) && !isAnomalousFutureTimestamp(observedTs, nowMs)) {
    return 'future_stored';
  }
  return 'older_than_stored';
}

export type FciDailyJumpResult =
  | { ok: true; ratio: number; maxAbs: number; applied: boolean }
  | { ok: false; reason: 'daily_jump'; ratio: number; maxAbs: number };

/**
 * Skip a same-day-scale jump vs a stored price ≤10 calendar days old.
 * Band comes from the CAFCI catalog fund type (8% money-market/renta fija/T+0,
 * 25% equity/mixed/unknown) so a legitimate equity move is not frozen.
 */
export function evaluateFciDailyJump(opts: {
  candidate: number;
  storedPrice: number;
  storedTs: string | null | undefined;
  nowMs?: number;
  maxAbs?: number;
}): FciDailyJumpResult {
  const maxAbs = opts.maxAbs ?? FCI_DAILY_JUMP_WIDE;
  const ratio = opts.storedPrice > 0 ? opts.candidate / opts.storedPrice : Number.NaN;
  if (!(opts.storedPrice > 0) || !Number.isFinite(ratio)) {
    return { ok: true, ratio, maxAbs, applied: false };
  }
  const storedMs = storedFciTimestampMs(opts.storedTs);
  const nowMs = opts.nowMs ?? Date.now();
  if (!Number.isFinite(storedMs) || nowMs - storedMs > FCI_DAILY_JUMP_MAX_AGE_MS) {
    return { ok: true, ratio, maxAbs, applied: false };
  }
  if (Math.abs(ratio - 1) > maxAbs * (1 + FCI_DAILY_JUMP_EPS)) {
    return { ok: false, reason: 'daily_jump', ratio, maxAbs };
  }
  return { ok: true, ratio, maxAbs, applied: true };
}

/** Stored observation is usable as a monotonic floor (not future/garbage). */
export function storedFciTimestampMs(storedIso: string | null | undefined): number {
  const storedTs = quoteSourceTimestamp({ timestamp: storedIso });
  if (!storedTs) return Number.NaN;
  const freshness = evaluateFciNavFreshness(storedTs);
  if (!freshness.ok && freshness.reason !== 'stale_nav') return Number.NaN;
  const ms = Date.parse(storedTs);
  return Number.isFinite(ms) ? ms : Number.NaN;
}

export function desiredQuoteCurrency(inv: QuoteRefreshPosition): string {
  const stored = (inv.market_currency || '').trim().toUpperCase();
  if (stored) return stored;
  // Sin override: la rueda del ticker manda. Un bono hard-dollar cotizado en
  // ARS no se reconvierte a USD solo porque la compra fue en dólares.
  return '';
}

/** type:TICKER:CURRENCY so ARS/USD books of the same ticker do not overwrite. */
export function quoteCacheKey(
  type: InvestmentType,
  ticker: string,
  currency: string
): string {
  const t = ticker.trim().toUpperCase();
  const ccy = (currency || '').trim().toUpperCase() || 'NATIVE';
  return `${type}:${t}:${ccy}`;
}

export function quoteCacheKeyForPosition(inv: QuoteRefreshPosition): string | null {
  if (!inv.ticker) return null;
  const currency = inv.type === 'crypto' ? 'USD' : desiredQuoteCurrency(inv);
  const base = quoteCacheKey(inv.type, inv.ticker, currency);
  if (inv.type === 'fci' && inv.id) return `${base}:${inv.id}`;
  return base;
}

export function dedupeByTicker<T extends { ticker: string }>(jobs: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const job of jobs) {
    const ticker = job.ticker.trim().toUpperCase();
    if (!ticker || seen.has(ticker)) continue;
    seen.add(ticker);
    out.push(job);
  }
  return out;
}

export const FCI_REFRESH_CONCURRENCY = 3;
export const FCI_REFRESH_BUDGET_MS = 20_000;

export function dedupeByCacheKey<T extends { cacheKey: string }>(jobs: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const job of jobs) {
    if (seen.has(job.cacheKey)) continue;
    seen.add(job.cacheKey);
    out.push(job);
  }
  return out;
}

/** Why one FCI got no CAFCI quote. Strings are capped; never a response body. */
export interface FciSkipDetail {
  reason: string;
  status?: number;
  stage?: string;
  server?: string;
  source?: string;
  cafciStage?: string;
  iolStage?: string;
}

const FCI_SKIP_REASON_MAX = 200;

function capReason(value: string): string {
  return value.replace(/[\r\n\t]+/g, ' ').slice(0, FCI_SKIP_REASON_MAX);
}

/** Exported for tests: turns a fetchFciQuote rejection into a log-safe detail. */
export function describeFciFetchError(error: unknown): FciSkipDetail {
  const detail: FciSkipDetail = { reason: 'error' };
  if (error instanceof Error) {
    detail.reason = capReason(error.message || error.name || 'error');
  } else if (typeof error === 'string') {
    detail.reason = capReason(error);
  }
  const rec = error && typeof error === 'object' ? error as Record<string, unknown> : null;
  if (rec && typeof rec.status === 'number' && Number.isFinite(rec.status)) detail.status = rec.status;
  if (rec && (rec.stage === 'catalog' || rec.stage === 'ficha' || rec.stage === 'iol' || rec.stage === 'daily')) {
    detail.stage = rec.stage;
  }
  if (rec && typeof rec.server === 'string' && rec.server) detail.server = capReason(rec.server).slice(0, 60);
  if (rec && typeof rec.source === 'string' && rec.source) detail.source = capReason(rec.source).slice(0, 16);
  if (rec && typeof rec.cafciStage === 'string' && rec.cafciStage) detail.cafciStage = rec.cafciStage;
  if (rec && typeof rec.iolStage === 'string' && rec.iolStage) detail.iolStage = rec.iolStage;
  if (rec && rec.name === 'FciCombinedError') {
    const cafciReason = typeof rec.cafciReason === 'string' ? rec.cafciReason : '';
    const iolReason = typeof rec.iolReason === 'string' ? rec.iolReason : '';
    if (cafciReason && iolReason) {
      detail.reason = capReason(`${cafciReason}; ${iolReason}`);
    }
  }
  return detail;
}

export async function mapWithLimit<T, R>(
  items: readonly T[],
  limit: number,
  budgetMs: number,
  fn: (item: T) => Promise<R>
): Promise<Array<R | undefined>> {
  const start = Date.now();
  const results: Array<R | undefined> = new Array(items.length);
  let next = 0;
  const workers = Math.max(1, Math.min(limit, items.length));
  await Promise.all(Array.from({ length: workers }, async () => {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      if (Date.now() - start >= budgetMs) {
        results[i] = undefined;
        continue;
      }
      results[i] = await fn(items[i]);
    }
  }));
  return results;
}

function argKind(type: InvestmentType): 'stock_arg' | 'cedear' | 'bond' | 'on' | 'fci' | 'other' {
  if (type === 'stock_arg' || type === 'cedear' || type === 'bond' || type === 'on' || type === 'fci') {
    return type;
  }
  return 'other';
}

type ArgentineLookup =
  | { status: 'hit'; quote: ConvertibleQuote }
  | { status: 'unconfirmed' }
  | { status: 'miss' };

function quoteFromMap(
  map: Map<string, Data912Quote> | undefined,
  symbol: string
): ConvertibleQuote | null | 'unconfirmed' {
  if (!map) return null;
  const hit = map.get(symbol.toUpperCase());
  if (!hit || hit.price <= 0) return null;
  const tagged = typeof hit.currency === 'string' ? hit.currency.trim().toUpperCase() : '';
  const currency = resolveQuoteCurrency({
    matchedSymbol: hit.symbol || symbol,
    listed: map,
    sourceCurrency: tagged,
  });
  if (currency == null) return 'unconfirmed';
  return {
    price: hit.price,
    changePct: hit.changePct,
    currency,
    timestamp: quoteSourceTimestamp(hit),
    stale: Boolean(hit.stale),
  };
}

function lookupArgentineSymbol(
  arg: ArgentineQuoteIndex,
  type: InvestmentType,
  ticker: string,
  marketCurrency: string
): ArgentineLookup {
  const maps =
    type === 'stock_arg' ? [arg.byStock]
      : type === 'cedear' ? [arg.byCedear]
        : type === 'bond' ? [arg.byBond, arg.byCorp]
          : type === 'on' ? [arg.byCorp, arg.byBond]
            : [];
  const preferred = marketCurrency || 'ARS';
  const { symbols } = listingCandidates(ticker, preferred, argKind(type));
  let unconfirmed = false;
  for (const map of maps) {
    for (const symbol of symbols) {
      const hit = quoteFromMap(map, symbol);
      if (hit === 'unconfirmed') {
        unconfirmed = true;
        continue;
      }
      if (hit) return { status: 'hit', quote: hit };
    }
  }
  if (unconfirmed) return { status: 'unconfirmed' };
  return { status: 'miss' };
}

/**
 * Main Yahoo currency at the refresh layer: a present field — including
 * whitespace-only — is used as-is. Only a missing/empty field is inferred
 * (`.BA` → ARS, else USD). Whitespace then fails adapt() like main, so AAPL
 * falls through to Stooq.
 */
function yahooCurrencyForCacheKey(symbol: string, raw: string | undefined): string {
  if (raw && raw.length > 0) return raw;
  if (symbol === '^MERV') return 'PTS';
  if (symbol.endsWith('.BA')) return 'ARS';
  return 'USD';
}

function mepRate(quotes: { mep?: { sell: number; buy: number } } | null): number | null {
  const sell = quotes?.mep?.sell;
  const buy = quotes?.mep?.buy;
  if (Number.isFinite(sell) && (sell as number) > 0) return sell as number;
  if (Number.isFinite(buy) && (buy as number) > 0) return buy as number;
  return null;
}

/**
 * Precio de mercado en la moneda de cotización de cada posición.
 * data912 (ARG/CEDEAR/bono/ON) → Yahoo `.BA` / US → Stooq; FCI is CAFCI then IOL; crypto via CoinGecko.
 */
export async function refreshQuotesForInvestments(
  investments: QuoteRefreshPosition[],
  options?: {
    allowStaleFx?: boolean;
    fciBudgetMs?: number;
    /** Discovery only: results must never be used for automatic persistence. */
    allowUnanchoredFciPreview?: boolean;
  }
): Promise<InvestmentQuoteMap> {
  const fetchedAt = new Date().toISOString();
  const stamp = (quote: ConvertibleQuote): QuoteResult | null => {
    if (quote.stale) {
      const original = quoteSourceTimestamp(quote);
      if (!original) return null;
      return {
        price: quote.price,
        changePct: quote.changePct,
        currency: quote.currency,
        timestamp: original,
        fxStale: quote.fxStale,
        fxAsOf: quote.fxAsOf,
      };
    }
    return {
      price: quote.price,
      changePct: quote.changePct,
      currency: quote.currency,
      timestamp: quoteTimestampOrFetchedAt(quote, fetchedAt),
      fxStale: quote.fxStale,
      fxAsOf: quote.fxAsOf,
    };
  };
  const out = new InvestmentQuoteMap();
  const yahooSymbolToCacheKeys = new Map<string, Set<string>>();
  const addYahoo = (symbol: string, cacheKey: string) => {
    let set = yahooSymbolToCacheKeys.get(symbol);
    if (!set) {
      set = new Set();
      yahooSymbolToCacheKeys.set(symbol, set);
    }
    set.add(cacheKey);
  };
  const cryptoSymbols = new Set<string>();
  const fciTickers: Array<{
    ticker: string;
    cacheKey: string;
    currency: string;
    currentPrice: number | string | null | undefined;
    purchasePrice: number | string | null | undefined;
    purchaseCurrency: string | null;
    currentPriceUpdatedAt: string | null;
    id: string | null;
  }> = [];
  const argPositions: Array<{
    type: InvestmentType;
    ticker: string;
    cacheKey: string;
    currency: string;
  }> = [];

  for (const inv of investments) {
    if (!inv.ticker) continue;
    const ticker = inv.ticker.trim().toUpperCase();
    const currency = desiredQuoteCurrency(inv);
    const cacheKey = quoteCacheKey(inv.type, ticker, currency);
    if (inv.type === 'crypto') {
      cryptoSymbols.add(ticker);
      continue;
    }
    if (inv.type === 'fci') {
      if (!ticker) {
        console.warn('[quotes] skip CAFCI failure', {
          ticker: inv.ticker,
          reason: 'empty_ticker',
          ...(inv.id ? { id: inv.id } : {}),
        });
        continue;
      }
      fciTickers.push({
        ticker,
        cacheKey: quoteCacheKeyForPosition(inv) ?? cacheKey,
        currency,
        currentPrice: inv.current_price,
        purchasePrice: inv.purchase_price,
        purchaseCurrency: inv.purchase_currency,
        currentPriceUpdatedAt: inv.current_price_updated_at ?? null,
        id: inv.id ?? null,
      });
      continue;
    }
    if (isArgentineListedType(inv.type)) {
      argPositions.push({ type: inv.type, ticker, cacheKey, currency });
      continue;
    }
    if (inv.type === 'stock_us' || inv.type === 'etf') {
      addYahoo(yahooSymbolFor(inv.type, ticker), cacheKey);
    }
  }

  let arg: ArgentineQuoteIndex | null = null;
  if (argPositions.length > 0) {
    try {
      arg = await loadArgentineQuotes();
    } catch {
      arg = null;
    }
  }

  const dolar = await cotizacionesService.getDolarQuotes({ require: ['mep'], executable: !options?.allowStaleFx }).catch(error => {
    if (!(error instanceof FxUnavailableError)) throw error;
    return null;
  });
  const mep = dolar?.mep;
  const mepExecutable = isExecutableDolarQuote(mep, 'mep');
  const mepArsPerUsd = mepExecutable || options?.allowStaleFx ? mepRate(dolar) : null;
  // Display estimates may use stale FX; plausibility anchors for writes may not.
  const anchorMepArsPerUsd = mepExecutable ? mepRate(dolar) : null;
  const mepObserved = mep?.asOf ?? mep?.timestamp;
  const mepAsOf = mepObserved && Number.isFinite(new Date(mepObserved).getTime())
    ? new Date(mepObserved).toISOString() : null;

  const adapt = (quote: ConvertibleQuote, currency: string, cacheKey: string): QuoteResult | null => {
    if (!currency) return quote;
    const needsMep = quote.currency.trim().toUpperCase() !== currency.trim().toUpperCase();
    const adapted = adaptQuoteToMarketCurrency(quote, currency, mepArsPerUsd);
    if (!adapted) {
      if (needsMep) out.unavailableFxKeys.add(cacheKey);
      return null;
    }
    if (needsMep) {
      adapted.fxStale = !mepExecutable;
      adapted.fxAsOf = mepAsOf;
    }
    return adapted;
  };

  for (const pos of argPositions) {
    if (arg) {
      const lookedUp = lookupArgentineSymbol(arg, pos.type, pos.ticker, pos.currency);
      if (lookedUp.status === 'hit') {
        const adapted = adapt(lookedUp.quote, pos.currency, pos.cacheKey);
        const stamped = adapted ? stamp(adapted) : null;
        if (stamped) {
          out.set(pos.cacheKey, stamped);
          continue;
        }
      }
      if (lookedUp.status === 'unconfirmed') {
        console.warn('[quotes] skip unconfirmed D/C listing', {
          ticker: pos.ticker,
          currency: pos.currency,
        });
        continue;
      }
    }
    addYahoo(yahooSymbolFor(pos.type, pos.ticker), pos.cacheKey);
  }

  const uniqueFci = dedupeByTicker(fciTickers);
  const fciBudgetMs = options?.fciBudgetMs ?? FCI_REFRESH_BUDGET_MS;
  const fciSkipReasons = new Map<string, FciSkipDetail>();
  const fciQuotes = await mapWithLimit(
    uniqueFci,
    FCI_REFRESH_CONCURRENCY,
    fciBudgetMs,
    async (fci) => {
      let missReason: string | null = null;
      try {
        const quote = await fetchFciQuote(fci.ticker, (reason) => {
          missReason = reason;
        });
        if (!quote) fciSkipReasons.set(fci.ticker, { reason: missReason ?? 'no_match' });
        return quote;
      } catch (error) {
        fciSkipReasons.set(fci.ticker, describeFciFetchError(error));
        return 'error' as const;
      }
    }
  );
  const fciQuoteByTicker = new Map<string, (typeof fciQuotes)[number]>();
  for (const [i, fci] of uniqueFci.entries()) {
    fciQuoteByTicker.set(fci.ticker, fciQuotes[i]);
  }

  const fciByKey = new Map<string, Array<{
    ticker: string;
    currency: string;
    storedPrice: number | null;
    stamped: QuoteResult | null;
  }>>();
  const fciTickerOk = new Set<string>();
  const fciTickerSkip = new Map<string, string>();
  for (const fci of fciTickers) {
    const q = fciQuoteByTicker.get(fci.ticker);
    // Resolve the currency of the actual write before choosing its anchor.
    const effectiveCurrency = fci.currency || (q && q !== 'error' ? q.currency : null);
    const storedPrice = fciPlausibilityAnchor({
      currentPrice: fci.currentPrice,
      purchasePrice: fci.purchasePrice,
      marketCurrency: effectiveCurrency,
      purchaseCurrency: fci.purchaseCurrency,
      mepArsPerUsd: anchorMepArsPerUsd,
    });
    let stamped: QuoteResult | null = null;
    let skipReason: string | null = null;
    const appNowMs = Date.now();
    if (isAnomalousFutureTimestamp(fci.currentPriceUpdatedAt, appNowMs)) {
      skipReason = 'future_stored';
      console.warn('[quotes] skip CAFCI failure', {
        ticker: fci.ticker,
        reason: 'future_stored',
        stored: fci.currentPriceUpdatedAt,
        candidate: q && q !== 'error' ? quoteSourceTimestamp(q) : null,
        appClock: new Date(appNowMs).toISOString(),
        ...(fci.id ? { id: fci.id } : {}),
        ...(q && q !== 'error' && q.source ? { source: q.source } : {}),
      });
    } else if (q === 'error' || !q || !(q.price > 0)) {
      const detail: FciSkipDetail = fciSkipReasons.get(fci.ticker)
        ?? (q === undefined
          ? { reason: 'budget_exhausted' }
          : q && q !== 'error'
            ? { reason: 'non_positive_price' }
            : { reason: 'unknown' });
      skipReason = detail.reason;
      const skipSource = (q && q !== 'error' ? q.source : undefined)
        ?? detail.source
        ?? (detail.stage === 'iol' ? 'iol' : undefined);
      console.warn('[quotes] skip CAFCI failure', {
        ticker: fci.ticker,
        ...detail,
        ...(fci.id ? { id: fci.id } : {}),
        ...(skipSource ? { source: skipSource } : {}),
      });
    } else if (q.currencySkip) {
      skipReason = q.currencySkip;
      console.warn('[quotes] skip FCI currency', {
        ticker: fci.ticker,
        id: fci.id,
        reason: q.currencySkip,
        source: q.source,
        cafci: q.currency,
        stored: fci.currency,
      });
    } else if (storedPrice == null && !options?.allowUnanchoredFciPreview) {
      skipReason = 'no_anchor';
      console.warn('[quotes] fci_implausible', {
        reason: 'no_anchor',
        ticker: fci.ticker,
        id: fci.id,
        source: q.source,
        candidate: q.price,
        anchor: null,
        currency: effectiveCurrency,
      });
    } else {
      const resolved = resolveFciQuoteCurrency({
        sourceCurrency: q.currency,
        storedCurrency: fci.currency,
        sourcePrice: q.price,
        storedPrice,
      });
      if (!resolved.currency) {
        skipReason = fci.currency === 'USD' && storedPrice != null ? 'fci_implausible' : resolved.reason;
        console.warn('[quotes] skip FCI currency', {
          ticker: fci.ticker,
          reason: skipReason,
          id: fci.id,
          source: q.source,
          cafci: q.currency,
          stored: fci.currency,
        });
      } else {
        const adapted = adapt(
          {
            price: q.price,
            changePct: q.changePct,
            currency: resolved.currency,
            timestamp: q.timestamp,
          },
          fci.currency || resolved.currency,
          fci.cacheKey,
        );
        if (!adapted) {
          skipReason = 'mep';
          console.warn('[quotes] skip FCI currency', {
            ticker: fci.ticker,
            id: fci.id,
            reason: 'mep',
            source: q.source,
            cafci: q.currency,
            stored: fci.currency,
          });
        } else if (storedPrice != null && !fciPricePlausible(adapted.price, storedPrice)) {
          const ratio = storedPrice > 0 ? adapted.price / storedPrice : Number.NaN;
          const updatedMs = fci.currentPriceUpdatedAt
            ? Date.parse(fci.currentPriceUpdatedAt)
            : Number.NaN;
          const daysSinceUpdate = Number.isFinite(updatedMs)
            ? (Date.now() - updatedMs) / 86_400_000
            : null;
          console.warn('[quotes] skip FCI price', {
            reason: 'fci_implausible',
            ticker: fci.ticker,
            id: fci.id,
            source: q.source,
            candidate: adapted.price,
            anchor: storedPrice,
            currency: adapted.currency,
          });
          skipReason = 'out_of_band';
          console.warn('[quotes] skip CAFCI failure', {
            reason: 'out_of_band',
            ticker: fci.ticker,
            id: fci.id,
            source: q.source,
            stage: q.source === 'iol' ? 'iol' : 'ficha',
            ratio,
            daysSinceUpdate,
          });
        } else {
          const jump = storedPrice == null ? null : evaluateFciDailyJump({
            candidate: adapted.price,
            storedPrice,
            storedTs: fci.currentPriceUpdatedAt,
            maxAbs: q.jumpMaxAbs ?? fciJumpMaxAbs(q.fundType),
          });
          if (jump && !jump.ok) {
            skipReason = 'daily_jump';
            console.warn('[quotes] skip CAFCI failure', {
              reason: 'daily_jump',
              ticker: fci.ticker,
              id: fci.id,
              source: q.source,
              stage: q.source === 'iol' ? 'iol' : 'ficha',
              candidate: adapted.price,
              anchor: storedPrice,
              ratio: jump.ratio,
              maxAbs: jump.maxAbs,
              fundType: q.fundType ?? null,
            });
          } else {
            const persist = !options?.allowUnanchoredFciPreview;
            const sourceTs = quoteSourceTimestamp(q);
            const freshness = evaluateFciNavFreshness(sourceTs);
            if (!freshness.ok) {
              if (persist || freshness.reason !== 'undated') {
                skipReason = freshness.reason;
                console.warn('[quotes] skip CAFCI failure', {
                  ticker: fci.ticker,
                  reason: freshness.reason,
                  source: q.source,
                  stage: q.source === 'iol' ? 'iol' : 'ficha',
                  ageBusinessDays: freshness.ageBusinessDays,
                  maxBusinessDays: FCI_NAV_MAX_BUSINESS_DAYS,
                  ...(fci.id ? { id: fci.id } : {}),
                });
              } else {
                stamped = {
                  price: adapted.price,
                  changePct: adapted.changePct,
                  currency: adapted.currency,
                  timestamp: null,
                  fxStale: adapted.fxStale,
                  fxAsOf: adapted.fxAsOf,
                  source: q.source,
                };
              }
            } else {
              const sourceMs = Date.parse(sourceTs as string);
              const storedMs = storedFciTimestampMs(fci.currentPriceUpdatedAt);
              if (Number.isFinite(storedMs) && sourceMs < storedMs) {
                skipReason = 'older_than_stored';
                console.warn('[quotes] skip CAFCI failure', {
                  ticker: fci.ticker,
                  reason: 'older_than_stored',
                  source: q.source,
                  stage: q.source === 'iol' ? 'iol' : 'ficha',
                  ...(fci.id ? { id: fci.id } : {}),
                });
              } else {
                stamped = {
                  price: adapted.price,
                  changePct: adapted.changePct,
                  currency: adapted.currency,
                  timestamp: sourceTs,
                  fxStale: adapted.fxStale,
                  fxAsOf: adapted.fxAsOf,
                  source: q.source,
                };
              }
            }
          }
        }
      }
    }
    if (stamped) fciTickerOk.add(fci.ticker);
    else fciTickerSkip.set(fci.ticker, skipReason ?? 'unknown');
    const rows = fciByKey.get(fci.cacheKey) ?? [];
    rows.push({
      ticker: fci.ticker,
      currency: fci.currency,
      storedPrice,
      stamped,
    });
    fciByKey.set(fci.cacheKey, rows);
  }
  if (uniqueFci.length > 0) {
    const reasons = uniqueFci.map((fci) => (
      fciTickerOk.has(fci.ticker) ? null : (fciTickerSkip.get(fci.ticker) ?? 'unknown')
    ));
    if (reasons.every((reason): reason is string => Boolean(reason) && reason === reasons[0])) {
      console.error('[quotes] fci_all_failed', { reason: reasons[0], count: uniqueFci.length });
    }
  }
  for (const [key, rows] of fciByKey) {
    // Callers without position IDs share a key: every position must pass its guard.
    if (rows.every((row) => row.stamped) && rows[0].stamped) {
      out.set(key, rows[0].stamped);
    }
  }

  const yahooSymbols = Array.from(yahooSymbolToCacheKeys.keys());
  if (yahooSymbols.length > 0) {
    const yMap = await fetchYahooStockQuotesMap(yahooSymbols);
    const missingForStooq: string[] = [];
    const cacheKeyCurrency = new Map<string, string>();
    for (const pos of argPositions) {
      cacheKeyCurrency.set(pos.cacheKey, pos.currency);
    }
    for (const inv of investments) {
      if (!inv.ticker) continue;
      if (inv.type === 'stock_us' || inv.type === 'etf') {
        cacheKeyCurrency.set(
          quoteCacheKey(inv.type, inv.ticker, desiredQuoteCurrency(inv)),
          desiredQuoteCurrency(inv)
        );
      }
    }

    for (const [ySym, cacheKeys] of yahooSymbolToCacheKeys.entries()) {
      const q = yMap.get(ySym) ?? [...yMap.entries()].find(([k]) => k.toUpperCase() === ySym.toUpperCase())?.[1];
      let anyApplied = false;
      if (q && q.price > 0) {
        for (const cacheKey of cacheKeys) {
          if (out.has(cacheKey)) continue;
          const source = yahooCurrencyForCacheKey(ySym, q.currency);
          const desired = cacheKeyCurrency.get(cacheKey) || source;
          const adapted = adapt({
            price: q.price,
            changePct: Number.isFinite(q.changePct) ? q.changePct : null,
            currency: source,
            timestamp: quoteSourceTimestamp(q),
          }, desired, cacheKey);
          const stamped = adapted ? stamp(adapted) : null;
          if (stamped) {
            out.set(cacheKey, stamped);
            anyApplied = true;
          }
        }
      }
      if (!anyApplied) missingForStooq.push(ySym);
    }

    for (const ySym of missingForStooq) {
      const cacheKeys = yahooSymbolToCacheKeys.get(ySym);
      if (!cacheKeys || ySym.endsWith('.BA')) continue;
      try {
        const stooq = await fetchStooqUsQuote(ySym);
        if (stooq && stooq.price > 0) {
          for (const cacheKey of cacheKeys) {
            if (out.has(cacheKey)) continue;
            const desired = cacheKeyCurrency.get(cacheKey) || stooq.currency;
            const adapted = adapt({
              price: stooq.price,
              changePct: Number.isFinite(stooq.changePct) ? stooq.changePct : null,
              currency: stooq.currency,
              timestamp: quoteSourceTimestamp(stooq),
            }, desired, cacheKey);
            const stamped = adapted ? stamp(adapted) : null;
            if (stamped) out.set(cacheKey, stamped);
          }
        }
      } catch {
        /* último precio guardado */
      }
    }
  }

  for (const sym of cryptoSymbols) {
    try {
      const q = await cotizacionesService.getCryptoQuote(sym);
      if (Number.isFinite(q.priceUSD) && q.priceUSD > 0) {
        const stamped = stamp({
          price: q.priceUSD,
          changePct: Number.isFinite(q.change24h) ? q.change24h : null,
          currency: 'USD',
          timestamp: quoteSourceTimestamp(q),
        });
        if (stamped) out.set(quoteCacheKey('crypto', sym, 'USD'), stamped);
      }
    } catch (error) {
      if (!(error instanceof FxUnavailableError)) throw error;
      /* último precio guardado */
    }
  }

  return out;
}
