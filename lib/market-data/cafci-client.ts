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
 * The live IOL table has no NAV date, so those quotes are preview-only and
 * are never persisted by the price cron.
 *
 * An HTTP error on every source, an unusable 200, or a currency mismatch
 * means skip and keep the last stored price — never Yahoo.
 */

import {
  FETCH_REDIRECT,
  readResponseTextCapped,
  ResponseTooLargeError,
} from '@/lib/market-data/bounded-fetch';
import { parseCafciHtmlFichaDetailed } from '@/lib/market-data/cafci-html';
import { fciJumpMaxAbs } from '@/lib/market-data/fci-daily-jump';
import { parseCafciDateLabel } from '@/lib/market-data/fci-nav-freshness';
import { fetchIolFciQuote, resetIolFciPanelCacheForTest } from '@/lib/market-data/iol-fci-panel';

export { fciJumpMaxAbs } from '@/lib/market-data/fci-daily-jump';

export { parseCafciDateLabel };

const CAFCI_STATS_BASE = 'https://estadisticas.cafci.org.ar';
const CAFCI_CATALOG_HOST = 'estadisticas.cafci.org.ar';
const CAFCI_CATALOG_URL = `${CAFCI_STATS_BASE}/consulta-de-fondos.json`;
const FETCH_TIMEOUT_MS = 8000;
const CATALOG_TIMEOUT_MS = 20_000;
const CATALOG_TTL_MS = 6 * 60 * 60 * 1000;
const CATALOG_MAX_BYTES = 8_000_000;
const FICHA_MAX_BYTES = 512_000;

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
export type CafciMissReason =
  | 'empty_ticker'
  | 'no_match'
  | 'ambiguous_match'
  | 'unparseable_ficha'
  | 'class_mismatch';

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

function detailFromUnknown(error: unknown, fallbackReason: string): {
  reason: string;
  stage?: string;
  status?: number;
  server?: string;
} {
  if (typeof error === 'string' && error.trim()) {
    return { reason: capDiag(error) ?? fallbackReason };
  }
  if (!error || typeof error !== 'object') return { reason: fallbackReason };
  const rec = error as { message?: unknown; stage?: unknown; status?: unknown; server?: unknown };
  const message = typeof rec.message === 'string' ? rec.message : fallbackReason;
  return {
    reason: capDiag(message) ?? fallbackReason,
    stage: typeof rec.stage === 'string' ? rec.stage : undefined,
    status: typeof rec.status === 'number' && Number.isFinite(rec.status) ? rec.status : undefined,
    server: typeof rec.server === 'string' ? capDiag(rec.server) : undefined,
  };
}

/**
 * Both CAFCI and IOL failed. Skip logging should keep reason/stage from each.
 */
export class FciCombinedError extends Error {
  readonly cafciReason: string;
  readonly iolReason: string;
  readonly cafciStage?: string;
  readonly iolStage?: string;
  readonly cafciStatus?: number;
  readonly iolStatus?: number;
  readonly stage?: string;
  readonly status?: number;
  readonly server?: string;

  constructor(cafci: unknown, iol: unknown, cafciFallback: string) {
    const cafciDetail = detailFromUnknown(cafci, cafciFallback);
    const iolDetail = detailFromUnknown(iol, 'IOL failure');
    const reason = `${cafciDetail.reason}; ${iolDetail.reason}`.slice(0, 200);
    super(reason);
    this.name = 'FciCombinedError';
    this.cafciReason = cafciDetail.reason;
    this.iolReason = iolDetail.reason;
    this.cafciStage = cafciDetail.stage;
    this.iolStage = iolDetail.stage;
    this.cafciStatus = cafciDetail.status;
    this.iolStatus = iolDetail.status;
    this.stage = iolDetail.stage ?? cafciDetail.stage;
    this.status = iolDetail.status ?? cafciDetail.status;
    this.server = iolDetail.server ?? cafciDetail.server;
  }
}

export function isCafciForbidden(error: unknown): boolean {
  if (error instanceof CafciHttpError && error.status === 403) return true;
  return error instanceof FciCombinedError && error.cafciStatus === 403;
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
  /** Catalog `tipo_renta` used by the daily_jump band. */
  fundType?: string | null;
  /** Max |new/stored - 1| for a stored price ≤10 days old. */
  jumpMaxAbs?: number;
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
  /** CAFCI catalog `tipo_renta.nombre` (Mercado de Dinero, Renta Fija, …). */
  tipoRenta?: string | null;
  /** Catalog `dias_liquidacion`; 0 is T+0. */
  diasLiquidacion?: number | null;
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

function namedField(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return value.trim();
  const rec = asRecord(value);
  return rec ? pickText(rec.nombre, rec.name, rec.label) : null;
}

function numericField(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return null;
}

function catalogFundType(fondo: Record<string, unknown>): {
  tipoRenta: string | null;
  diasLiquidacion: number | null;
} {
  return {
    tipoRenta: namedField(fondo.tipo_renta)
      ?? pickText(fondo.tipoRenta, fondo.categoria, fondo.tipo),
    diasLiquidacion: numericField(fondo.dias_liquidacion ?? fondo.diasLiquidacion),
  };
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

function assertCafciUrl(url: string, stage: CafciStage): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch (error) {
    throw new CafciFetchError(stage, error);
  }
  if (parsed.protocol !== 'https:' || parsed.hostname !== CAFCI_CATALOG_HOST) {
    throw new CafciFetchError(stage, new Error(`unexpected host ${parsed.hostname}`));
  }
}

async function fetchCafciText(
  url: string,
  stage: CafciStage,
  timeoutMs = FETCH_TIMEOUT_MS,
  maxBytes = FICHA_MAX_BYTES
): Promise<string> {
  assertCafciUrl(url, stage);
  let res: Response;
  try {
    res = await fetch(url, {
      headers: CAFCI_HEADERS,
      signal: AbortSignal.timeout(timeoutMs),
      cache: 'no-store',
      redirect: FETCH_REDIRECT,
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
  try {
    if (typeof res.text !== 'function' && typeof res.json === 'function' && !res.body) {
      return JSON.stringify(await res.json());
    }
    return await readResponseTextCapped(res, maxBytes);
  } catch (error) {
    if (error instanceof ResponseTooLargeError) throw new CafciFetchError(stage, error);
    throw new CafciFetchError(stage, error);
  }
}

async function fetchJson(url: string, stage: CafciStage, timeoutMs = FETCH_TIMEOUT_MS): Promise<unknown> {
  const text = await fetchCafciText(url, stage, timeoutMs, CATALOG_MAX_BYTES);
  try {
    return JSON.parse(text);
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
    const { tipoRenta, diasLiquidacion } = catalogFundType(fondo);
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
        tipoRenta,
        diasLiquidacion,
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

/**
 * Official CAFCI stats HTML ficha. Identity and NAV come from the DOM tree.
 */
export function parseCafciHtmlFicha(html: string, expected?: { fondoId: string; claseId: string }): {
  price: number;
  currency: 'ARS' | 'USD' | null;
  fichaClass: CafciCurrencyLabel;
  fichaData: CafciCurrencyLabel;
  timestamp: string | null;
  fondoId: string | null;
  claseId: string | null;
} | null {
  const result = parseCafciHtmlFichaDetailed(html, expected);
  if (!result.parsed) return null;
  const fichaClass = firstCurrencyLabel(result.parsed.monedaLabel);
  return {
    price: result.parsed.price,
    currency: asArsUsd(fichaClass),
    fichaClass,
    fichaData: null,
    timestamp: result.parsed.timestamp,
    fondoId: result.parsed.fondoId,
    claseId: result.parsed.claseId,
  };
}

type ParsedFicha = {
  price: number;
  currency: 'ARS' | 'USD' | null;
  fichaClass: CafciCurrencyLabel;
  fichaData: CafciCurrencyLabel;
  timestamp: string | null;
};

type FichaFetchResult =
  | { parsed: ParsedFicha }
  | { parsed: null; reason: 'unparseable_ficha' | 'class_mismatch' };

async function fetchParsedFicha(match: CafciClass): Promise<FichaFetchResult> {
  const url = `${CAFCI_STATS_BASE}/fondos/${encodeURIComponent(match.fondoId)}?clase=${encodeURIComponent(match.claseId)}`;
  const text = await fetchCafciText(url, 'ficha', FETCH_TIMEOUT_MS, FICHA_MAX_BYTES);
  const result = parseCafciHtmlFichaDetailed(text, { fondoId: match.fondoId, claseId: match.claseId });
  if (!result.parsed) return { parsed: null, reason: result.reason };
  const fichaClass = firstCurrencyLabel(result.parsed.monedaLabel);
  return {
    parsed: {
      price: result.parsed.price,
      currency: asArsUsd(fichaClass),
      fichaClass,
      fichaData: null,
      timestamp: result.parsed.timestamp,
    },
  };
}

function jumpFields(match: CafciClass | null): Pick<FciQuote, 'fundType' | 'jumpMaxAbs'> {
  return {
    fundType: match?.tipoRenta ?? null,
    jumpMaxAbs: fciJumpMaxAbs(match?.tipoRenta, match?.diasLiquidacion),
  };
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
  const jump = jumpFields(match);
  if (resolved.currency) {
    return {
      ticker: symbol,
      price: parsed.price,
      currency: resolved.currency,
      changePct: null,
      timestamp: parsed.timestamp,
      source,
      ...jump,
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
      ...jump,
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
    ...jump,
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
  return { match: null, reason: 'no_match' };
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
  const timestamp = fecha ? parseCafciDateLabel(fecha) : null;
  return {
    price,
    currency: asArsUsd(fichaClass) ?? asArsUsd(fichaData),
    fichaClass,
    fichaData,
    timestamp,
  };
}

async function fetchIolFallback(
  symbol: string,
  catalogCurrency?: 'ARS' | 'USD' | null,
  match?: CafciClass | null
): Promise<FciQuote | null> {
  const iol = await fetchIolFciQuote(symbol);
  if (!iol || !(iol.price > 0)) return null;
  if (catalogCurrency && iol.currency && iol.currency !== catalogCurrency) {
    return null;
  }
  return {
    ticker: symbol,
    price: iol.price,
    currency: iol.currency,
    changePct: iol.changePct,
    timestamp: iol.timestamp,
    source: 'iol',
    ...jumpFields(match ?? null),
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
      const result = await fetchParsedFicha(matched.match);
      if (result.parsed) return quoteFromParsed(symbol, matched.match, result.parsed, 'cafci');
      if (result.reason === 'class_mismatch') return miss('class_mismatch');
      try {
        const iol = await fetchIolFallback(
          symbol,
          asArsUsd(matched.match.classCurrency ?? matched.match.currency),
          matched.match
        );
        if (iol) return iol;
      } catch (iolError) {
        throw new FciCombinedError(
          { message: 'unparseable_ficha', stage: 'ficha' },
          iolError,
          'unparseable_ficha'
        );
      }
      throw new FciCombinedError(
        { message: 'unparseable_ficha', stage: 'ficha' },
        { message: 'no_match', stage: 'iol' },
        'unparseable_ficha'
      );
    }
    if (matched.reason === 'ambiguous_match') return miss('ambiguous_match');
    missReason = matched.reason;
  } catch (error) {
    if (error instanceof FciCombinedError) throw error;
    cafciError = error;
  }

  try {
    const iol = await fetchIolFallback(symbol);
    if (iol) return iol;
  } catch (error) {
    if (cafciError) throw new FciCombinedError(cafciError, error, 'CAFCI failure');
    if (missReason) {
      throw new FciCombinedError(
        { message: missReason, stage: 'catalog' },
        error,
        missReason
      );
    }
    throw error;
  }

  if (cafciError) {
    throw new FciCombinedError(cafciError, { message: 'no_match', stage: 'iol' }, 'CAFCI failure');
  }
  if (missReason) {
    throw new FciCombinedError(
      { message: missReason, stage: 'catalog' },
      { message: 'no_match', stage: 'iol' },
      missReason
    );
  }
  return miss('no_match');
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
