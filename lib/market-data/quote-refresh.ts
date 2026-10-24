import type { InvestmentType } from '@/types/database';
import {
  adaptQuoteToMarketCurrency,
  inferListedCurrency,
  listingCandidates,
  type ConvertibleQuote,
} from '@/lib/market-data/quote-currency';
import { loadArgentineQuotes, type ArgentineQuoteIndex, type Data912Quote } from '@/lib/market-data/data912-client';
import { fetchYahooStockQuotesMap } from '@/lib/yahoo-finance-quotes';
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

function cacheKeyFor(type: InvestmentType, ticker: string): string {
  return `${type}:${ticker.trim().toUpperCase()}`;
}

function desiredCurrency(inv: QuoteRefreshPosition): string {
  const stored = (inv.market_currency || '').trim().toUpperCase();
  if (stored) return stored;
  // Sin override: la rueda del ticker manda. Un bono hard-dollar cotizado en
  // ARS no se reconvierte a USD solo porque la compra fue en dólares.
  return '';
}

function argKind(type: InvestmentType): 'stock_arg' | 'cedear' | 'bond' | 'on' | 'fci' | 'other' {
  if (type === 'stock_arg' || type === 'cedear' || type === 'bond' || type === 'on' || type === 'fci') {
    return type;
  }
  return 'other';
}

function quoteFromMap(
  map: Map<string, Data912Quote> | undefined,
  symbol: string
): ConvertibleQuote | null {
  if (!map) return null;
  const hit = map.get(symbol.toUpperCase());
  if (!hit || hit.price <= 0) return null;
  const timestamp = (hit as { timestamp?: unknown }).timestamp;
  return {
    price: hit.price,
    changePct: hit.changePct,
    currency: inferListedCurrency(hit.symbol || symbol, map),
    timestamp: typeof timestamp === 'string' ? timestamp : null,
  };
}

function lookupArgentineSymbol(
  arg: ArgentineQuoteIndex,
  type: InvestmentType,
  ticker: string,
  marketCurrency: string
): ConvertibleQuote | null {
  const maps =
    type === 'stock_arg' ? [arg.byStock]
      : type === 'cedear' ? [arg.byCedear]
        : type === 'bond' ? [arg.byBond, arg.byCorp]
          : type === 'on' ? [arg.byCorp, arg.byBond]
            : [];
  const preferred = marketCurrency || 'ARS';
  const { symbols } = listingCandidates(ticker, preferred, argKind(type));
  for (const map of maps) {
    for (const symbol of symbols) {
      const hit = quoteFromMap(map, symbol);
      if (hit) return hit;
    }
  }
  return null;
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
  options?: { mepArsPerUsd?: number | null }
): Promise<Map<string, QuoteResult>> {
  const out = new Map<string, QuoteResult>();
  const yahooSymbolToCacheKey = new Map<string, string>();
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
    const cacheKey = cacheKeyFor(inv.type, ticker);
    const currency = desiredCurrency(inv);
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
      yahooSymbolToCacheKey.set(yahooSymbolFor(inv.type, ticker), cacheKey);
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
      const hit = lookupArgentineSymbol(arg, pos.type, pos.ticker, pos.currency);
      if (hit) {
        const adapted = adapt(hit, pos.currency);
        if (adapted) {
          out.set(pos.cacheKey, adapted);
          continue;
        }
      }
    }
    yahooSymbolToCacheKey.set(yahooSymbolFor(pos.type, pos.ticker), pos.cacheKey);
  }

  for (const fci of fciTickers) {
    try {
      const q = await fetchFciQuote(fci.ticker);
      if (q && q.price > 0) {
        const adapted = adapt(
          { price: q.price, changePct: q.changePct, currency: q.currency, timestamp: q.timestamp },
          fci.currency
        );
        if (adapted) {
          out.set(fci.cacheKey, adapted);
          continue;
        }
      }
    } catch {
      /* Yahoo .BA */
    }
    yahooSymbolToCacheKey.set(yahooSymbolFor('fci', fci.ticker), fci.cacheKey);
  }

  const yahooSymbols = Array.from(yahooSymbolToCacheKey.keys());
  if (yahooSymbols.length > 0) {
    const yMap = await fetchYahooStockQuotesMap(yahooSymbols);
    const missingForStooq: string[] = [];
    const cacheKeyCurrency = new Map<string, string>();
    for (const pos of [...argPositions, ...fciTickers.map((f) => ({
      type: 'fci' as InvestmentType,
      ticker: f.ticker,
      cacheKey: f.cacheKey,
      currency: f.currency,
    }))]) {
      cacheKeyCurrency.set(pos.cacheKey, pos.currency);
    }
    for (const inv of investments) {
      if (!inv.ticker) continue;
      if (inv.type === 'stock_us' || inv.type === 'etf') {
        cacheKeyCurrency.set(cacheKeyFor(inv.type, inv.ticker), desiredCurrency(inv));
      }
    }

    for (const [ySym, cacheKey] of yahooSymbolToCacheKey.entries()) {
      if (out.has(cacheKey)) continue;
      const q = yMap.get(ySym) ?? [...yMap.entries()].find(([k]) => k.toUpperCase() === ySym.toUpperCase())?.[1];
      if (q && q.price > 0) {
        const desired = cacheKeyCurrency.get(cacheKey) || q.currency;
        const adapted = adapt({
          price: q.price,
          changePct: Number.isFinite(q.changePct) ? q.changePct : null,
          currency: q.currency,
          timestamp: quoteSourceTimestamp(q),
        }, desired);
        if (adapted) {
          out.set(cacheKey, adapted);
          continue;
        }
      }
      missingForStooq.push(ySym);
    }

    for (const ySym of missingForStooq) {
      const cacheKey = yahooSymbolToCacheKey.get(ySym);
      if (!cacheKey || out.has(cacheKey)) continue;
      if (ySym.endsWith('.BA')) continue;
      try {
        const stooq = await fetchStooqUsQuote(ySym);
        if (stooq && stooq.price > 0) {
          const desired = cacheKeyCurrency.get(cacheKey) || stooq.currency;
          const adapted = adapt({
            price: stooq.price,
            changePct: Number.isFinite(stooq.changePct) ? stooq.changePct : null,
            currency: stooq.currency,
            timestamp: quoteSourceTimestamp(stooq),
          }, desired);
          if (adapted) out.set(cacheKey, adapted);
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
        out.set(`crypto:${sym}`, {
          price: q.priceUSD,
          changePct: Number.isFinite(q.change24h) ? q.change24h : null,
          currency: 'USD',
          timestamp: quoteSourceTimestamp(q),
        });
      }
    } catch {
      /* último precio guardado */
    }
  }

  return out;
}
