import { NextResponse } from 'next/server';
import { createServiceClientSync } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
// Cache for 5 minutes on Vercel edge
export const revalidate = 300;

const US_TICKERS = ['AAPL', 'NVDA', 'MSFT', 'AMZN', 'GOOGL'];
const ARG_TICKERS = ['GGAL.BA', 'YPFD.BA', 'PAMP.BA', 'BMA.BA', 'TXAR.BA'];

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

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchYahooChartQuote(symbol: string): Promise<StockQuote | null> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=1d`;

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, {
        headers: YAHOO_HEADERS,
        cache: 'no-store',
      });

      if (!res.ok) {
        // Retry on temporary errors/rate limits
        if (res.status === 429 || res.status >= 500) {
          await sleep(150 * (attempt + 1));
          continue;
        }
        return null;
      }

      const data = await res.json();
      const result = data?.chart?.result?.[0];
      const meta = result?.meta;
      const quote = result?.indicators?.quote?.[0];

      // Yahoo no siempre envía regularMarketPrice (depende del horario/mercado).
      // Fallback robusto: regularMarketPrice -> close[-1] -> previousClose.
      const closes: number[] = Array.isArray(quote?.close) ? quote.close.filter((v: any) => Number.isFinite(v)) : [];
      const lastClose = closes.length > 0 ? Number(closes[closes.length - 1]) : 0;
      const price = Number(meta?.regularMarketPrice || lastClose || meta?.previousClose || meta?.chartPreviousClose || 0);
      if (!price || !Number.isFinite(price)) return null;

      const prev = Number(meta?.chartPreviousClose || meta?.previousClose || lastClose || 0);
      const change = price - prev;
      const changePct = prev > 0 ? (change / prev) * 100 : 0;

      return {
        ticker: symbol,
        name: meta?.symbol || symbol,
        price,
        change,
        changePct,
        currency: meta?.currency || (symbol.endsWith('.BA') ? 'ARS' : 'USD'),
      };
    } catch {
      await sleep(150 * (attempt + 1));
    }
  }

  return null;
}

async function fetchYahooQuotesWithFallback(tickers: string[]): Promise<StockQuote[]> {
  // Sequential fetch avoids Yahoo temporary throttling that can leave only 1 symbol loaded.
  const results: StockQuote[] = [];
  for (const ticker of tickers) {
    const quote = await fetchYahooChartQuote(ticker);
    if (quote) results.push(quote);
    await sleep(80);
  }
  return results;
}

interface MarketPayloadStored {
  crypto: CryptoQuote[];
  usStocks: StockQuote[];
  argStocks: StockQuote[];
  /** ISO: última vez que cada bloque se actualizó con datos “en vivo”. */
  sectionTimes?: {
    crypto?: string;
    usStocks?: string;
    argStocks?: string;
  };
}

async function loadCachedPayload(): Promise<MarketPayloadStored | null> {
  try {
    const supabase = createServiceClientSync();
    const { data, error } = await supabase
      .from('market_data_cache')
      .select('payload')
      .eq('id', 1)
      .maybeSingle();
    if (error || !data?.payload) return null;
    const p = data.payload as MarketPayloadStored;
    if (!p || typeof p !== 'object') return null;
    return {
      crypto: Array.isArray(p.crypto) ? p.crypto : [],
      usStocks: Array.isArray(p.usStocks) ? p.usStocks : [],
      argStocks: Array.isArray(p.argStocks) ? p.argStocks : [],
      sectionTimes: p.sectionTimes,
    };
  } catch {
    return null;
  }
}

async function saveMergedPayload(payload: MarketPayloadStored): Promise<void> {
  try {
    const supabase = createServiceClientSync();
    await supabase.from('market_data_cache').upsert(
      {
        id: 1,
        payload,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' }
    );
  } catch {
    /* tabla ausente o sin permisos: la UI puede usar caché local */
  }
}

function mergeWithCache(
  live: { crypto: CryptoQuote[]; usStocks: StockQuote[]; argStocks: StockQuote[] },
  cached: MarketPayloadStored | null,
  nowIso: string
): {
  crypto: CryptoQuote[];
  usStocks: StockQuote[];
  argStocks: StockQuote[];
  stale: { crypto: boolean; usStocks: boolean; argStocks: boolean };
  sectionTimes: NonNullable<MarketPayloadStored['sectionTimes']>;
} {
  const stale = { crypto: false, usStocks: false, argStocks: false };

  let crypto = live.crypto;
  if (!crypto.length && cached?.crypto?.length) {
    crypto = cached.crypto;
    stale.crypto = true;
  }

  let usStocks = live.usStocks;
  if (!usStocks.length && cached?.usStocks?.length) {
    usStocks = cached.usStocks;
    stale.usStocks = true;
  }

  let argStocks = live.argStocks;
  if (!argStocks.length && cached?.argStocks?.length) {
    argStocks = cached.argStocks;
    stale.argStocks = true;
  }

  const sectionTimes = {
    crypto: stale.crypto ? cached?.sectionTimes?.crypto ?? nowIso : nowIso,
    usStocks: stale.usStocks ? cached?.sectionTimes?.usStocks ?? nowIso : nowIso,
    argStocks: stale.argStocks ? cached?.sectionTimes?.argStocks ?? nowIso : nowIso,
  };

  return { crypto, usStocks, argStocks, stale, sectionTimes };
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
  const cached = await loadCachedPayload();

  const results = await Promise.allSettled([
    fetchCryptoTop5(),
    fetchYahooQuotesWithFallback(US_TICKERS),
    fetchYahooQuotesWithFallback(ARG_TICKERS),
  ]);

  const crypto = results[0].status === 'fulfilled' ? results[0].value : [];
  const usStocks = results[1].status === 'fulfilled' ? results[1].value : [];
  const argStocks = results[2].status === 'fulfilled' ? results[2].value : [];

  const nowIso = new Date().toISOString();
  const merged = mergeWithCache({ crypto, usStocks, argStocks }, cached, nowIso);

  const payloadToStore: MarketPayloadStored = {
    crypto: merged.crypto,
    usStocks: merged.usStocks,
    argStocks: merged.argStocks,
    sectionTimes: merged.sectionTimes,
  };

  const hasAnyData =
    payloadToStore.crypto.length > 0 ||
    payloadToStore.usStocks.length > 0 ||
    payloadToStore.argStocks.length > 0;
  if (hasAnyData) {
    await saveMergedPayload(payloadToStore);
  }

  return NextResponse.json(
    {
      crypto: merged.crypto,
      usStocks: merged.usStocks,
      argStocks: merged.argStocks,
      fetchedAt: nowIso,
      stale: merged.stale,
      sectionTimes: merged.sectionTimes,
    },
    {
      headers: {
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=30',
      },
    }
  );
}
