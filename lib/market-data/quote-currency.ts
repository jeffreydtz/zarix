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
 * True when the feed or catalog lists a D/C board of this symbol, so the bare
 * ticker is the peso line. Trailing D on the ticker itself is not enough.
 */
function hasDollarBoardSibling(
  symbol: string,
  listed: ReadonlySet<string> | Map<string, unknown>
): boolean {
  const t = stripBymaSuffix(symbol);
  return listedHas(listed, `${t}D`)
    || listedHas(listed, `${t}C`)
    || listedHas(listed, `${t}.D`)
    || catalogHasSymbol(`${t}D`)
    || catalogHasSymbol(`${t}C`);
}

/**
 * Resolve the currency of a matched quote. `null` means unconfirmed: skip.
 *
 * ARS only with positive confirmation: curated peso/CEDEAR catalog, or a D/C
 * sibling in the feed/catalog proving this is the peso line. USD only from an
 * explicit non-ARS source tag or a sibling-confirmed D-class listing.
 * Never infer from ticker equality or a trailing D/C suffix.
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
  if (hasDollarBoardSibling(t, opts.listed)) return 'ARS';
  return null;
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

/**
 * FCI cuotaparte currency: never assume ARS. Prefer the CAFCI class/ficha
 * moneda; fall back to the position's stored currency. Disagree or unknown → skip.
 */
export function resolveFciQuoteCurrency(opts: {
  sourceCurrency: string | null | undefined;
  storedCurrency: string | null | undefined;
}): { currency: QuoteCurrency } | { currency: null; reason: 'disagree' | 'unknown' } {
  const source = knownQuoteCurrency(opts.sourceCurrency);
  const stored = knownQuoteCurrency(opts.storedCurrency);
  if (source && stored && source !== stored) {
    return { currency: null, reason: 'disagree' };
  }
  const currency = source ?? stored;
  if (!currency) return { currency: null, reason: 'unknown' };
  return { currency };
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
