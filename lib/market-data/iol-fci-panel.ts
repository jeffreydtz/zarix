/**
 * Public InvertirOnline FCI panel. Used when CAFCI cannot resolve a ticker
 * (missing Bloomberg code, catalog HTTP error). Rounded to 2 decimals; not
 * a substitute for CAFCI's unit cuotaparte when the official ficha works.
 *
 * The live panel has no NAV date, so quotes are not a persistence source.
 */

import { parseArgentineNumber } from '@/lib/market-data/argentine-number';
import {
  FETCH_REDIRECT,
  readResponseTextCapped,
  ResponseTooLargeError,
} from '@/lib/market-data/bounded-fetch';

export { parseArgentineNumber } from '@/lib/market-data/argentine-number';

const IOL_FONDOS_URL = 'https://iol.invertironline.com/mercado/cotizaciones/argentina/fondos';
const IOL_ALLOWED_HOST = 'iol.invertironline.com';
const FETCH_TIMEOUT_MS = 10_000;
const PANEL_TTL_MS = 60 * 60 * 1000;
const IOL_MAX_BYTES = 2_000_000;

export const IOL_FCI_HEADERS = {
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'es-AR,es;q=0.9,en;q=0.8',
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Referer: 'https://iol.invertironline.com/mercado/cotizaciones/argentina/fondos',
} as const;

export class IolFciHttpError extends Error {
  readonly status: number;
  readonly stage = 'iol' as const;
  readonly server: string | undefined;

  constructor(status: number, server?: string | null) {
    super(`IOL panel ${status}`);
    this.name = 'IolFciHttpError';
    this.status = status;
    this.server = capDiag(server);
  }
}

export class IolFciFetchError extends Error {
  readonly stage = 'iol' as const;

  constructor(cause: unknown) {
    const name = cause instanceof Error ? cause.name : typeof cause;
    const msg = cause instanceof Error ? cause.message : String(cause);
    super(`IOL panel ${name}: ${msg}`.slice(0, 200));
    this.name = 'IolFciFetchError';
  }
}

const DIAG_MAX = 60;

function capDiag(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  const clean = value.replace(/[^\x20-\x7e]/g, '').trim();
  return clean ? clean.slice(0, DIAG_MAX) : undefined;
}

export interface IolFciQuote {
  ticker: string;
  price: number;
  currency: 'ARS' | 'USD' | null;
  changePct: number | null;
  /** Live panel does not publish a NAV date; always null. */
  timestamp: null;
}

const IOL_TICKER = /^[A-Z0-9]+$/;

/** Trim + uppercase only. Internal whitespace is a different symbol, not a key. */
export function normalizeIolTicker(raw: string): string | null {
  const ticker = raw.trim().toUpperCase();
  if (!ticker || /\s/.test(ticker) || !IOL_TICKER.test(ticker)) return null;
  return ticker;
}

function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&#243;|&oacute;/gi, 'ó')
    .replace(/&#225;|&aacute;/gi, 'á')
    .replace(/&#233;|&eacute;/gi, 'é')
    .replace(/&#237;|&iacute;/gi, 'í')
    .replace(/&#250;|&uacute;/gi, 'ú')
    .replace(/&#241;|&ntilde;/gi, 'ñ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&quot;/g, '"');
}

function stripTags(value: string): string {
  return decodeEntities(value.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')).trim();
}

function quotesEqual(a: IolFciQuote, b: IolFciQuote): boolean {
  return a.price === b.price && a.currency === b.currency && a.changePct === b.changePct;
}

function parseSignedPercent(text: string): number | null {
  const match = text.match(/([+-]?)\s*([\d.]+(?:,\d+)?)\s*%/);
  if (!match) return null;
  const n = parseArgentineNumber(`${match[1]}${match[2]}`);
  return n != null && Number.isFinite(n) ? n : null;
}

/**
 * One row of the public IOL fondos table, keyed by `data-symbol`.
 * Duplicate symbols with conflicting quotes are omitted (not last-wins).
 */
export function parseIolFondosPanel(html: string): Map<string, IolFciQuote> {
  const out = new Map<string, IolFciQuote>();
  const skipped = new Set<string>();
  const rowRe = /<tr\b[^>]*>[\s\S]*?<\/tr>/gi;
  for (const rowMatch of html.matchAll(rowRe)) {
    const row = rowMatch[0];
    const symbolMatch = row.match(/data-symbol="([^"]+)"/i);
    if (!symbolMatch) continue;
    const ticker = normalizeIolTicker(symbolMatch[1]);
    if (!ticker || skipped.has(ticker)) continue;
    const tds = [...row.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => stripTags(m[1]));
    const priceCell = tds.find((td) => /(?:US\$|AR\$|USD|ARS)\s*[\d.,]+/i.test(td)) ?? '';
    const priceMatch = priceCell.match(/(US\$|AR\$|USD|ARS)\s*([\d.]+(?:,\d+)?)/i);
    if (!priceMatch) continue;
    const price = parseArgentineNumber(priceMatch[2]);
    if (price == null || !(price > 0)) continue;
    const unit = priceMatch[1].toUpperCase();
    const currency: 'ARS' | 'USD' | null = unit.includes('US') ? 'USD' : unit.includes('AR') ? 'ARS' : null;
    const changeCell = tds.find((td) => /%/.test(td) && /[\d.,]+/.test(td));
    const changePct = changeCell ? parseSignedPercent(changeCell) : null;
    const quote: IolFciQuote = {
      ticker,
      price,
      currency,
      changePct,
      timestamp: null,
    };
    const existing = out.get(ticker);
    if (existing) {
      if (!quotesEqual(existing, quote)) {
        out.delete(ticker);
        skipped.add(ticker);
      }
      continue;
    }
    out.set(ticker, quote);
  }
  return out;
}

let panelCache: { ts: number; quotes: Map<string, IolFciQuote> } | null = null;
let panelInflight: Promise<Map<string, IolFciQuote>> | null = null;

function assertIolUrl(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch (error) {
    throw new IolFciFetchError(error);
  }
  if (parsed.protocol !== 'https:' || parsed.hostname !== IOL_ALLOWED_HOST) {
    throw new IolFciFetchError(new Error(`unexpected host ${parsed.hostname}`));
  }
}

async function loadPanel(): Promise<Map<string, IolFciQuote>> {
  if (panelCache && Date.now() - panelCache.ts < PANEL_TTL_MS) {
    return panelCache.quotes;
  }
  if (panelInflight) return panelInflight;
  panelInflight = (async () => {
    assertIolUrl(IOL_FONDOS_URL);
    let res: Response;
    try {
      res = await fetch(IOL_FONDOS_URL, {
        headers: IOL_FCI_HEADERS,
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        cache: 'no-store',
        redirect: FETCH_REDIRECT,
      });
    } catch (error) {
      throw new IolFciFetchError(error);
    }
    if (!res.ok) {
      let server: string | null = null;
      try {
        server = res.headers?.get?.('server') ?? null;
      } catch {
        server = null;
      }
      throw new IolFciHttpError(res.status, server);
    }
    let html = '';
    try {
      if (typeof res.text !== 'function' && !res.body) {
        html = '';
      } else {
        html = await readResponseTextCapped(res, IOL_MAX_BYTES);
      }
    } catch (error) {
      if (error instanceof ResponseTooLargeError) throw new IolFciFetchError(error);
      throw new IolFciFetchError(error);
    }
    const quotes = parseIolFondosPanel(html);
    panelCache = { ts: Date.now(), quotes };
    return quotes;
  })().finally(() => {
    panelInflight = null;
  });
  return panelInflight;
}

export async function fetchIolFciQuote(ticker: string): Promise<IolFciQuote | null> {
  const symbol = normalizeIolTicker(ticker);
  if (!symbol) return null;
  const panel = await loadPanel();
  return panel.get(symbol) ?? null;
}

export function resetIolFciPanelCacheForTest(): void {
  panelCache = null;
  panelInflight = null;
}
