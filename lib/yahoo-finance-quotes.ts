import YahooFinance from 'yahoo-finance2';
import type { StockQuote } from '@/lib/market-data-types';

const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

const RETRY_MS = [0, 850, 2000] as const;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function resolveCurrency(symbol: string, metaCurrency: string | undefined): string {
  if (metaCurrency && metaCurrency.length > 0) return metaCurrency;
  if (symbol === '^MERV') return 'PTS';
  if (symbol.endsWith('.BA')) return 'ARS';
  return 'USD';
}

function mapYahooQuoteRow(symbol: string, q: Record<string, unknown>): StockQuote | null {
  const price = Number(q.regularMarketPrice);
  if (!Number.isFinite(price) || price <= 0) return null;

  const prevRaw = q.regularMarketPreviousClose;
  const prev = typeof prevRaw === 'number' && Number.isFinite(prevRaw) ? prevRaw : 0;

  const change =
    typeof q.regularMarketChange === 'number' && Number.isFinite(q.regularMarketChange)
      ? q.regularMarketChange
      : prev > 0
        ? price - prev
        : 0;

  const changePct =
    typeof q.regularMarketChangePercent === 'number' && Number.isFinite(q.regularMarketChangePercent)
      ? q.regularMarketChangePercent
      : prev > 0
        ? ((price - prev) / prev) * 100
        : 0;

  const qt = String(q.quoteType || '');
  const instrumentType: StockQuote['instrumentType'] =
    qt === 'INDEX' || symbol.startsWith('^') ? 'INDEX' : 'EQUITY';

  const name =
    (typeof q.shortName === 'string' && q.shortName) ||
    (typeof q.longName === 'string' && q.longName) ||
    (typeof q.symbol === 'string' && q.symbol) ||
    symbol;

  return {
    ticker: symbol,
    name,
    price,
    change,
    changePct,
    currency: resolveCurrency(symbol, typeof q.currency === 'string' ? q.currency : undefined),
    instrumentType,
  };
}

function mergeQuoteBatchIntoMap(map: Map<string, StockQuote>, rows: unknown): void {
  const list = Array.isArray(rows) ? rows : rows ? [rows] : [];
  for (const raw of list) {
    if (!raw || typeof raw !== 'object') continue;
    const q = raw as Record<string, unknown>;
    const sym = typeof q.symbol === 'string' ? q.symbol : '';
    if (!sym) continue;
    const sq = mapYahooQuoteRow(sym, q);
    if (sq) map.set(sym, sq);
  }
}

function mapHasTicker(map: Map<string, StockQuote>, requested: string): boolean {
  if (map.has(requested)) return true;
  const up = requested.toUpperCase();
  for (const k of map.keys()) {
    if (k.toUpperCase() === up) return true;
  }
  return false;
}

function getQuoteForRequested(map: Map<string, StockQuote>, requested: string): StockQuote | undefined {
  if (map.has(requested)) return map.get(requested);
  const up = requested.toUpperCase();
  for (const [k, v] of map) {
    if (k.toUpperCase() === up) return v;
  }
  return undefined;
}

const MODULE_OPTS = { validateResult: false as const };

/**
 * Cotizaciones Yahoo vía [yahoo-finance2](https://www.npmjs.com/package/yahoo-finance2) (solo servidor).
 * Lote + reintentos; símbolos faltantes se consultan uno a uno.
 */
export async function fetchYahooStockQuotesMap(tickers: string[]): Promise<Map<string, StockQuote>> {
  const map = new Map<string, StockQuote>();
  if (tickers.length === 0) return map;

  for (let round = 0; round < RETRY_MS.length; round++) {
    if (RETRY_MS[round] > 0) await sleep(RETRY_MS[round]);
    try {
      const rows = await yahooFinance.quote(tickers, undefined, MODULE_OPTS);
      mergeQuoteBatchIntoMap(map, rows);
      if (map.size > 0) break;
    } catch {
      /* siguiente ronda */
    }
  }

  const missing = tickers.filter((t) => !mapHasTicker(map, t));
  for (const t of missing) {
    await sleep(150);
    for (let round = 0; round < RETRY_MS.length; round++) {
      if (RETRY_MS[round] > 0) await sleep(RETRY_MS[round]);
      try {
        const rows = await yahooFinance.quote(t, undefined, MODULE_OPTS);
        mergeQuoteBatchIntoMap(map, rows);
        break;
      } catch {
        /* siguiente ronda */
      }
    }
  }

  return map;
}

/** Alinea al orden de `tickers` y fuerza `ticker` al símbolo pedido (display). */
export function orderedStockQuotesFromMap(
  tickers: string[],
  map: Map<string, StockQuote>
): StockQuote[] {
  const out: StockQuote[] = [];
  for (const t of tickers) {
    const q = getQuoteForRequested(map, t);
    if (!q) continue;
    out.push(q.ticker === t ? q : { ...q, ticker: t });
  }
  return out;
}
