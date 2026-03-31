import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
// Cache for 5 minutes on Vercel edge
export const revalidate = 300;

const US_TICKERS = ['AAPL', 'NVDA', 'MSFT', 'AMZN', 'GOOGL'];
const ARG_TICKERS = ['GGAL.BA', 'YPF.BA', 'PAMP.BA', 'BMA.BA', 'TXAR.BA'];

const YAHOO_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'application/json',
  'Accept-Language': 'en-US,en;q=0.9',
};

interface StockQuote {
  ticker: string;
  name: string;
  price: number;
  change: number;
  changePct: number;
  currency: string;
}

interface CryptoQuote {
  id: string;
  symbol: string;
  name: string;
  price: number;
  change24h: number;
  marketCap: number;
  image: string;
}

async function fetchYahooQuotes(tickers: string[]): Promise<StockQuote[]> {
  const symbols = tickers.join(',');
  const url = `https://query2.finance.yahoo.com/v7/finance/quote?symbols=${symbols}&fields=regularMarketPrice,regularMarketChange,regularMarketChangePercent,shortName,currency`;

  const res = await fetch(url, {
    headers: YAHOO_HEADERS,
    next: { revalidate: 300 },
  });

  if (!res.ok) throw new Error(`Yahoo fetch failed: ${res.status}`);

  const data = await res.json();
  const quotes = data?.quoteResponse?.result || [];

  return quotes.map((q: any) => ({
    ticker: q.symbol,
    name: q.shortName || q.symbol,
    price: q.regularMarketPrice ?? 0,
    change: q.regularMarketChange ?? 0,
    changePct: q.regularMarketChangePercent ?? 0,
    currency: q.currency || 'USD',
  }));
}

async function fetchCryptoTop5(): Promise<CryptoQuote[]> {
  const url =
    'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=5&page=1&sparkline=false&price_change_percentage=24h';

  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
    next: { revalidate: 300 },
  });

  if (!res.ok) throw new Error(`CoinGecko fetch failed: ${res.status}`);

  const data: any[] = await res.json();

  return data.map((c) => ({
    id: c.id,
    symbol: c.symbol.toUpperCase(),
    name: c.name,
    price: c.current_price,
    change24h: c.price_change_percentage_24h ?? 0,
    marketCap: c.market_cap,
    image: c.image,
  }));
}

export async function GET() {
  const results = await Promise.allSettled([
    fetchCryptoTop5(),
    fetchYahooQuotes(US_TICKERS),
    fetchYahooQuotes(ARG_TICKERS),
  ]);

  const crypto = results[0].status === 'fulfilled' ? results[0].value : [];
  const usStocks = results[1].status === 'fulfilled' ? results[1].value : [];
  const argStocks = results[2].status === 'fulfilled' ? results[2].value : [];

  return NextResponse.json(
    { crypto, usStocks, argStocks, fetchedAt: new Date().toISOString() },
    {
      headers: {
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=60',
      },
    }
  );
}
