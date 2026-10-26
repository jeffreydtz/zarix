/**
 * Public InvertirOnline FCI panel. Used when CAFCI cannot resolve a ticker
 * (missing Bloomberg code, catalog HTTP error). Rounded to 2 decimals; not
 * a substitute for CAFCI's unit cuotaparte when the official ficha works.
 *
 * The live panel has no NAV date, so quotes are not a persistence source.
 */

import * as cheerio from 'cheerio';
import { parseArgentineNumber } from '@/lib/market-data/argentine-number';
import {
  FETCH_REDIRECT,
  readResponseTextCapped,
  ResponseTooLargeError,
} from '@/lib/market-data/bounded-fetch';
import { CAFCI_NAV_TOKEN } from '@/lib/market-data/cafci-html';

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

function quotesEqual(a: IolFciQuote, b: IolFciQuote): boolean {
  return a.price === b.price && a.currency === b.currency && a.changePct === b.changePct;
}

function parseSignedPercent(text: string): number | null {
  const normalized = text.replace(/\u2212/g, '-').replace(/\s+/g, '');
  const match = normalized.match(/^([+-]?)(.+)%$/);
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
  let $ = cheerio.load(html);
  // Bare <tr> fragments are dropped by the HTML parser unless they sit in a table.
  if ($('tr').length === 0) $ = cheerio.load(`<table>${html}</table>`);
  $('script, style, noscript, template').remove();
  $('tr').each((_, row) => {
    const symbol = $(row).find('[data-symbol]').first().attr('data-symbol');
    if (symbol == null) return;
    const ticker = normalizeIolTicker(symbol);
    if (!ticker || skipped.has(ticker)) return;
    const tds = $(row).find('td').toArray().map((td) => $(td).text().replace(/\s+/g, ' ').trim());
    const priceCell = tds.find((td) => /^(US\$|AR\$|USD|ARS)\s+/i.test(td)) ?? '';
    const priceMatch = priceCell.match(/^(US\$|AR\$|USD|ARS)\s+(.+)$/i);
    if (!priceMatch) return;
    const token = priceMatch[2].trim();
    if (!CAFCI_NAV_TOKEN.test(token)) return;
    const price = parseArgentineNumber(token);
    if (price == null || !(price > 0)) return;
    const unit = priceMatch[1].toUpperCase();
    const currency: 'ARS' | 'USD' | null = unit.includes('US') ? 'USD' : unit.includes('AR') ? 'ARS' : null;
    const changeCell = tds.find((td) => /%/.test(td));
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
      return;
    }
    out.set(ticker, quote);
  });
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
