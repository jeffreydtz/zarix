/**
 * Valor cuotaparte de FCI.
 *
 * CAFCI REST (`api.cafci.org.ar/fondo`, `api.pub.cafci.org.ar/fondo/...`)
 * started returning 401 Bearer / CloudFront 403 "Route not allowed" in 2026.
 * Official replacements used here:
 *   1. `estadisticas.cafci.org.ar/consulta-de-fondos.json` (catalog + Bloomberg tickers)
 *   2. `estadisticas.cafci.org.ar/fondos/{id}?clase={id}` (HTML ficha, unit NAV)
 * InvertirOnline's public fondos panel is a last-resort fallback when CAFCI
 * cannot resolve the ticker (newer classes often omit `ticker_bloomberg`).
 *
 * An HTTP error on every source, an unusable 200, or a currency mismatch
 * means skip and keep the last stored price — never Yahoo.
 */

import { fetchIolFciQuote, parseArgentineNumber, resetIolFciPanelCacheForTest } from '@/lib/market-data/iol-fci-panel';

const CAFCI_STATS_BASE = 'https://estadisticas.cafci.org.ar';
const CAFCI_CATALOG_URL = `${CAFCI_STATS_BASE}/consulta-de-fondos.json`;
const FETCH_TIMEOUT_MS = 8000;
const CATALOG_TIMEOUT_MS = 20_000;
const CATALOG_TTL_MS = 6 * 60 * 60 * 1000;

/**
 * CAFCI's stats catalog omits Bloomberg tickers on some newer classes.
 * Only attach these when that fondo/clase row is actually in the catalog.
 * Verified 2026-10-26 against consulta-de-fondos.json + the HTML ficha.
 */
const CAFCI_CLASS_TICKER_ALIASES: Array<{ fondoId: string; claseId: string; ticker: string }> = [
  { fondoId: '1570', claseId: '5100', ticker: 'IOLDOLD' },
];

/** Browser-like headers: a bare `Mozilla/5.0` UA is enough for some CAFCI WAFs to 403. */
export const CAFCI_HEADERS = {
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': 'es-AR,es;q=0.9,en;q=0.8',
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Origin: 'https://www.cafci.org.ar',
  Referer: 'https://www.cafci.org.ar/',
} as const;

/** Which request failed: stats catalog, HTML ficha, or IOL panel fallback. */
export type CafciStage = 'catalog' | 'ficha' | 'iol';

/** Why fetchFciQuote returned null without throwing. */
export type CafciMissReason = 'empty_ticker' | 'no_match' | 'ambiguous_match' | 'unparseable_ficha';

/** Max length of any diagnostic string copied from a CAFCI response. */
const DIAG_MAX = 60;

function capDiag(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  const clean = value.replace(/[^\x20-\x7e]/g, '').trim();
  return clean ? clean.slice(0, DIAG_MAX) : undefined;
}

export class CafciHttpError extends Error {
  readonly status: number;
  readonly stage: CafciStage | undefined;
  /** `Server` response header (e.g. `awselb/2.0`), capped; tells a WAF/ELB block from the app. */
  readonly server: string | undefined;

  constructor(status: number, stage?: CafciStage, server?: string | null) {
    super(stage ? `CAFCI ${stage} ${status}` : `CAFCI ${status}`);
    this.name = 'CafciHttpError';
    this.status = status;
    this.stage = stage;
    this.server = capDiag(server);
  }
}

/** Network/timeout/JSON failure on a CAFCI request (no HTTP status). */
export class CafciFetchError extends Error {
  readonly stage: CafciStage;

  constructor(stage: CafciStage, cause: unknown) {
    const name = cause instanceof Error ? cause.name : typeof cause;
    const msg = cause instanceof Error ? cause.message : String(cause);
    super(`CAFCI ${stage} ${name}: ${msg}`.slice(0, 200));
    this.name = 'CafciFetchError';
    this.stage = stage;
  }
}

export function isCafciForbidden(error: unknown): boolean {
  return error instanceof CafciHttpError && error.status === 403;
}

export interface FciQuote {
  ticker: string;
  price: number;
  currency: 'ARS' | 'USD' | null;
  /** Present when CAFCI named a currency we must not apply (conflict or EUR). */
  currencySkip?: 'conflict' | 'unsupported';
  changePct: number | null;
  timestamp: string | null;
  source: 'cafci' | 'yahoo' | 'iol';
}

/** ARS/USD, an explicit other label (EUR), mixed fields at one level, or missing. */
export type CafciCurrencyLabel = 'ARS' | 'USD' | 'unsupported' | 'conflict' | null;

interface CafciClass {
  fondoId: string;
  claseId: string;
  keys: string[];
  /** Class-row moneda only; never inherited from the fund. */
  classCurrency?: CafciCurrencyLabel;
  fundCurrency?: CafciCurrencyLabel;
  /** Class ARS/USD for existing tests; unsupported/missing is null. */
  currency: 'ARS' | 'USD' | null;
}

let catalogCache: { ts: number; classes: CafciClass[] } | null = null;
let catalogInflight: Promise<CafciClass[]> | null = null;

function fold(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '');
}

function pickText(...candidates: unknown[]): string | null {
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim()) return c.trim();
  }
  return null;
}

function pickId(row: Record<string, unknown>, ...keys: string[]): string | null {
  for (const key of keys) {
    const v = row[key];
    if (typeof v === 'number' && Number.isFinite(v)) return String(v);
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function asRows(json: unknown): Record<string, unknown>[] {
  if (Array.isArray(json)) return json.filter((r) => r && typeof r === 'object') as Record<string, unknown>[];
  if (json && typeof json === 'object') {
    const o = json as Record<string, unknown>;
    for (const key of ['data', 'fondos', 'items', 'results']) {
      if (Array.isArray(o[key])) return asRows(o[key]);
    }
  }
  return [];
}

function bloombergTickerToken(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const token = value.trim().split(/\s+/)[0];
  return token || null;
}

function classKeys(fondo: Record<string, unknown>, clase: Record<string, unknown>): string[] {
  const names = [
    bloombergTickerToken(clase.ticker_bloomberg),
    pickText(clase.simbolo, clase.symbol, clase.ticker, clase.codigo, clase.codigoCafci, clase.classCodigo),
    pickText(clase.nombre, clase.name, clase.clase),
    pickText(fondo.simbolo, fondo.symbol, fondo.ticker, fondo.codigo),
    pickText(fondo.nombre, fondo.name),
  ].filter((v): v is string => Boolean(v));
  return [...new Set(names.map(fold).filter(Boolean))];
}

const CAFCI_USD_WORDS = new Set([
  'DOLAR', 'DOLARES', 'DOLLAR', 'DOLLARS', 'USD', 'US', 'U', 'S',
  'EEUU', 'EE', 'UU', 'USA', 'ESTADOUNIDENSE', 'ESTADOUNIDENSES',
  'AMERICANO', 'AMERICANOS', 'MEP', 'CABLE', 'CCL', 'BILLETE', 'BILLETES', 'U$S', 'US$',
  'DE', 'ESTADOS', 'UNIDOS',
]);
const CAFCI_USD_CORE = new Set(['DOLAR', 'DOLARES', 'DOLLAR', 'DOLLARS', 'USD', 'U$S', 'US$']);

const CAFCI_ARS_WORDS = new Set([
  'PESO', 'PESOS', 'ARGENTINO', 'ARGENTINOS', 'ARGENTINA', 'ARS', '$', 'MONEDA', 'LOCAL',
]);
const CAFCI_ARS_CORE = new Set(['PESO', 'PESOS', 'ARS']);

/** NFKD + strip marks; keep U$S, US$, and $; any letter/number run is a token. */
function cafciLabelTokens(value: string): string[] {
  return value
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toUpperCase()
    .match(/U\$S|US\$|\$|[\p{L}\p{N}]+/gu) ?? [];
}

function hasUsdCore(tokens: string[]): boolean {
  if (tokens.length === 1 && tokens[0] === 'US') return true;
  return tokens.some((token) => CAFCI_USD_CORE.has(token));
}

/**
 * Token allowlist (no substring heuristics).
 * Ignore (missing): empty, only '$', only numbers, exactly LOCAL.
 * USD: every word in the USD set and at least one core USD token
 *      ('US' is core only as the sole token).
 * ARS: every word in the ARS set and at least one of PESO/PESOS/ARS.
 * Anything else → unsupported (skip).
 */
export function parseCafciCurrencyLabel(value: unknown): CafciCurrencyLabel {
  if (value == null || typeof value === 'object' || typeof value === 'boolean') return null;
  if (typeof value === 'number') return null;
  const tokens = cafciLabelTokens(String(value));
  if (tokens.length === 0) return null;
  if (tokens.length === 1 && (tokens[0] === '$' || tokens[0] === 'LOCAL')) return null;
  if (tokens.every((token) => /^\d+$/.test(token))) return null;
  if (tokens.every((token) => CAFCI_USD_WORDS.has(token)) && hasUsdCore(tokens)) {
    return 'USD';
  }
  if (tokens.every((token) => CAFCI_ARS_WORDS.has(token)) && tokens.some((token) => CAFCI_ARS_CORE.has(token))) {
    return 'ARS';
  }
  return 'unsupported';
}

/**
 * Every present field at one CAFCI level. Missing, numeric ids, and
 * non-currency words (Local, $) are ignored. A recognizable currency name that
 * is not ARS/USD (EUR, Canadian Dollar, Mexican Peso, …), or ARS vs USD, makes
 * the whole level a skip.
 */
export function firstCurrencyLabel(...candidates: unknown[]): CafciCurrencyLabel {
  const present: Array<'ARS' | 'USD' | 'unsupported'> = [];
  for (const c of candidates) {
    const parsed = parseCafciCurrencyLabel(c);
    if (parsed === 'ARS' || parsed === 'USD' || parsed === 'unsupported') {
      present.push(parsed);
    }
  }
  if (present.length === 0) return null;
  const unique = new Set(present);
  if (unique.has('unsupported')) {
    return unique.size === 1 ? 'unsupported' : 'conflict';
  }
  if (unique.size > 1) return 'conflict';
  return present[0];
}

function asArsUsd(label: CafciCurrencyLabel): 'ARS' | 'USD' | null {
  return label === 'ARS' || label === 'USD' ? label : null;
}

/** Never defaults to ARS. Unknown and unsupported labels stay unknown here. */
export function parseCafciCurrency(...candidates: unknown[]): 'ARS' | 'USD' | null {
  return asArsUsd(firstCurrencyLabel(...candidates));
}

/** Stats catalog nests `{ id, nombre: "Peso Argentina" }`; the REST ficha used a string. */
function currencyField(value: unknown): unknown {
  const rec = asRecord(value);
  if (rec && 'nombre' in rec) return rec.nombre;
  return value;
}

function rowCurrencyLabel(row: Record<string, unknown> | null): CafciCurrencyLabel {
  if (!row) return null;
  return firstCurrencyLabel(
    currencyField(row.moneda),
    row.currency,
    row.monedaClase,
    row.tipoMoneda,
    row.monedaFondo,
  );
}

/**
 * catalog CLASS → ficha CLASS → ficha data-level → catalog FUND.
 * Any unsupported label (EUR) or two disagreeing ARS/USD sources → skip.
 */
export function resolveCafciCurrencySources(opts: {
  catalogClass: CafciCurrencyLabel;
  fichaClass: CafciCurrencyLabel;
  fichaData: CafciCurrencyLabel;
  catalogFund: CafciCurrencyLabel;
}): { currency: 'ARS' | 'USD' } | { currency: null; reason: 'conflict' | 'unsupported' | 'unknown' } {
  const ordered: CafciCurrencyLabel[] = [
    opts.catalogClass,
    opts.fichaClass,
    opts.fichaData,
    opts.catalogFund,
  ];
  let seen: 'ARS' | 'USD' | null = null;
  for (const label of ordered) {
    if (label == null) continue;
    if (label === 'unsupported') return { currency: null, reason: 'unsupported' };
    if (label === 'conflict') return { currency: null, reason: 'conflict' };
    if (seen && seen !== label) return { currency: null, reason: 'conflict' };
    seen = label;
  }
  if (!seen) return { currency: null, reason: 'unknown' };
  return { currency: seen };
}

async function fetchCafci(url: string, stage: CafciStage, timeoutMs = FETCH_TIMEOUT_MS): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(url, {
      headers: CAFCI_HEADERS,
      signal: AbortSignal.timeout(timeoutMs),
      cache: 'no-store',
    });
  } catch (error) {
    throw new CafciFetchError(stage, error);
  }
  if (!res.ok) {
    let server: string | null = null;
    try {
      server = res.headers?.get?.('server') ?? null;
    } catch {
      server = null;
    }
    throw new CafciHttpError(res.status, stage, server);
  }
  return res;
}

async function fetchJson(url: string, stage: CafciStage, timeoutMs = FETCH_TIMEOUT_MS): Promise<unknown> {
  const res = await fetchCafci(url, stage, timeoutMs);
  try {
    return await res.json();
  } catch (error) {
    throw new CafciFetchError(stage, error);
  }
}

function classesFromCatalogPayload(json: unknown): CafciClass[] {
  const fondos = asRows(json);
  const classes: CafciClass[] = [];
  for (const fondo of fondos) {
    const fondoId = pickId(fondo, 'id', 'fondoId', 'idFondo');
    const nested = asRows(fondo.clases ?? fondo.classes ?? fondo.clase);
    const rows = nested.length > 0 ? nested : [fondo];
    const fundCurrency = rowCurrencyLabel(fondo);
    for (const clase of rows) {
      const claseId = pickId(clase, 'id', 'claseId', 'idClase') || fondoId;
      if (!fondoId || !claseId) continue;
      const classCurrency = rowCurrencyLabel(clase);
      const keys = classKeys(fondo, clase);
      for (const alias of CAFCI_CLASS_TICKER_ALIASES) {
        if (alias.fondoId === fondoId && alias.claseId === claseId) {
          const aliasKey = fold(alias.ticker);
          if (aliasKey && !keys.includes(aliasKey)) keys.push(aliasKey);
        }
      }
      classes.push({
        fondoId,
        claseId,
        keys,
        classCurrency,
        fundCurrency,
        currency: asArsUsd(classCurrency),
      });
    }
  }
  return classes;
}

async function loadCatalogNow(): Promise<CafciClass[]> {
  const json = await fetchJson(CAFCI_CATALOG_URL, 'catalog', CATALOG_TIMEOUT_MS);
  const classes = classesFromCatalogPayload(json);
  catalogCache = { ts: Date.now(), classes };
  return classes;
}

async function loadCatalog(): Promise<CafciClass[]> {
  if (catalogCache && Date.now() - catalogCache.ts < CATALOG_TTL_MS) {
    return catalogCache.classes;
  }
  if (catalogInflight) return catalogInflight;
  catalogInflight = loadCatalogNow().finally(() => {
    catalogInflight = null;
  });
  return catalogInflight;
}

/** `23/10/2026` or `2026-10-23` → ISO. */
export function parseCafciDateLabel(value: string): string | null {
  const trimmed = value.trim();
  const dmy = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (dmy) {
    const day = dmy[1].padStart(2, '0');
    const month = dmy[2].padStart(2, '0');
    const year = dmy[3].length === 2 ? `20${dmy[3]}` : dmy[3];
    const iso = `${year}-${month}-${day}T00:00:00-03:00`;
    const ms = Date.parse(iso);
    return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
  }
  const ms = Date.parse(trimmed);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

/**
 * Official CAFCI stats HTML ficha: "Valor por cada cuotaparte: 1,097744"
 * (comma decimal / optional thousands dots). Not "Valor por mil".
 */
export function parseCafciHtmlFicha(html: string): {
  price: number;
  currency: 'ARS' | 'USD' | null;
  fichaClass: CafciCurrencyLabel;
  fichaData: CafciCurrencyLabel;
  timestamp: string | null;
} | null {
  if (!html || typeof html !== 'string') return null;
  const priceMatch = html.match(/Valor por cada cuotaparte:\s*([0-9.]+,[0-9]+|[0-9]+,[0-9]+|[0-9.]+)/i);
  if (!priceMatch) return null;
  const price = parseArgentineNumber(priceMatch[1]);
  if (price == null || !Number.isFinite(price) || price <= 0) return null;
  const dateMatch = html.match(/Valores al\s+(\d{1,2}\/\d{1,2}\/\d{2,4})/i);
  const timestamp = dateMatch ? parseCafciDateLabel(dateMatch[1]) : null;
  const monedaMatch = html.match(/Moneda:<\/span>\s*([^<]+)/i) ?? html.match(/Moneda:\s*([^<]+)/i);
  const fichaClass = firstCurrencyLabel(monedaMatch?.[1]?.replace(/\s+/g, ' ').trim());
  return {
    price,
    currency: asArsUsd(fichaClass),
    fichaClass,
    fichaData: null,
    timestamp,
  };
}

type ParsedFicha = {
  price: number;
  currency: 'ARS' | 'USD' | null;
  fichaClass: CafciCurrencyLabel;
  fichaData: CafciCurrencyLabel;
  timestamp: string | null;
};

async function fetchParsedFicha(match: CafciClass): Promise<ParsedFicha | null> {
  const url = `${CAFCI_STATS_BASE}/fondos/${encodeURIComponent(match.fondoId)}?clase=${encodeURIComponent(match.claseId)}`;
  const res = await fetchCafci(url, 'ficha');
  let text: string | null = null;
  if (typeof res.text === 'function') {
    try {
      text = await res.text();
    } catch (error) {
      throw new CafciFetchError('ficha', error);
    }
  }
  if (text) {
    const htmlParsed = parseCafciHtmlFicha(text);
    if (htmlParsed) return htmlParsed;
    try {
      const jsonParsed = parseFicha(JSON.parse(text));
      if (jsonParsed) return jsonParsed;
    } catch {
      // body was neither the stats HTML nor a JSON ficha
    }
  }
  if (typeof res.json === 'function' && text == null) {
    try {
      return parseFicha(await res.json());
    } catch (error) {
      throw new CafciFetchError('ficha', error);
    }
  }
  return null;
}

function quoteFromParsed(
  symbol: string,
  match: CafciClass,
  parsed: ParsedFicha,
  source: FciQuote['source']
): FciQuote {
  const resolved = resolveCafciCurrencySources({
    catalogClass: match.classCurrency !== undefined ? match.classCurrency : match.currency,
    fichaClass: parsed.fichaClass,
    fichaData: parsed.fichaData,
    catalogFund: match.fundCurrency ?? null,
  });
  if (resolved.currency) {
    return {
      ticker: symbol,
      price: parsed.price,
      currency: resolved.currency,
      changePct: null,
      timestamp: parsed.timestamp,
      source,
    };
  }
  if (resolved.reason === 'unknown') {
    return {
      ticker: symbol,
      price: parsed.price,
      currency: null,
      changePct: null,
      timestamp: parsed.timestamp,
      source,
    };
  }
  return {
    ticker: symbol,
    price: parsed.price,
    currency: null,
    currencySkip: resolved.reason,
    changePct: null,
    timestamp: parsed.timestamp,
    source,
  };
}

function matchClassDetailed(
  classes: CafciClass[],
  ticker: string
): { match: CafciClass } | { match: null; reason: 'no_match' | 'ambiguous_match' } {
  const key = fold(ticker);
  if (!key) return { match: null, reason: 'no_match' };
  const exact = classes.filter((c) => c.keys.includes(key));
  if (exact.length === 1) return { match: exact[0] };
  if (exact.length > 1) return { match: null, reason: 'ambiguous_match' };
  const partial = classes.filter((c) =>
    c.keys.some((k) => k !== key && (k.startsWith(key) || key.startsWith(k)))
  );
  if (partial.length === 1) return { match: partial[0] };
  return { match: null, reason: partial.length > 1 ? 'ambiguous_match' : 'no_match' };
}

function matchClass(classes: CafciClass[], ticker: string): CafciClass | null {
  return matchClassDetailed(classes, ticker).match;
}

function parseFicha(json: unknown): {
  price: number;
  currency: 'ARS' | 'USD' | null;
  fichaClass: CafciCurrencyLabel;
  fichaData: CafciCurrencyLabel;
  timestamp: string | null;
} | null {
  const rows = asRows(json);
  const obj = (rows[0] || (json && typeof json === 'object' ? json : null)) as Record<string, unknown> | null;
  if (!obj) return null;
  const data = (obj.data && typeof obj.data === 'object' ? obj.data : obj) as Record<string, unknown>;
  const price = Number(
    data.valorCuotaparte ?? data.vcp ?? data.ultimoValor ?? data.valor ?? data.price ?? data.last
  );
  if (!Number.isFinite(price) || price <= 0) return null;
  const clase = asRecord(data.clase);
  const fichaClass = firstCurrencyLabel(
    clase?.moneda,
    clase?.currency,
    data.monedaClase,
  );
  const fichaData = firstCurrencyLabel(
    data.tipoMoneda,
    data.moneda,
    data.currency,
  );
  const fecha = pickText(data.fecha, data.date, data.fechaValor, data.timestamp);
  const timestamp = fecha && Number.isFinite(Date.parse(fecha)) ? new Date(fecha).toISOString() : null;
  return {
    price,
    currency: asArsUsd(fichaClass) ?? asArsUsd(fichaData),
    fichaClass,
    fichaData,
    timestamp,
  };
}

async function fetchIolFallback(symbol: string): Promise<FciQuote | null> {
  const iol = await fetchIolFciQuote(symbol);
  if (!iol || !(iol.price > 0)) return null;
  return {
    ticker: symbol,
    price: iol.price,
    currency: iol.currency,
    changePct: iol.changePct,
    timestamp: null,
    source: 'iol',
  };
}

/**
 * `onMiss` is diagnostics only: it is told why the result is null and never
 * changes what is returned or thrown.
 */
export async function fetchFciQuote(
  ticker: string,
  onMiss?: (reason: CafciMissReason) => void
): Promise<FciQuote | null> {
  const miss = (reason: CafciMissReason): null => {
    try {
      onMiss?.(reason);
    } catch {
      // diagnostics must never affect the quote
    }
    return null;
  };
  const symbol = ticker.trim().toUpperCase();
  if (!symbol) return miss('empty_ticker');

  let cafciError: unknown = null;
  let missReason: CafciMissReason | null = null;
  try {
    const classes = await loadCatalog();
    const matched = matchClassDetailed(classes, symbol);
    if (matched.match) {
      const parsed = await fetchParsedFicha(matched.match);
      if (parsed) return quoteFromParsed(symbol, matched.match, parsed, 'cafci');
      try {
        const iol = await fetchIolFallback(symbol);
        if (iol) return iol;
      } catch {
        // keep the CAFCI miss reason when the fallback is also unusable
      }
      return miss('unparseable_ficha');
    }
    missReason = matched.reason;
  } catch (error) {
    cafciError = error;
  }

  try {
    const iol = await fetchIolFallback(symbol);
    if (iol) return iol;
  } catch (error) {
    if (cafciError) throw cafciError;
    throw error;
  }

  if (cafciError) throw cafciError;
  return miss(missReason ?? 'no_match');
}

/** Exposed for tests: match a ticker against a synthetic CAFCI catalog. */
export function matchCafciClassForTest(
  ticker: string,
  classes: CafciClass[]
): CafciClass | null {
  return matchClass(classes, ticker);
}

export function parseCafciFichaForTest(json: unknown) {
  return parseFicha(json);
}

export function cafciClassesFromCatalogForTest(json: unknown): CafciClass[] {
  return classesFromCatalogPayload(json);
}

export function resetCafciCatalogCacheForTest(): void {
  catalogCache = null;
  catalogInflight = null;
  resetIolFciPanelCacheForTest();
}
