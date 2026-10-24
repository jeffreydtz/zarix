/**
 * Moneda de cotización vs ticker D/C/O del mercado argentino.
 *
 * BYMA lista el mismo instrumento en pesos (sin sufijo, o `O` en ONs) y en
 * dólares (`D` MEP, `C` CCL). data912 hardcodea ARS en todos los endpoints:
 * la moneda real se infiere del símbolo matcheado, no del tag del proveedor.
 */

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

/**
 * Un símbolo es la rueda D/C sólo si el mismo índice tiene la rueda en pesos.
 * Evita tratar `YPFD` (ticker peso de YPF) como cotización dólar.
 */
export function isDollarBoardSymbol(
  symbol: string,
  listed: ReadonlySet<string> | Map<string, unknown>
): boolean {
  const t = stripBymaSuffix(symbol);
  const has = (key: string) =>
    listed instanceof Map ? listed.has(key) : listed.has(key);
  if (t.endsWith('.D')) {
    const root = t.slice(0, -2);
    return has(root) || has(`${root}O`);
  }
  if (t.endsWith('D') || t.endsWith('C')) {
    const root = t.slice(0, -1);
    return has(root) || has(`${root}O`);
  }
  return false;
}

export function inferListedCurrency(
  matchedSymbol: string,
  listed: ReadonlySet<string> | Map<string, unknown>
): QuoteCurrency {
  return isDollarBoardSymbol(matchedSymbol, listed) ? 'USD' : 'ARS';
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
