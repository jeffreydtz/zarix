/**
 * Valor cuotaparte de FCI.
 *
 * CAFCI is the only source. An HTTP error, an unusable 200 (empty/{error}
 * catalog, missing valorCuotaparte, parse failure) or a currency mismatch
 * means skip and keep the last stored price — never Yahoo.
 */

const CAFCI_BASE = 'https://api.cafci.org.ar';
const FETCH_TIMEOUT_MS = 8000;
const CATALOG_TTL_MS = 6 * 60 * 60 * 1000;

/** Browser-like headers: a bare `Mozilla/5.0` UA is enough for some CAFCI WAFs to 403. */
export const CAFCI_HEADERS = {
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': 'es-AR,es;q=0.9,en;q=0.8',
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Origin: 'https://www.cafci.org.ar',
  Referer: 'https://www.cafci.org.ar/',
} as const;

export class CafciHttpError extends Error {
  readonly status: number;

  constructor(status: number) {
    super(`CAFCI ${status}`);
    this.name = 'CafciHttpError';
    this.status = status;
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
  source: 'cafci' | 'yahoo';
}

/** ARS/USD, an explicit other label (EUR), or missing. */
export type CafciCurrencyLabel = 'ARS' | 'USD' | 'unsupported' | null;

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

function classKeys(fondo: Record<string, unknown>, clase: Record<string, unknown>): string[] {
  const names = [
    pickText(clase.simbolo, clase.symbol, clase.ticker, clase.codigo, clase.codigoCafci, clase.classCodigo),
    pickText(clase.nombre, clase.name, clase.clase),
    pickText(fondo.simbolo, fondo.symbol, fondo.ticker, fondo.codigo),
    pickText(fondo.nombre, fondo.name),
  ].filter((v): v is string => Boolean(v));
  return [...new Set(names.map(fold).filter(Boolean))];
}

/** First explicit label: ARS/USD, unsupported (EUR, …), or missing. */
export function parseCafciCurrencyLabel(value: unknown): CafciCurrencyLabel {
  if (value == null || typeof value === 'object') return null;
  const folded = fold(String(value));
  if (!folded) return null;
  if (
    folded.includes('USD')
    || folded.includes('DOLAR')
    || folded.includes('DOLLAR')
    || folded === 'US'
    || folded === 'USS'
  ) {
    return 'USD';
  }
  if (folded.includes('ARS') || folded.includes('PESO')) return 'ARS';
  return 'unsupported';
}

function firstCurrencyLabel(...candidates: unknown[]): CafciCurrencyLabel {
  for (const c of candidates) {
    const parsed = parseCafciCurrencyLabel(c);
    if (parsed != null) return parsed;
  }
  return null;
}

function asArsUsd(label: CafciCurrencyLabel): 'ARS' | 'USD' | null {
  return label === 'ARS' || label === 'USD' ? label : null;
}

/** Never defaults to ARS. Unknown and unsupported labels stay unknown here. */
export function parseCafciCurrency(...candidates: unknown[]): 'ARS' | 'USD' | null {
  return asArsUsd(firstCurrencyLabel(...candidates));
}

function rowCurrencyLabel(row: Record<string, unknown> | null): CafciCurrencyLabel {
  if (!row) return null;
  return firstCurrencyLabel(
    row.moneda,
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
    if (seen && seen !== label) return { currency: null, reason: 'conflict' };
    seen = label;
  }
  if (!seen) return { currency: null, reason: 'unknown' };
  return { currency: seen };
}

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url, {
    headers: CAFCI_HEADERS,
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    cache: 'no-store',
  });
  if (!res.ok) throw new CafciHttpError(res.status);
  return res.json();
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
      classes.push({
        fondoId,
        claseId,
        keys: classKeys(fondo, clase),
        classCurrency,
        fundCurrency,
        currency: asArsUsd(classCurrency),
      });
    }
  }
  return classes;
}

async function loadCatalog(): Promise<CafciClass[]> {
  if (catalogCache && Date.now() - catalogCache.ts < CATALOG_TTL_MS) {
    return catalogCache.classes;
  }
  const json = await fetchJson(`${CAFCI_BASE}/fondo`);
  const classes = classesFromCatalogPayload(json);
  catalogCache = { ts: Date.now(), classes };
  return classes;
}

function matchClass(classes: CafciClass[], ticker: string): CafciClass | null {
  const key = fold(ticker);
  if (!key) return null;
  const exact = classes.filter((c) => c.keys.includes(key));
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) return null;
  const partial = classes.filter((c) =>
    c.keys.some((k) => k !== key && (k.startsWith(key) || key.startsWith(k)))
  );
  if (partial.length === 1) return partial[0];
  return null;
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

export async function fetchFciQuote(ticker: string): Promise<FciQuote | null> {
  const symbol = ticker.trim().toUpperCase();
  if (!symbol) return null;
  const classes = await loadCatalog();
  const match = matchClass(classes, symbol);
  if (!match) return null;
  const json = await fetchJson(`${CAFCI_BASE}/fondo/${match.fondoId}/clase/${match.claseId}/ficha`);
  const parsed = parseFicha(json);
  if (!parsed) return null;
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
      source: 'cafci',
    };
  }
  if (resolved.reason === 'unknown') {
    return {
      ticker: symbol,
      price: parsed.price,
      currency: null,
      changePct: null,
      timestamp: parsed.timestamp,
      source: 'cafci',
    };
  }
  return {
    ticker: symbol,
    price: parsed.price,
    currency: null,
    currencySkip: resolved.reason,
    changePct: null,
    timestamp: parsed.timestamp,
    source: 'cafci',
  };
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
}
