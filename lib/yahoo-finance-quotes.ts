import YahooFinance from 'yahoo-finance2';
import type { StockQuote } from '@/lib/market-data-types';
import { mapConcurrent, singleFlight, quoteDate } from '@/lib/market-data/requests';

const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'], versionCheck: false });

/** Campos explícitos: `logoUrl` no viene si no se pide en la API de Yahoo. */
const QUOTE_FIELDS = [
  'symbol',
  'regularMarketPrice',
  'regularMarketTime',
  'regularMarketChange',
  'regularMarketChangePercent',
  'regularMarketPreviousClose',
  'currency',
  'shortName',
  'longName',
  'quoteType',
  'logoUrl',
  'companyLogoUrl',
] as const;

const QUOTE_OPTS = { fields: [...QUOTE_FIELDS] };

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

  const rawLogo =
    (typeof q.logoUrl === 'string' && q.logoUrl) ||
    (typeof q.companyLogoUrl === 'string' && q.companyLogoUrl) ||
    '';
  const logoUrl =
    rawLogo.startsWith('https://') || rawLogo.startsWith('http://') ? rawLogo : undefined;

  return {
    ticker: symbol,
    source: 'yahoo',
    observedAt: new Date().toISOString(),
    quotedAt: q.regularMarketTime instanceof Date ? q.regularMarketTime.toISOString() : quoteDate(q.regularMarketTime).toISOString(),
    name,
    price,
    change,
    changePct,
    currency: resolveCurrency(symbol, typeof q.currency === 'string' ? q.currency : undefined),
    instrumentType,
    ...(logoUrl ? { logoUrl } : {}),
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

/** Un lote y, solo si hubo datos parciales, un intento por faltante (máximo 3 a la vez).
 * Todo Yahoo comparte un deadline de 7s; una caída no dispara 21 reintentos por panel.
 */
export async function fetchYahooStockQuotesMap(tickers: string[]): Promise<Map<string, StockQuote>> {
  if (!tickers.length) return new Map();
  return singleFlight(`yahoo:${tickers.slice().sort().join(',')}`, async () => {
    const map = new Map<string, StockQuote>();
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const deadline = new Promise<void>((resolve) => {
      timer = setTimeout(() => { controller.abort(); resolve(); }, 7000);
    });
    const moduleOptions = { validateResult: false as const, fetchOptions: { signal: controller.signal } };
    const work = async () => {
      try {
        const rows = await yahooFinance.quote(tickers, QUOTE_OPTS, moduleOptions);
        if (!controller.signal.aborted) mergeQuoteBatchIntoMap(map, rows);
      } catch { return; }
      // Si todo el lote falló, usar el proveedor alternativo en vez de insistir.
      if (!map.size || controller.signal.aborted) return;
      await mapConcurrent(tickers.filter((t) => !mapHasTicker(map, t)), 3, async (ticker) => {
        if (controller.signal.aborted) return;
        try {
          const rows = await yahooFinance.quote(ticker, QUOTE_OPTS, moduleOptions);
          if (!controller.signal.aborted) mergeQuoteBatchIntoMap(map, rows);
        } catch { /* queda disponible el fallback */ }
      });
    };
    try { await Promise.race([work(), deadline]); }
    finally { clearTimeout(timer!); controller.abort(); }
    return map;
  });
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
