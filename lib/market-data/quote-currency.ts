/**
 * Moneda de cotización vs ticker D/C/O del mercado argentino.
 *
 * Conservative: never infer USD from a D/C suffix alone. AMD/MCD/HD/C/BAC/CARC
 * are native listings. A D/C symbol is USD only when its ARS sibling exists in
 * the live feed or catalog. If that cannot be confirmed, callers must skip.
 */

import { catalogHasSymbol, isCatalogPesoListing } from '@/lib/market-data/argentine-catalog';

export type QuoteCurrency = 'ARS' | 'USD';

export function stripBymaSuffix(ticker: string): string {
  return (ticker || '').trim().toUpperCase().replace(/\.BA$/i, '');
}

function stripDollarBoard(symbol: string): string {
  const t = stripBymaSuffix(symbol);
  if (t.endsWith('.D')) return t.slice(0, -2);
  if (/[CDO]$/.test(t) && t.length > 1) return t.slice(0, -1);
  return t;
}

function listedHas(
  listed: ReadonlySet<string> | Map<string, unknown>,
  key: string
): boolean {
  return listed instanceof Map ? listed.has(key) : listed.has(key);
}

function looksLikeDollarSuffix(symbol: string): boolean {
  const t = stripBymaSuffix(symbol);
  if (t.endsWith('.D')) return t.length > 2;
  return (t.endsWith('D') || t.endsWith('C')) && t.length > 1;
}

function dollarBoardRoot(symbol: string): string | null {
  const t = stripBymaSuffix(symbol);
  if (!looksLikeDollarSuffix(t)) return null;
  if (t.endsWith('.D')) return t.slice(0, -2);
  return t.slice(0, -1);
}

function hasPesoSibling(
  root: string,
  listed: ReadonlySet<string> | Map<string, unknown>
): boolean {
  return listedHas(listed, root)
    || listedHas(listed, `${root}O`)
    || catalogHasSymbol(root)
    || catalogHasSymbol(`${root}O`);
}

/**
 * USD board only when the ARS sibling is known and this is not a native
 * peso/CEDEAR ticker (YPFD, AMD, MCD, HD, C, BAC, CARC).
 */
export function isDollarBoardSymbol(
  symbol: string,
  listed: ReadonlySet<string> | Map<string, unknown>
): boolean {
  const t = stripBymaSuffix(symbol);
  if (isCatalogPesoListing(t)) return false;
  const root = dollarBoardRoot(t);
  if (!root) return false;
  return hasPesoSibling(root, listed);
}

/**
 * Resolve the currency of a matched quote. `null` means unconfirmed: skip the
 * update instead of guessing from the ticker suffix.
 *
 * Explicit non-ARS source metadata wins. data912's dummy ARS tag is ignored
 * when a sibling-confirmed D/C listing exists. A trailing D/C with no peso
 * sibling (IBMD, GLD before the catalog entry) is skipped, not treated as ARS.
 * Everything else — ONs, letras, peso-only bonds, non-catalog stocks — stays ARS.
 */
export function resolveQuoteCurrency(opts: {
  matchedSymbol: string;
  listed: ReadonlySet<string> | Map<string, unknown>;
  sourceCurrency?: string | null;
}): QuoteCurrency | null {
  const t = stripBymaSuffix(opts.matchedSymbol);
  const tagged = (opts.sourceCurrency || '').trim().toUpperCase();
  if (tagged && tagged !== 'ARS') {
    return tagged === 'USD' ? 'USD' : null;
  }
  if (isCatalogPesoListing(t)) return 'ARS';
  if (isDollarBoardSymbol(t, opts.listed)) return 'USD';
  if (looksLikeDollarSuffix(t)) return null;
  return 'ARS';
}

export function inferListedCurrency(
  matchedSymbol: string,
  listed: ReadonlySet<string> | Map<string, unknown>
): QuoteCurrency {
  return resolveQuoteCurrency({ matchedSymbol, listed }) ?? 'ARS';
}

function knownQuoteCurrency(value: string | null | undefined): QuoteCurrency | null {
  const tagged = (value || '').trim().toUpperCase();
  if (tagged === 'USD' || tagged === 'ARS') return tagged;
  return null;
}

/** Inclusive band: peso vs USD cuotapartes differ by ~1000×, live USD FCIs stay near 1. */
const FCI_UNKNOWN_USD_RATIO_MIN = 0.5;
const FCI_UNKNOWN_USD_RATIO_MAX = 2;

function asFiniteNumber(value: unknown): number | null {
  if (value == null || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value.trim());
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function isPresentPrice(value: unknown): boolean {
  if (value == null || value === '') return false;
  return !(typeof value === 'string' && !value.trim());
}

/**
 * Unknown-USD plausibility anchor: a valid current_price (>0, finite, including
 * numeric strings like '1.09'). If current_price is absent (null/empty), fall
 * back to purchase_price only when purchase_currency equals market_currency and
 * that currency is USD. A present-but-invalid current_price (0/NaN/negative)
 * does not fall back.
 */
export function fciUsdPlausibilityAnchor(opts: {
  currentPrice?: unknown;
  purchasePrice?: unknown;
  marketCurrency?: string | null;
  purchaseCurrency?: string | null;
}): number | null {
  const current = asFiniteNumber(opts.currentPrice);
  if (current != null && current > 0) return current;
  if (isPresentPrice(opts.currentPrice)) return null;
  const market = (opts.marketCurrency || '').trim().toUpperCase();
  const purchaseCcy = (opts.purchaseCurrency || '').trim().toUpperCase();
  if (market !== 'USD' || purchaseCcy !== 'USD') return null;
  const purchase = asFiniteNumber(opts.purchasePrice);
  return purchase != null && purchase > 0 ? purchase : null;
}

/**
 * Unknown CAFCI + stored USD: accept the cuotaparte as USD only when a positive
 * stored last price exists and new/stored is in [0.5, 2]. CONIOLA ~179.598 vs
 * stored ~0.138 skips; IOLDOLD 1.098 vs stored ~1.09 accepts. 0/null/NaN skip.
 */
export function fciUnknownUsdPricePlausible(
  sourcePrice: number | null | undefined,
  storedPrice: number | null | undefined,
): boolean {
  const next = asFiniteNumber(sourcePrice);
  const prev = asFiniteNumber(storedPrice);
  if (next == null || prev == null || !(next > 0) || !(prev > 0)) return false;
  const ratio = next / prev;
  return ratio >= FCI_UNKNOWN_USD_RATIO_MIN && ratio <= FCI_UNKNOWN_USD_RATIO_MAX;
}

/**
 * FCI cuotaparte currency: never assume ARS from the ticker.
 *
 * Known CAFCI ARS/USD is the source currency of the cuotaparte. Callers convert
 * ARS↔USD with the same MEP helper stocks/CEDEARs use (`adaptQuoteToMarketCurrency`).
 * A CAFCI/stored mismatch is not a skip at this layer.
 *
 * Unknown CAFCI + stored USD: accept as USD only when the new cuotaparte is
 * plausible vs the last stored USD price (`fciUnknownUsdPricePlausible`).
 * Otherwise skip — a peso fund booked in USD must not be written as ~180 USD.
 *
 * Unknown CAFCI + stored ARS: keep main — accept stored ARS. A peso fund whose
 * ficha omitted moneda is still a peso cuotaparte; writing ARS as ARS is safe.
 */
export function resolveFciQuoteCurrency(opts: {
  sourceCurrency: string | null | undefined;
  storedCurrency: string | null | undefined;
  sourcePrice?: number | null;
  storedPrice?: number | null;
}): { currency: QuoteCurrency } | { currency: null; reason: 'disagree' | 'unknown' } {
  const source = knownQuoteCurrency(opts.sourceCurrency);
  const stored = knownQuoteCurrency(opts.storedCurrency);
  if (source) return { currency: source };
  if (stored === 'ARS') return { currency: 'ARS' };
  if (stored === 'USD' && fciUnknownUsdPricePlausible(opts.sourcePrice, opts.storedPrice)) {
    return { currency: 'USD' };
  }
  return { currency: null, reason: 'unknown' };
}

/** Yahoo/Stooq metadata is confirmation. A blank field is not inferred from the ticker. */
export function confirmedSourceCurrency(
  sourceCurrency: string | null | undefined
): QuoteCurrency | null {
  return knownQuoteCurrency(sourceCurrency);
}

export interface ListingCandidates {
  /** Símbolos a pedir, preferencia primero. */
  symbols: string[];
  root: string;
}

/**
 * Candidatos de ticker según la moneda de cotización de la posición.
 * ONs: rueda pesos = `{root}O`; D = `{root}D`. Soberanos/CEDEAR: pesos = root.
 */
export function listingCandidates(
  ticker: string,
  marketCurrency: string,
  kind: 'stock_arg' | 'cedear' | 'bond' | 'on' | 'fci' | 'other' = 'other'
): ListingCandidates {
  const raw = stripBymaSuffix(ticker);
  const root = stripDollarBoard(raw);
  const peso = kind === 'on' ? `${root}O` : root;
  const dollar = `${root}D`;
  const ccl = `${root}C`;
  const preferred = (marketCurrency || 'ARS').trim().toUpperCase();

  const usdFirst = preferred === 'USD';
  const symbols = usdFirst
    ? [dollar, raw, ccl, peso, root]
    : [raw, peso, root, dollar, ccl];

  const seen = new Set<string>();
  const out: string[] = [];
  for (const symbol of symbols) {
    if (!symbol || seen.has(symbol)) continue;
    seen.add(symbol);
    out.push(symbol);
  }
  return { symbols: out, root };
}

export interface ConvertibleQuote {
  price: number;
  changePct: number | null;
  currency: string;
  timestamp: string | null;
  /** data912 served this row from a failed-fetch fallback, not a live GET. */
  stale?: boolean;
}

/**
 * Adapta una cotización a la moneda de mercado de la posición.
 * ARS→USD y USD→ARS usan MEP (ARS por 1 USD). No pisa USD con el precio en pesos.
 */
export function adaptQuoteToMarketCurrency(
  quote: ConvertibleQuote,
  marketCurrency: string,
  mepArsPerUsd: number | null
): ConvertibleQuote | null {
  const desired = (marketCurrency || quote.currency).trim().toUpperCase();
  const source = (quote.currency || '').trim().toUpperCase();
  if (!Number.isFinite(quote.price) || quote.price <= 0) return null;
  if (!desired || source === desired) {
    return { ...quote, currency: desired || source };
  }
  if ((source === 'ARS' && desired === 'USD') || (source === 'USD' && desired === 'ARS')) {
    if (mepArsPerUsd == null || !Number.isFinite(mepArsPerUsd) || mepArsPerUsd <= 0) {
      return null;
    }
    const price =
      source === 'ARS' ? quote.price / mepArsPerUsd : quote.price * mepArsPerUsd;
    if (!Number.isFinite(price) || price <= 0) return null;
    return { ...quote, price, currency: desired };
  }
  return null;
}
