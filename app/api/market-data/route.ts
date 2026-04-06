import { NextResponse } from 'next/server';
import { createServiceClientSync } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
// Cache for 5 minutes on Vercel edge
export const revalidate = 300;
/** Paralelismo + caché rápida; Pro puede usar más tiempo si hace falta. */
export const maxDuration = 25;

/** Si la fila en DB tiene menos de esto, devolvemos sin pegarle a Yahoo/CoinGecko (evita timeout en Vercel). */
const SERVER_CACHE_TTL_MS = 3 * 60 * 1000;

/** Nasdaq Composite + blue chips (el índice va primero para que siempre destaque). */
const US_TICKERS = ['^IXIC', 'AAPL', 'NVDA', 'MSFT', 'AMZN', 'GOOGL'];
/** MERVAL + líderes del panel (Buenos Aires). */
const ARG_TICKERS = ['^MERV', 'GGAL.BA', 'YPFD.BA', 'PAMP.BA', 'BMA.BA', 'TXAR.BA'];

const YAHOO_CHART_HOSTS = ['query1.finance.yahoo.com', 'query2.finance.yahoo.com'] as const;

const YAHOO_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'application/json',
  'Accept-Language': 'en-US,en;q=0.9',
};

interface StockQuote {
  ticker: string;
  name: string;
  price: number;
  change: number;
  changePct: number;
  currency: string;
  instrumentType?: 'INDEX' | 'EQUITY' | string;
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

function resolveCurrency(symbol: string, metaCurrency: string | undefined): string {
  if (metaCurrency && metaCurrency.length > 0) return metaCurrency;
  if (symbol === '^MERV') return 'PTS';
  if (symbol.endsWith('.BA')) return 'ARS';
  return 'USD';
}

/** Una petición por host, timeout corto — en serverless el tiempo total importa más que reintentos largos. */
async function fetchYahooChartQuote(symbol: string): Promise<StockQuote | null> {
  const encoded = encodeURIComponent(symbol);

  for (const host of YAHOO_CHART_HOSTS) {
    const url = `https://${host}/v8/finance/chart/${encoded}?range=1d&interval=1d`;
    try {
      const res = await fetch(url, {
        headers: YAHOO_HEADERS,
        cache: 'no-store',
        signal: AbortSignal.timeout(4500),
      });

      if (!res.ok) continue;

      const ct = res.headers.get('content-type') || '';
      if (!ct.includes('json')) continue;

      const data = await res.json();
      const result = data?.chart?.result?.[0];
      const meta = result?.meta;
      const quote = result?.indicators?.quote?.[0];

      const closes: number[] = Array.isArray(quote?.close) ? quote.close.filter((v: any) => Number.isFinite(v)) : [];
      const lastClose = closes.length > 0 ? Number(closes[closes.length - 1]) : 0;
      const price = Number(meta?.regularMarketPrice || lastClose || meta?.previousClose || meta?.chartPreviousClose || 0);
      if (!price || !Number.isFinite(price)) continue;

      const prev = Number(meta?.chartPreviousClose || meta?.previousClose || lastClose || 0);
      const change = price - prev;
      const changePct = prev > 0 ? (change / prev) * 100 : 0;

      const instrumentType = meta?.instrumentType === 'INDEX' ? 'INDEX' : 'EQUITY';
      const name =
        (meta?.shortName as string | undefined) ||
        (meta?.longName as string | undefined) ||
        (meta?.symbol as string | undefined) ||
        symbol;

      return {
        ticker: symbol,
        name,
        price,
        change,
        changePct,
        currency: resolveCurrency(symbol, meta?.currency as string | undefined),
        instrumentType,
      };
    } catch {
      /* timeout / red */
    }
  }

  return null;
}

/** Cotizaciones en paralelo (una Promise por símbolo) para caber en el límite de Vercel. */
async function fetchYahooQuotesParallel(tickers: string[]): Promise<StockQuote[]> {
  const settled = await Promise.all(tickers.map((t) => fetchYahooChartQuote(t)));
  return settled.filter((q): q is StockQuote => q !== null);
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

function normalizeStoredPayload(raw: unknown): MarketPayloadStored | null {
  if (!raw || typeof raw !== 'object') return null;
  const p = raw as MarketPayloadStored;
  return {
    crypto: Array.isArray(p.crypto) ? p.crypto : [],
    usStocks: Array.isArray(p.usStocks) ? p.usStocks : [],
    argStocks: Array.isArray(p.argStocks) ? p.argStocks : [],
    sectionTimes: p.sectionTimes,
  };
}

function payloadHasAnyData(p: MarketPayloadStored): boolean {
  return p.crypto.length > 0 || p.usStocks.length > 0 || p.argStocks.length > 0;
}

async function loadCachedRow(): Promise<{
  payload: MarketPayloadStored;
  updated_at: string;
} | null> {
  try {
    const supabase = createServiceClientSync();
    const { data, error } = await supabase
      .from('market_data_cache')
      .select('payload, updated_at')
      .eq('id', 1)
      .maybeSingle();
    if (error || !data?.payload || !data.updated_at) return null;
    const payload = normalizeStoredPayload(data.payload);
    if (!payload || !payloadHasAnyData(payload)) return null;
    return { payload, updated_at: data.updated_at as string };
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
    signal: AbortSignal.timeout(5000),
  });

  if (!res.ok) return [];

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

function jsonResponse(
  body: {
    crypto: CryptoQuote[];
    usStocks: StockQuote[];
    argStocks: StockQuote[];
    fetchedAt: string;
    stale: { crypto: boolean; usStocks: boolean; argStocks: boolean };
    sectionTimes: NonNullable<MarketPayloadStored['sectionTimes']>;
  },
  opts?: { cacheHeader?: 'hit' | 'miss'; status?: number }
) {
  return NextResponse.json(body, {
    status: opts?.status ?? 200,
    headers: {
      'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=30',
      ...(opts?.cacheHeader ? { 'x-zarix-market-cache': opts.cacheHeader } : {}),
    },
  });
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const forceRefresh = searchParams.get('refresh') === '1';

  const cachedRow = await loadCachedRow();
  const cachedPayload = cachedRow?.payload ?? null;

  if (
    !forceRefresh &&
    cachedRow &&
    Date.now() - new Date(cachedRow.updated_at).getTime() < SERVER_CACHE_TTL_MS
  ) {
    const st = cachedRow.payload.sectionTimes ?? {};
    return jsonResponse(
      {
        crypto: cachedRow.payload.crypto,
        usStocks: cachedRow.payload.usStocks,
        argStocks: cachedRow.payload.argStocks,
        fetchedAt: cachedRow.updated_at,
        stale: { crypto: false, usStocks: false, argStocks: false },
        sectionTimes: {
          crypto: st.crypto ?? cachedRow.updated_at,
          usStocks: st.usStocks ?? cachedRow.updated_at,
          argStocks: st.argStocks ?? cachedRow.updated_at,
        },
      },
      { cacheHeader: 'hit' }
    );
  }

  const [crypto, usStocks, argStocks] = await Promise.all([
    fetchCryptoTop5(),
    fetchYahooQuotesParallel(US_TICKERS),
    fetchYahooQuotesParallel(ARG_TICKERS),
  ]);

  const nowIso = new Date().toISOString();
  const merged = mergeWithCache({ crypto, usStocks, argStocks }, cachedPayload, nowIso);

  const payloadToStore: MarketPayloadStored = {
    crypto: merged.crypto,
    usStocks: merged.usStocks,
    argStocks: merged.argStocks,
    sectionTimes: merged.sectionTimes,
  };

  const hasAnyData = payloadHasAnyData(payloadToStore);
  if (hasAnyData) {
    void saveMergedPayload(payloadToStore);
  }

  return jsonResponse(
    {
      crypto: merged.crypto,
      usStocks: merged.usStocks,
      argStocks: merged.argStocks,
      fetchedAt: nowIso,
      stale: merged.stale,
      sectionTimes: merged.sectionTimes,
    },
    { cacheHeader: 'miss' }
  );
}
