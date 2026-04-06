export interface StockQuote {
  ticker: string;
  name: string;
  price: number;
  change: number;
  changePct: number;
  currency: string;
  /** INDEX = índice (^IXIC, ^MERV); EQUITY = acción */
  instrumentType?: 'INDEX' | 'EQUITY' | string;
  /** Logo en CDN de Yahoo (`s.yimg.com`); no siempre viene (p. ej. índices o algunos BYMA). */
  logoUrl?: string;
}

export interface CryptoQuote {
  id: string;
  symbol: string;
  name: string;
  price: number;
  change24h: number;
  marketCap: number;
  image: string;
}

export interface MarketStaleFlags {
  crypto: boolean;
  usStocks: boolean;
  argStocks: boolean;
}

export interface MarketSectionTimes {
  crypto?: string;
  usStocks?: string;
  argStocks?: string;
}

/** Respuesta de `/api/market-data` + caché local. */
export interface MarketDataClient {
  crypto: CryptoQuote[];
  usStocks: StockQuote[];
  argStocks: StockQuote[];
  fetchedAt: string;
  stale?: MarketStaleFlags;
  sectionTimes?: MarketSectionTimes;
}
