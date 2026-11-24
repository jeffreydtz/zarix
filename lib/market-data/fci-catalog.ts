/**
 * Common Argentine FCI tickers so search does not fall through to crypto/Yahoo.
 * Names are display-only; CAFCI/IOL still resolve the live cuotaparte.
 */
export interface FciCatalogEntry {
  symbol: string;
  name: string;
}

export const FCI_CATALOG: FciCatalogEntry[] = [
  { symbol: 'IOLCAMA', name: 'IOL Caja de Ahorro Money Market' },
  { symbol: 'IOLDOLD', name: 'IOL Dólar' },
  { symbol: 'CONIOLA', name: 'Consultatio IOL' },
];

export function searchFciCatalog(query: string, max = 12): FciCatalogEntry[] {
  const q = query.trim().toUpperCase();
  if (!q) return FCI_CATALOG.slice(0, max);
  const startsWith: FciCatalogEntry[] = [];
  const contains: FciCatalogEntry[] = [];
  for (const entry of FCI_CATALOG) {
    const symbol = entry.symbol.toUpperCase();
    const name = entry.name.toUpperCase();
    if (symbol === q || symbol.startsWith(q) || name.startsWith(q)) {
      startsWith.push(entry);
    } else if (symbol.includes(q) || name.includes(q)) {
      contains.push(entry);
    }
    if (startsWith.length >= max) break;
  }
  return [...startsWith, ...contains].slice(0, max);
}

/** IOL fund class tickers look like IOLCAMA / IOLDOLD, not listed stocks. */
export function looksLikeIolFciTicker(ticker: string): boolean {
  return /^IOL[A-Z0-9]{3,}$/.test(ticker.trim().toUpperCase());
}
