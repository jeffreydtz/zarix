import type { InvestmentType } from '@/types/database';
import {
  adaptQuoteToMarketCurrency,
  confirmedSourceCurrency,
  listingCandidates,
  resolveFciQuoteCurrency,
  resolveQuoteCurrency,
  type ConvertibleQuote,
} from '@/lib/market-data/quote-currency';
import { loadArgentineQuotes, type ArgentineQuoteIndex, type Data912Quote } from '@/lib/market-data/data912-client';
import { fetchYahooStockQuotesMap } from '@/lib/yahoo-finance-quotes';
import type { StockQuote } from '@/lib/market-data-types';
import { fetchStooqUsQuote } from '@/lib/stooq-us-quote';
import { cotizacionesService } from '@/lib/services/cotizaciones';
import { fetchFciQuote } from '@/lib/market-data/cafci-client';
import {
  isArgentineListedType,
  yahooSymbolFor,
} from '@/lib/investments/type-meta';

export interface QuoteResult {
  price: number;
  changePct: number | null;
  currency: string;
  timestamp: string | null;
}

export interface QuoteRefreshPosition {
  type: InvestmentType;
  ticker: string | null;
  market_currency: string | null;
  purchase_currency: string | null;
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
  return quoteCacheKey(inv.type, inv.ticker, currency);
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
  symbol: string,
  positionTicker: string
): ConvertibleQuote | null | 'unconfirmed' {
  if (!map) return null;
  const hit = map.get(symbol.toUpperCase());
  if (!hit || hit.price <= 0) return null;
  const tagged = typeof hit.currency === 'string' ? hit.currency.trim().toUpperCase() : '';
  const currency = resolveQuoteCurrency({
    matchedSymbol: hit.symbol || symbol,
    listed: map,
    sourceCurrency: tagged,
    positionTicker,
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
      const hit = quoteFromMap(map, symbol, ticker);
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

function mepRate(quotes: { mep?: { sell: number; buy: number } } | null): number | null {
  const sell = quotes?.mep?.sell;
  const buy = quotes?.mep?.buy;
  if (Number.isFinite(sell) && (sell as number) > 0) return sell as number;
  if (Number.isFinite(buy) && (buy as number) > 0) return buy as number;
  return null;
}

/**
 * Precio de mercado en la moneda de cotización de cada posición.
 * data912 (ARG/CEDEAR/bono/ON) → Yahoo `.BA` / US → Stooq → CAFCI (FCI) → CoinGecko.
 */
export async function refreshQuotesForInvestments(
  investments: QuoteRefreshPosition[],
  options?: { mepArsPerUsd?: number | null; fciBudgetMs?: number }
): Promise<Map<string, QuoteResult>> {
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
      };
    }
    return {
      price: quote.price,
      changePct: quote.changePct,
      currency: quote.currency,
      timestamp: quoteTimestampOrFetchedAt(quote, fetchedAt),
    };
  };
  const out = new Map<string, QuoteResult>();
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
  const fciTickers: Array<{ ticker: string; cacheKey: string; currency: string }> = [];
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
      fciTickers.push({ ticker, cacheKey, currency });
      argPositions.push({ type: inv.type, ticker, cacheKey, currency });
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
  if (argPositions.some((p) => p.type !== 'fci')) {
    try {
      arg = await loadArgentineQuotes();
    } catch {
      arg = null;
    }
  }

  const dolar = await cotizacionesService.getDolarQuotes().catch(() => null);
  const mepArsPerUsd = options?.mepArsPerUsd ?? mepRate(dolar);

  const adapt = (quote: ConvertibleQuote, currency: string): QuoteResult | null => {
    if (!currency) return quote;
    const adapted = adaptQuoteToMarketCurrency(quote, currency, mepArsPerUsd);
    if (!adapted) return null;
    return adapted;
  };

  for (const pos of argPositions) {
    if (pos.type === 'fci') continue;
    if (arg) {
      const lookedUp = lookupArgentineSymbol(arg, pos.type, pos.ticker, pos.currency);
      if (lookedUp.status === 'hit') {
        const adapted = adapt(lookedUp.quote, pos.currency);
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

  const uniqueFci = dedupeByCacheKey(fciTickers);
  const fciBudgetMs = options?.fciBudgetMs ?? FCI_REFRESH_BUDGET_MS;
  const fciStarted = Date.now();
  const fciDeadline = fciStarted + fciBudgetMs;
  const fciYahooSymbols = new Set<string>();
  const fciQuotes = await mapWithLimit(
    uniqueFci,
    FCI_REFRESH_CONCURRENCY,
    fciBudgetMs,
    async (fci) => {
      try {
        return await fetchFciQuote(fci.ticker);
      } catch {
        return 'error' as const;
      }
    }
  );
  for (const [i, fci] of uniqueFci.entries()) {
    const q = fciQuotes[i];
    if (q === 'error') {
      console.warn('[quotes] skip CAFCI failure', { ticker: fci.ticker });
      continue;
    }
    if (q && q.price > 0) {
      const resolved = resolveFciQuoteCurrency({
        sourceCurrency: q.currency,
        storedCurrency: fci.currency,
      });
      if (!resolved.currency) {
        console.warn('[quotes] skip FCI currency', {
          ticker: fci.ticker,
          reason: resolved.reason,
          cafci: q.currency,
          stored: fci.currency,
        });
        continue;
      }
      const adapted = adapt(
        {
          price: q.price,
          changePct: q.changePct,
          currency: resolved.currency,
          timestamp: q.timestamp,
        },
        fci.currency || resolved.currency,
      );
      const stamped = adapted ? stamp(adapted) : null;
      if (stamped) {
        out.set(fci.cacheKey, stamped);
        continue;
      }
    }
    if (Date.now() >= fciDeadline) continue;
    const yahooSymbol = yahooSymbolFor('fci', fci.ticker);
    fciYahooSymbols.add(yahooSymbol);
    addYahoo(yahooSymbol, fci.cacheKey);
  }

  const yahooSymbols = Array.from(yahooSymbolToCacheKeys.keys());
  if (yahooSymbols.length > 0) {
    const otherYahoo = yahooSymbols.filter((symbol) => !fciYahooSymbols.has(symbol));
    const fciYahoo = yahooSymbols.filter((symbol) => fciYahooSymbols.has(symbol));
    const yMap = new Map<string, StockQuote>();
    if (otherYahoo.length > 0) {
      const otherMap = await fetchYahooStockQuotesMap(otherYahoo);
      for (const [symbol, quote] of otherMap) yMap.set(symbol, quote);
    }
    if (fciYahoo.length > 0 && Date.now() < fciDeadline) {
      const fciMap = await fetchYahooStockQuotesMap(fciYahoo, { deadlineAt: fciDeadline });
      for (const [symbol, quote] of fciMap) yMap.set(symbol, quote);
    }
    const missingForStooq: string[] = [];
    const cacheKeyCurrency = new Map<string, string>();
    for (const pos of [...argPositions, ...fciTickers]) {
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
        const confirmed = confirmedSourceCurrency(q.currency);
        if (!confirmed) {
          console.warn('[quotes] skip Yahoo unconfirmed currency', {
            symbol: ySym,
            currency: q.currency,
          });
        } else {
          for (const cacheKey of cacheKeys) {
            if (out.has(cacheKey)) continue;
            const desired = cacheKeyCurrency.get(cacheKey) || confirmed;
            const adapted = adapt({
              price: q.price,
              changePct: Number.isFinite(q.changePct) ? q.changePct : null,
              currency: confirmed,
              timestamp: quoteSourceTimestamp(q),
            }, desired);
            const stamped = adapted ? stamp(adapted) : null;
            if (stamped) {
              out.set(cacheKey, stamped);
              anyApplied = true;
            }
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
            const confirmed = confirmedSourceCurrency(stooq.currency);
            if (!confirmed) continue;
            const desired = cacheKeyCurrency.get(cacheKey) || confirmed;
            const adapted = adapt({
              price: stooq.price,
              changePct: Number.isFinite(stooq.changePct) ? stooq.changePct : null,
              currency: confirmed,
              timestamp: quoteSourceTimestamp(stooq),
            }, desired);
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
    } catch {
      /* último precio guardado */
    }
  }

  return out;
}
