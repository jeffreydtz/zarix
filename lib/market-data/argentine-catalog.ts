/**
 * Catálogo curado de instrumentos argentinos clásicos.
 * Red de seguridad para búsquedas cuando data912/Yahoo no devuelven match.
 * Cubre: panel líder Merval, top CEDEARs, bonos soberanos hard-dollar y ley local.
 */

export interface CatalogEntry {
  symbol: string;
  name: string;
  type: 'stock_arg' | 'cedear' | 'bond';
}

export const ARG_STOCK_CATALOG: CatalogEntry[] = [
  { symbol: 'GGAL', name: 'Grupo Financiero Galicia', type: 'stock_arg' },
  { symbol: 'YPFD', name: 'YPF', type: 'stock_arg' },
  { symbol: 'PAMP', name: 'Pampa Energía', type: 'stock_arg' },
  { symbol: 'BMA', name: 'Banco Macro', type: 'stock_arg' },
  { symbol: 'BBAR', name: 'BBVA Argentina', type: 'stock_arg' },
  { symbol: 'SUPV', name: 'Grupo Supervielle', type: 'stock_arg' },
  { symbol: 'ALUA', name: 'Aluar', type: 'stock_arg' },
  { symbol: 'TXAR', name: 'Ternium Argentina', type: 'stock_arg' },
  { symbol: 'TGNO4', name: 'Transportadora de Gas del Norte', type: 'stock_arg' },
  { symbol: 'TGSU2', name: 'Transportadora de Gas del Sur', type: 'stock_arg' },
  { symbol: 'TRAN', name: 'Transener', type: 'stock_arg' },
  { symbol: 'EDN', name: 'Edenor', type: 'stock_arg' },
  { symbol: 'CEPU', name: 'Central Puerto', type: 'stock_arg' },
  { symbol: 'TECO2', name: 'Telecom Argentina', type: 'stock_arg' },
  { symbol: 'CVH', name: 'Cablevisión Holding', type: 'stock_arg' },
  { symbol: 'MIRG', name: 'Mirgor', type: 'stock_arg' },
  { symbol: 'CRES', name: 'Cresud', type: 'stock_arg' },
  { symbol: 'IRSA', name: 'IRSA', type: 'stock_arg' },
  { symbol: 'COME', name: 'Sociedad Comercial del Plata', type: 'stock_arg' },
  { symbol: 'LOMA', name: 'Loma Negra', type: 'stock_arg' },
  { symbol: 'VALO', name: 'Banco de Valores', type: 'stock_arg' },
  { symbol: 'BHIP', name: 'Banco Hipotecario', type: 'stock_arg' },
  { symbol: 'BYMA', name: 'Bolsas y Mercados Argentinos', type: 'stock_arg' },
  { symbol: 'AGRO', name: 'Agrometal', type: 'stock_arg' },
  { symbol: 'CARC', name: 'Carboclor', type: 'stock_arg' },
  { symbol: 'CELU', name: 'Celulosa Argentina', type: 'stock_arg' },
  { symbol: 'GARO', name: 'Garovaglio y Zorraquín', type: 'stock_arg' },
  { symbol: 'GBAN', name: 'Gas Natural Ban', type: 'stock_arg' },
  { symbol: 'HARG', name: 'Holcim Argentina', type: 'stock_arg' },
  { symbol: 'METR', name: 'MetroGas', type: 'stock_arg' },
  { symbol: 'MORI', name: 'Morixe', type: 'stock_arg' },
  { symbol: 'OEST', name: 'Oeste', type: 'stock_arg' },
  { symbol: 'PATA', name: 'Importadora y Exportadora de la Patagonia', type: 'stock_arg' },
  { symbol: 'POLL', name: 'Polledo', type: 'stock_arg' },
  { symbol: 'RICH', name: 'Laboratorios Richmond', type: 'stock_arg' },
  { symbol: 'ROSE', name: 'Instituto Rosenbusch', type: 'stock_arg' },
  { symbol: 'SAMI', name: 'San Miguel', type: 'stock_arg' },
  { symbol: 'SEMI', name: 'Molinos Juan Semino', type: 'stock_arg' },
  { symbol: 'CTIO', name: 'Consultatio', type: 'stock_arg' },
  { symbol: 'DGCU2', name: 'Distribuidora de Gas Cuyana', type: 'stock_arg' },
  { symbol: 'DYCA', name: 'Dycasa', type: 'stock_arg' },
  { symbol: 'FERR', name: 'Ferrum', type: 'stock_arg' },
  { symbol: 'FIPL', name: 'Fiplasto', type: 'stock_arg' },
  { symbol: 'GRIM', name: 'Grimoldi', type: 'stock_arg' },
  { symbol: 'INTR', name: 'Compañía Introductora de Buenos Aires', type: 'stock_arg' },
  { symbol: 'INVJ', name: 'Inversora Juramento', type: 'stock_arg' },
  { symbol: 'LEDE', name: 'Ledesma', type: 'stock_arg' },
  { symbol: 'LONG', name: 'Longvie', type: 'stock_arg' },
  { symbol: 'MOLA', name: 'Molinos Agro', type: 'stock_arg' },
  { symbol: 'MOLI', name: 'Molinos Río de la Plata', type: 'stock_arg' },
];

export const CEDEAR_CATALOG: CatalogEntry[] = [
  { symbol: 'AAPL', name: 'Apple', type: 'cedear' },
  { symbol: 'MSFT', name: 'Microsoft', type: 'cedear' },
  { symbol: 'NVDA', name: 'NVIDIA', type: 'cedear' },
  { symbol: 'GOOGL', name: 'Alphabet', type: 'cedear' },
  { symbol: 'AMZN', name: 'Amazon', type: 'cedear' },
  { symbol: 'META', name: 'Meta Platforms', type: 'cedear' },
  { symbol: 'TSLA', name: 'Tesla', type: 'cedear' },
  { symbol: 'NFLX', name: 'Netflix', type: 'cedear' },
  { symbol: 'DIS', name: 'Disney', type: 'cedear' },
  { symbol: 'KO', name: 'Coca-Cola', type: 'cedear' },
  { symbol: 'PEP', name: 'PepsiCo', type: 'cedear' },
  { symbol: 'MCD', name: "McDonald's", type: 'cedear' },
  { symbol: 'SBUX', name: 'Starbucks', type: 'cedear' },
  { symbol: 'NKE', name: 'Nike', type: 'cedear' },
  { symbol: 'JNJ', name: 'Johnson & Johnson', type: 'cedear' },
  { symbol: 'PFE', name: 'Pfizer', type: 'cedear' },
  { symbol: 'V', name: 'Visa', type: 'cedear' },
  { symbol: 'MA', name: 'Mastercard', type: 'cedear' },
  { symbol: 'JPM', name: 'JPMorgan Chase', type: 'cedear' },
  { symbol: 'BAC', name: 'Bank of America', type: 'cedear' },
  { symbol: 'GS', name: 'Goldman Sachs', type: 'cedear' },
  { symbol: 'WMT', name: 'Walmart', type: 'cedear' },
  { symbol: 'COST', name: 'Costco', type: 'cedear' },
  { symbol: 'HD', name: 'Home Depot', type: 'cedear' },
  { symbol: 'BABA', name: 'Alibaba', type: 'cedear' },
  { symbol: 'MELI', name: 'MercadoLibre', type: 'cedear' },
  { symbol: 'GLOB', name: 'Globant', type: 'cedear' },
  { symbol: 'VIST', name: 'Vista Energy', type: 'cedear' },
  { symbol: 'YPF', name: 'YPF ADR', type: 'cedear' },
  { symbol: 'TXR', name: 'Ternium ADR', type: 'cedear' },
  { symbol: 'BRKB', name: 'Berkshire Hathaway B', type: 'cedear' },
  { symbol: 'XOM', name: 'Exxon Mobil', type: 'cedear' },
  { symbol: 'CVX', name: 'Chevron', type: 'cedear' },
  { symbol: 'INTC', name: 'Intel', type: 'cedear' },
  { symbol: 'AMD', name: 'AMD', type: 'cedear' },
  { symbol: 'BA', name: 'Boeing', type: 'cedear' },
  { symbol: 'GE', name: 'General Electric', type: 'cedear' },
  { symbol: 'F', name: 'Ford', type: 'cedear' },
  { symbol: 'GM', name: 'General Motors', type: 'cedear' },
  { symbol: 'PYPL', name: 'PayPal', type: 'cedear' },
  { symbol: 'SHOP', name: 'Shopify', type: 'cedear' },
  { symbol: 'UBER', name: 'Uber', type: 'cedear' },
  { symbol: 'ABNB', name: 'Airbnb', type: 'cedear' },
  { symbol: 'COIN', name: 'Coinbase', type: 'cedear' },
  { symbol: 'PLTR', name: 'Palantir', type: 'cedear' },
  { symbol: 'SPY', name: 'S&P 500 ETF', type: 'cedear' },
  { symbol: 'QQQ', name: 'Nasdaq 100 ETF', type: 'cedear' },
  { symbol: 'EWZ', name: 'iShares Brazil ETF', type: 'cedear' },
  { symbol: 'TSM', name: 'Taiwan Semiconductor', type: 'cedear' },
  { symbol: 'AVGO', name: 'Broadcom', type: 'cedear' },
];

export const BOND_CATALOG: CatalogEntry[] = [
  { symbol: 'AL29', name: 'Bonar 2029 (Ley Local USD)', type: 'bond' },
  { symbol: 'AL30', name: 'Bonar 2030 (Ley Local USD)', type: 'bond' },
  { symbol: 'AL35', name: 'Bonar 2035 (Ley Local USD)', type: 'bond' },
  { symbol: 'AL41', name: 'Bonar 2041 (Ley Local USD)', type: 'bond' },
  { symbol: 'AE38', name: 'Bonar 2038 (Ley Local USD)', type: 'bond' },
  { symbol: 'GD29', name: 'Global 2029 (Ley NY USD)', type: 'bond' },
  { symbol: 'GD30', name: 'Global 2030 (Ley NY USD)', type: 'bond' },
  { symbol: 'GD35', name: 'Global 2035 (Ley NY USD)', type: 'bond' },
  { symbol: 'GD38', name: 'Global 2038 (Ley NY USD)', type: 'bond' },
  { symbol: 'GD41', name: 'Global 2041 (Ley NY USD)', type: 'bond' },
  { symbol: 'GD46', name: 'Global 2046 (Ley NY USD)', type: 'bond' },
  { symbol: 'AL30D', name: 'Bonar 2030 USD MEP', type: 'bond' },
  { symbol: 'AL30C', name: 'Bonar 2030 USD CCL', type: 'bond' },
  { symbol: 'GD30D', name: 'Global 2030 USD MEP', type: 'bond' },
  { symbol: 'GD30C', name: 'Global 2030 USD CCL', type: 'bond' },
  { symbol: 'TX26', name: 'Boncer 2026 (CER)', type: 'bond' },
  { symbol: 'TX28', name: 'Boncer 2028 (CER)', type: 'bond' },
  { symbol: 'T2X4', name: 'Boncer T2X4', type: 'bond' },
  { symbol: 'TZX25', name: 'Boncer CER 2025', type: 'bond' },
  { symbol: 'TZX26', name: 'Boncer CER 2026', type: 'bond' },
  { symbol: 'TZX27', name: 'Boncer CER 2027', type: 'bond' },
  { symbol: 'PARP', name: 'Par (ARS)', type: 'bond' },
  { symbol: 'PARY', name: 'Par (USD NY)', type: 'bond' },
  { symbol: 'DICP', name: 'Discount (ARS)', type: 'bond' },
  { symbol: 'DICY', name: 'Discount (USD NY)', type: 'bond' },
  { symbol: 'S31E5', name: 'Lecap Enero 2025', type: 'bond' },
  { symbol: 'S28F5', name: 'Lecap Febrero 2025', type: 'bond' },
  { symbol: 'S31M5', name: 'Lecap Marzo 2025', type: 'bond' },
];

const CATALOG_BY_TYPE: Record<CatalogEntry['type'], CatalogEntry[]> = {
  stock_arg: ARG_STOCK_CATALOG,
  cedear: CEDEAR_CATALOG,
  bond: BOND_CATALOG,
};

export function searchCatalog(type: CatalogEntry['type'], query: string, max = 12): CatalogEntry[] {
  const list = CATALOG_BY_TYPE[type] || [];
  const q = query.trim().toUpperCase();
  if (!q) return list.slice(0, max);
  const startsWith: CatalogEntry[] = [];
  const contains: CatalogEntry[] = [];
  for (const entry of list) {
    const sym = entry.symbol.toUpperCase();
    const name = entry.name.toUpperCase();
    if (sym.startsWith(q) || name.startsWith(q)) {
      startsWith.push(entry);
    } else if (sym.includes(q) || name.includes(q)) {
      contains.push(entry);
    }
    if (startsWith.length >= max) break;
  }
  return [...startsWith, ...contains].slice(0, max);
}

export function catalogLookup(type: CatalogEntry['type'], symbol: string): CatalogEntry | null {
  const list = CATALOG_BY_TYPE[type] || [];
  const upper = symbol.toUpperCase();
  return list.find((e) => e.symbol.toUpperCase() === upper) || null;
}
