import type { StockQuote } from '@/lib/market-data-types';

const STOOQ_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'text/csv,*/*',
} as const;

/** Nombres cortos cuando Yahoo no está disponible (CSV Stooq no trae nombre legible). */
const KNOWN_NAMES: Record<string, string> = {
  AAPL: 'Apple',
  NVDA: 'NVIDIA',
  MSFT: 'Microsoft',
  AMZN: 'Amazon',
  GOOGL: 'Alphabet',
};

function yahooUsTickerToStooqSymbol(yahooTicker: string): string | null {
  const t = yahooTicker.trim();
  if (t.startsWith('^') || t.endsWith('.BA')) return null;
  const root = t.split('.')[0].toLowerCase();
  if (!root) return null;
  return `${root}.us`;
}

/**
 * Cotización intradía vía Stooq (CSV público, sin API key).
 * Solo acciones de EE. UU.: no sustituir un índice por un ETF de otro universo.
 */
export async function fetchStooqUsQuote(yahooTicker: string): Promise<StockQuote | null> {
  const stooqSym = yahooUsTickerToStooqSymbol(yahooTicker);
  if (!stooqSym) return null;

  const url = `https://stooq.com/q/l/?s=${encodeURIComponent(stooqSym)}&f=sd2t2ohlcv&h&e=csv`;

  try {
    const res = await fetch(url, {
      headers: STOOQ_HEADERS,
      cache: 'no-store',
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return null;

    const text = await res.text();
    const lines = text.trim().split(/\r?\n/);
    if (lines.length < 2) return null;

    const parts = lines[1].split(',');
    if (parts.length < 8) return null;

    const open = Number(parts[3]);
    const close = Number(parts[6]);
    if (!Number.isFinite(open) || !Number.isFinite(close) || close <= 0) return null;

    const change = close - open;
    const changePct = open > 0 ? (change / open) * 100 : 0;

    const stooqRoot = stooqSym.replace(/\.us$/i, '').toUpperCase();

    return {
      ticker: yahooTicker.trim(),
      name: KNOWN_NAMES[stooqRoot] ?? stooqRoot,
      source: 'stooq',
      observedAt: new Date().toISOString(),
      changeBasis: 'open',
      price: close,
      change,
      changePct,
      currency: 'USD',
      instrumentType: 'EQUITY',
    };
  } catch {
    return null;
  }
}
