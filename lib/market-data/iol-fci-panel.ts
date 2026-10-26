/**
 * Public InvertirOnline FCI panel. Used when CAFCI cannot resolve a ticker
 * (missing Bloomberg code, catalog HTTP error). Rounded to 2 decimals; not
 * a substitute for CAFCI's unit cuotaparte when the official ficha works.
 */

const IOL_FONDOS_URL = 'https://iol.invertironline.com/mercado/cotizaciones/argentina/fondos';
const FETCH_TIMEOUT_MS = 10_000;
const PANEL_TTL_MS = 60 * 60 * 1000;

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
}

/** Argentine display number: 1.241,95 → 1241.95; 1,10 → 1.10; 179,60 → 179.60. */
export function parseArgentineNumber(value: string): number | null {
  const s = value.replace(/\s/g, '').replace(/^[^\d-]+/, '').replace(/[^\d.,-]+$/g, '');
  if (!s) return null;
  const n = s.includes(',')
    ? Number(s.replace(/\./g, '').replace(',', '.'))
    : Number(s);
  return Number.isFinite(n) ? n : null;
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

/**
 * One row of the public IOL fondos table, keyed by `data-symbol`.
 */
export function parseIolFondosPanel(html: string): Map<string, IolFciQuote> {
  const out = new Map<string, IolFciQuote>();
  const rowRe = /<tr\b[^>]*>[\s\S]*?<\/tr>/gi;
  for (const rowMatch of html.matchAll(rowRe)) {
    const row = rowMatch[0];
    const symbolMatch = row.match(/data-symbol="([^"]+)"/i);
    if (!symbolMatch) continue;
    const ticker = symbolMatch[1].replace(/\s+/g, '').toUpperCase();
    if (!ticker) continue;
    const tds = [...row.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => stripTags(m[1]));
    const priceCell = tds.find((td) => /(?:US\$|AR\$|USD|ARS)\s*[\d.,]+/i.test(td)) ?? '';
    const priceMatch = priceCell.match(/(US\$|AR\$|USD|ARS)\s*([\d.,]+)/i);
    if (!priceMatch) continue;
    const price = parseArgentineNumber(priceMatch[2]);
    if (price == null || !(price > 0)) continue;
    const unit = priceMatch[1].toUpperCase();
    const currency: 'ARS' | 'USD' | null = unit.includes('US') ? 'USD' : unit.includes('AR') ? 'ARS' : null;
    const changeCell = tds.find((td) => /%/.test(td) && /[\d.,]+/.test(td));
    const changeRaw = changeCell?.match(/([\d.,]+)\s*%/);
    const changePct = changeRaw ? parseArgentineNumber(changeRaw[1]) : null;
    out.set(ticker, {
      ticker,
      price,
      currency,
      changePct: changePct != null && Number.isFinite(changePct) ? changePct : null,
    });
  }
  return out;
}

let panelCache: { ts: number; quotes: Map<string, IolFciQuote> } | null = null;
let panelInflight: Promise<Map<string, IolFciQuote>> | null = null;

async function loadPanel(): Promise<Map<string, IolFciQuote>> {
  if (panelCache && Date.now() - panelCache.ts < PANEL_TTL_MS) {
    return panelCache.quotes;
  }
  if (panelInflight) return panelInflight;
  panelInflight = (async () => {
    let res: Response;
    try {
      res = await fetch(IOL_FONDOS_URL, {
        headers: IOL_FCI_HEADERS,
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        cache: 'no-store',
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
      if (typeof res.text === 'function') html = await res.text();
    } catch (error) {
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
  const symbol = ticker.trim().toUpperCase();
  if (!symbol) return null;
  const panel = await loadPanel();
  return panel.get(symbol) ?? null;
}

export function resetIolFciPanelCacheForTest(): void {
  panelCache = null;
  panelInflight = null;
}
