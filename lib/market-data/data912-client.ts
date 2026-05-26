/**
 * Cliente de data912.com — datos del mercado argentino (acciones, CEDEARs, bonos).
 * Sin API key, cacheado ~2h del lado del proveedor. Reusable para múltiples tickers.
 */

const DATA912_BASE = 'https://data912.com';
const FETCH_TIMEOUT_MS = 6000;
const MEM_CACHE_MS = 5 * 60 * 1000;

export interface Data912Quote {
  symbol: string;
  price: number;
  changePct: number | null;
  currency: 'ARS' | 'USD';
  source: 'arg_stocks' | 'arg_cedears' | 'arg_bonds';
}

interface MemCacheEntry<T> {
  ts: number;
  data: T;
}

const memCache = new Map<string, MemCacheEntry<Data912Quote[]>>();

interface Data912Row {
  symbol?: unknown;
  ticker?: unknown;
  c?: unknown;
  px?: unknown;
  price?: unknown;
  last?: unknown;
  close?: unknown;
  pct?: unknown;
  variation?: unknown;
  var?: unknown;
  change_pct?: unknown;
  changePct?: unknown;
  variacion?: unknown;
}

function pickNumber(...candidates: unknown[]): number | null {
  for (const c of candidates) {
    if (c === null || c === undefined || c === '') continue;
    const n = Number(c);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function pickString(...candidates: unknown[]): string | null {
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim()) return c.trim();
  }
  return null;
}

function normalizeRow(
  row: unknown,
  source: Data912Quote['source'],
  currency: Data912Quote['currency']
): Data912Quote | null {
  if (!row || typeof row !== 'object') return null;
  const r = row as Data912Row;
  const symbol = pickString(r.symbol, r.ticker);
  if (!symbol) return null;
  const price = pickNumber(r.c, r.px, r.price, r.last, r.close);
  if (price === null || price <= 0) return null;
  const changePct = pickNumber(r.pct, r.variation, r.var, r.change_pct, r.changePct, r.variacion);
  return {
    symbol: symbol.toUpperCase(),
    price,
    changePct,
    currency,
    source,
  };
}

async function fetchEndpoint(
  path: string,
  source: Data912Quote['source'],
  currency: Data912Quote['currency']
): Promise<Data912Quote[]> {
  const cached = memCache.get(path);
  if (cached && Date.now() - cached.ts < MEM_CACHE_MS) {
    return cached.data;
  }

  try {
    const res = await fetch(`${DATA912_BASE}${path}`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      next: { revalidate: 300 },
    });
    if (!res.ok) {
      memCache.set(path, { ts: Date.now(), data: cached?.data ?? [] });
      return cached?.data ?? [];
    }
    const json = await res.json();
    const rows = Array.isArray(json) ? json : Array.isArray(json?.data) ? json.data : [];
    const quotes: Data912Quote[] = [];
    for (const raw of rows) {
      const q = normalizeRow(raw, source, currency);
      if (q) quotes.push(q);
    }
    memCache.set(path, { ts: Date.now(), data: quotes });
    return quotes;
  } catch {
    return cached?.data ?? [];
  }
}

export async function fetchArgStocks(): Promise<Data912Quote[]> {
  return fetchEndpoint('/live/arg_stocks', 'arg_stocks', 'ARS');
}

export async function fetchArgCedears(): Promise<Data912Quote[]> {
  return fetchEndpoint('/live/arg_cedears', 'arg_cedears', 'ARS');
}

export async function fetchArgBonds(): Promise<Data912Quote[]> {
  return fetchEndpoint('/live/arg_bonds', 'arg_bonds', 'ARS');
}

export interface ArgentineQuoteIndex {
  byStock: Map<string, Data912Quote>;
  byCedear: Map<string, Data912Quote>;
  byBond: Map<string, Data912Quote>;
}

/**
 * Una sola llamada (paralela) trae todos los universos arg/cedear/bonos y los indexa por símbolo.
 * Cache de proceso 5 min compartido entre rutas del mismo runtime.
 */
export async function loadArgentineQuotes(): Promise<ArgentineQuoteIndex> {
  const [stocks, cedears, bonds] = await Promise.all([
    fetchArgStocks(),
    fetchArgCedears(),
    fetchArgBonds(),
  ]);

  const index = (rows: Data912Quote[]) => {
    const m = new Map<string, Data912Quote>();
    for (const r of rows) m.set(r.symbol.toUpperCase(), r);
    return m;
  };

  return {
    byStock: index(stocks),
    byCedear: index(cedears),
    byBond: index(bonds),
  };
}
