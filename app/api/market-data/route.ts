import { NextResponse } from 'next/server';
import { createServiceClientSync } from '@/lib/supabase/server';
import type { StockQuote } from '@/lib/market-data-types';
import { fetchStooqUsQuote } from '@/lib/stooq-us-quote';
import { fetchYahooStockQuotesMap, orderedStockQuotesFromMap } from '@/lib/yahoo-finance-quotes';

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

interface CryptoQuote {
  id: string;
  symbol: string;
  name: string;
  price: number;
  change24h: number;
  marketCap: number;
  image: string;
}

async function fetchStockQuotesSequential(
  tickers: string[],
  opts: { stooqFallback: boolean }
): Promise<StockQuote[]> {
  const yahooMap = await fetchYahooStockQuotesMap(tickers);
  let ordered = orderedStockQuotesFromMap(tickers, yahooMap);

  if (!opts.stooqFallback) return ordered;

  const have = new Set(ordered.map((q) => q.ticker));
  const extra: StockQuote[] = [];
  for (const t of tickers) {
    if (have.has(t)) continue;
    const stooq = await fetchStooqUsQuote(t);
    if (stooq) extra.push(stooq);
  }
  if (extra.length === 0) return ordered;

  const byTicker = new Map<string, StockQuote>();
  for (const q of ordered) byTicker.set(q.ticker, q);
  for (const q of extra) byTicker.set(q.ticker, q);
  ordered = tickers.map((t) => byTicker.get(t)).filter((q): q is StockQuote => Boolean(q));
  return ordered;
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
    fetchStockQuotesSequential(US_TICKERS, { stooqFallback: true }),
    fetchStockQuotesSequential(ARG_TICKERS, { stooqFallback: false }),
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
