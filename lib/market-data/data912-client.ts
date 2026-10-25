/**
 * Cliente de data912.com — mercado argentino (acciones, CEDEARs, bonos, ONs).
 * Sin API key. data912 etiqueta todo como ARS: la moneda real se infiere
 * del símbolo (rueda D/C) al resolver la cotización.
 */

import { inferListedCurrency } from '@/lib/market-data/quote-currency';

const DATA912_BASE = 'https://data912.com';
const FETCH_TIMEOUT_MS = 6000;
const MEM_CACHE_MS = 5 * 60 * 1000;

export interface Data912Quote {
  symbol: string;
  price: number;
  changePct: number | null;
  /** Tag del proveedor; no confiable. Usar inferListedCurrency al resolver. */
  currency: 'ARS' | 'USD';
  source: 'arg_stocks' | 'arg_cedears' | 'arg_bonds' | 'arg_corp';
  /** UTC time of the last live successful fetch that produced this row. */
  timestamp?: string | null;
  /** True when this row was served from cache after a failed live GET. */
  stale?: boolean;
}

interface MemCacheEntry<T> {
  ts: number;
  fetchedAt: string;
  data: T;
}

const memCache = new Map<string, MemCacheEntry<Data912Quote[]>>();

export function resetData912CacheForTest(): void {
  memCache.clear();
}

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
  pct_change?: unknown;
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
  source: Data912Quote['source']
): Data912Quote | null {
  if (!row || typeof row !== 'object') return null;
  const r = row as Data912Row;
  const symbol = pickString(r.symbol, r.ticker);
  if (!symbol) return null;
  const price = pickNumber(r.c, r.px, r.price, r.last, r.close);
  if (price === null || price <= 0) return null;
  const changePct = pickNumber(
    r.pct_change, r.pct, r.variation, r.var, r.change_pct, r.changePct, r.variacion
  );
  return {
    symbol: symbol.toUpperCase(),
    price,
    changePct,
    currency: 'ARS',
    source,
  };
}

function asStale(quotes: Data912Quote[], fetchedAt: string): Data912Quote[] {
  return quotes.map((q) => ({
    ...q,
    stale: true,
    timestamp: q.timestamp ?? fetchedAt,
  }));
}

async function fetchEndpoint(
  path: string,
  source: Data912Quote['source']
): Promise<Data912Quote[]> {
  const cached = memCache.get(path);
  if (cached && Date.now() - cached.ts < MEM_CACHE_MS) {
    return cached.data;
  }

  try {
    const res = await fetch(`${DATA912_BASE}${path}`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      cache: 'no-store',
    });
    if (!res.ok) {
      if (cached) {
        const stale = asStale(cached.data, cached.fetchedAt);
        memCache.set(path, { ts: Date.now(), fetchedAt: cached.fetchedAt, data: stale });
        return stale;
      }
      memCache.set(path, { ts: Date.now(), fetchedAt: new Date().toISOString(), data: [] });
      return [];
    }
    const json = await res.json();
    const rows = Array.isArray(json) ? json : Array.isArray(json?.data) ? json.data : [];
    const fetchedAt = new Date().toISOString();
    const quotes: Data912Quote[] = [];
    for (const raw of rows) {
      const q = normalizeRow(raw, source);
      if (q) quotes.push({ ...q, timestamp: fetchedAt, stale: false });
    }
    memCache.set(path, { ts: Date.now(), fetchedAt, data: quotes });
    return quotes;
  } catch {
    return cached ? asStale(cached.data, cached.fetchedAt) : [];
  }
}

export async function fetchArgStocks(): Promise<Data912Quote[]> {
  return fetchEndpoint('/live/arg_stocks', 'arg_stocks');
}

export async function fetchArgCedears(): Promise<Data912Quote[]> {
  return fetchEndpoint('/live/arg_cedears', 'arg_cedears');
}

export async function fetchArgBonds(): Promise<Data912Quote[]> {
  return fetchEndpoint('/live/arg_bonds', 'arg_bonds');
}

/** Obligaciones negociables / renta fija corporativa (no cubiertas por arg_bonds). */
export async function fetchArgCorp(): Promise<Data912Quote[]> {
  return fetchEndpoint('/live/arg_corp', 'arg_corp');
}

export interface ArgentineQuoteIndex {
  byStock: Map<string, Data912Quote>;
  byCedear: Map<string, Data912Quote>;
  byBond: Map<string, Data912Quote>;
  byCorp: Map<string, Data912Quote>;
}

function indexQuotes(rows: Data912Quote[]): Map<string, Data912Quote> {
  const m = new Map<string, Data912Quote>();
  for (const r of rows) m.set(r.symbol.toUpperCase(), r);
  return m;
}

export async function loadArgentineQuotes(): Promise<ArgentineQuoteIndex> {
  const [stocks, cedears, bonds, corp] = await Promise.all([
    fetchArgStocks(),
    fetchArgCedears(),
    fetchArgBonds(),
    fetchArgCorp(),
  ]);

  return {
    byStock: indexQuotes(stocks),
    byCedear: indexQuotes(cedears),
    byBond: indexQuotes(bonds),
    byCorp: indexQuotes(corp),
  };
}

export function quoteFromIndex(
  index: Map<string, Data912Quote>,
  symbol: string
): {
  price: number;
  changePct: number | null;
  currency: 'ARS' | 'USD';
  timestamp: string | null;
  stale?: boolean;
} | null {
  const hit = index.get(symbol.toUpperCase());
  if (!hit || hit.price <= 0) return null;
  return {
    price: hit.price,
    changePct: hit.changePct,
    currency: inferListedCurrency(hit.symbol, index),
    timestamp: hit.timestamp ?? null,
    stale: hit.stale,
  };
}
