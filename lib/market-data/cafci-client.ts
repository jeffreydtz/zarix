/**
 * Valor cuotaparte de FCI.
 *
 * Fuente primaria: API pública de CAFCI (sin credenciales). Si CAFCI no
 * responde (WAF/401), Yahoo `.BA` cubre fondos listados en BYMA.
 */

const CAFCI_BASE = 'https://api.cafci.org.ar';
const FETCH_TIMEOUT_MS = 8000;
const CATALOG_TTL_MS = 6 * 60 * 60 * 1000;

export interface FciQuote {
  ticker: string;
  price: number;
  currency: 'ARS' | 'USD';
  changePct: number | null;
  timestamp: string | null;
  source: 'cafci' | 'yahoo';
}

interface CafciClass {
  fondoId: string;
  claseId: string;
  keys: string[];
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

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'Mozilla/5.0',
      Origin: 'https://www.cafci.org.ar',
      Referer: 'https://www.cafci.org.ar/',
    },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    next: { revalidate: 300 },
  });
  if (!res.ok) throw new Error(`CAFCI ${res.status}`);
  return res.json();
}

async function loadCatalog(): Promise<CafciClass[]> {
  if (catalogCache && Date.now() - catalogCache.ts < CATALOG_TTL_MS) {
    return catalogCache.classes;
  }
  const json = await fetchJson(`${CAFCI_BASE}/fondo`);
  const fondos = asRows(json);
  const classes: CafciClass[] = [];
  for (const fondo of fondos) {
    const fondoId = pickId(fondo, 'id', 'fondoId', 'idFondo');
    const nested = asRows(fondo.clases ?? fondo.classes ?? fondo.clase);
    const rows = nested.length > 0 ? nested : [fondo];
    for (const clase of rows) {
      const claseId = pickId(clase, 'id', 'claseId', 'idClase') || fondoId;
      if (!fondoId || !claseId) continue;
      classes.push({ fondoId, claseId, keys: classKeys(fondo, clase) });
    }
  }
  catalogCache = { ts: Date.now(), classes };
  return classes;
}

function matchClass(classes: CafciClass[], ticker: string): CafciClass | null {
  const key = fold(ticker);
  if (!key) return null;
  return classes.find((c) => c.keys.includes(key) || c.keys.some((k) => k.startsWith(key) || key.startsWith(k)))
    ?? null;
}

function parseFicha(json: unknown): { price: number; currency: 'ARS' | 'USD'; timestamp: string | null } | null {
  const rows = asRows(json);
  const obj = (rows[0] || (json && typeof json === 'object' ? json : null)) as Record<string, unknown> | null;
  if (!obj) return null;
  const data = (obj.data && typeof obj.data === 'object' ? obj.data : obj) as Record<string, unknown>;
  const price = Number(
    data.valorCuotaparte ?? data.vcp ?? data.ultimoValor ?? data.valor ?? data.price ?? data.last
  );
  if (!Number.isFinite(price) || price <= 0) return null;
  const currencyRaw = String(data.moneda ?? data.currency ?? 'ARS').toUpperCase();
  const currency: 'ARS' | 'USD' = currencyRaw.includes('USD') ? 'USD' : 'ARS';
  const fecha = pickText(data.fecha, data.date, data.fechaValor, data.timestamp);
  const timestamp = fecha && Number.isFinite(Date.parse(fecha)) ? new Date(fecha).toISOString() : null;
  return { price, currency, timestamp };
}

export async function fetchFciQuote(ticker: string): Promise<FciQuote | null> {
  const symbol = ticker.trim().toUpperCase();
  if (!symbol) return null;
  try {
    const classes = await loadCatalog();
    const match = matchClass(classes, symbol);
    if (!match) return null;
    const json = await fetchJson(`${CAFCI_BASE}/fondo/${match.fondoId}/clase/${match.claseId}/ficha`);
    const parsed = parseFicha(json);
    if (!parsed) return null;
    return {
      ticker: symbol,
      price: parsed.price,
      currency: parsed.currency,
      changePct: null,
      timestamp: parsed.timestamp,
      source: 'cafci',
    };
  } catch {
    return null;
  }
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
