import { NextResponse } from 'next/server';
import { createClient, createServiceClientSync } from '@/lib/supabase/server';
import type { StockQuote } from '@/lib/market-data-types';
import { fetchStooqUsQuote } from '@/lib/stooq-us-quote';
import { fetchYahooStockQuotesMap, orderedStockQuotesFromMap } from '@/lib/yahoo-finance-quotes';
import { fetchArgStocks } from '@/lib/market-data/data912-client';
import { mapConcurrent, singleFlight } from '@/lib/market-data/requests';
import { cachedStaleFlags, mergeWithCache, normalizeStoredPayload, payloadHasAnyData, type MarketPayloadStored } from '@/lib/market-data/cache';

export const dynamic = 'force-dynamic';
// Caché de los fetches de proveedores; la respuesta autenticada es privada.
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

async function fetchStockQuotes(
  tickers: string[],
  opts: { stooqFallback: boolean }
): Promise<StockQuote[]> {
  const [yahooMap, argQuotes] = await Promise.all([
    fetchYahooStockQuotesMap(tickers),
    opts.stooqFallback ? Promise.resolve([]) : fetchArgStocks(),
  ]);
  for (const q of argQuotes) {
    const ticker = `${q.symbol}.BA`;
    if (!tickers.includes(ticker) || yahooMap.has(ticker)) continue;
    const pct = q.changePct ?? 0;
    const previous = 1 + pct / 100 > 0 ? q.price / (1 + pct / 100) : q.price;
    yahooMap.set(ticker, { ticker, name: q.symbol, price: q.price, change: q.price - previous, changePct: pct, currency: q.currency, instrumentType: 'EQUITY', source: 'data912', observedAt: q.observedAt, stale: q.stale });
  }
  let ordered = orderedStockQuotesFromMap(tickers, yahooMap);

  if (!opts.stooqFallback) return ordered;

  const have = new Set(ordered.map((q) => q.ticker));
  const fallback = await mapConcurrent(tickers.filter((t) => !have.has(t)), 3, fetchStooqUsQuote);
  const extra = fallback.filter((q): q is StockQuote => q !== null);
  if (extra.length === 0) return ordered;

  const byTicker = new Map<string, StockQuote>();
  for (const q of ordered) byTicker.set(q.ticker, q);
  for (const q of extra) byTicker.set(q.ticker, q);
  ordered = tickers.map((t) => byTicker.get(t)).filter((q): q is StockQuote => Boolean(q));
  return ordered;
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
      .abortSignal(AbortSignal.timeout(2000))
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
    ).abortSignal(AbortSignal.timeout(2000));
  } catch {
    /* tabla ausente o sin permisos: la UI puede usar caché local */
  }
}

async function fetchCryptoTop5(): Promise<CryptoQuote[]> {
  const url =
    'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=5&page=1&sparkline=false&price_change_percentage=24h';

  // Un timeout/red caída de CoinGecko no debe tirar todo el endpoint (mismo
  // criterio que el fallback de stooq): devolver [] y que mergeWithCache use la caché.
  try {
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
      next: { revalidate: 300 },
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) return [];

    const data: unknown = await res.json();
    if (!Array.isArray(data)) return [];
    return data.filter((c) => c && typeof c.id === 'string' && typeof c.symbol === 'string' && Number.isFinite(c.current_price) && c.current_price > 0).slice(0, 5).map((c) => ({
      id: c.id,
      symbol: c.symbol.toUpperCase(),
      name: c.name,
      price: c.current_price,
      change24h: Number.isFinite(c.price_change_percentage_24h) ? c.price_change_percentage_24h : 0,
      marketCap: Number.isFinite(c.market_cap) ? c.market_cap : 0,
      image: typeof c.image === 'string' ? c.image : '',
    }));
  } catch (error) {
    console.error('Error fetching crypto top 5:', error);
    return [];
  }
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
      'Cache-Control': 'private, no-store',
      ...(opts?.cacheHeader ? { 'x-zarix-market-cache': opts.cacheHeader } : {}),
    },
  });
}

export async function GET(request: Request) {
  const supabaseAuth = await createClient();
  const {
    data: { user },
  } = await supabaseAuth.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const forceRefresh = searchParams.get('refresh') === '1';

  const cachedRow = await loadCachedRow();
  const cachedPayload = cachedRow?.payload ?? null;

  if (
    cachedRow &&
    Date.now() - new Date(cachedRow.updated_at).getTime() < (forceRefresh ? 30_000 : SERVER_CACHE_TTL_MS)
  ) {
    const st = cachedRow.payload.sectionTimes ?? {};
    return jsonResponse(
      {
        crypto: cachedRow.payload.crypto,
        usStocks: cachedRow.payload.usStocks,
        argStocks: cachedRow.payload.argStocks,
        fetchedAt: cachedRow.updated_at,
        stale: cachedStaleFlags(cachedRow.payload, cachedRow.updated_at),
        sectionTimes: {
          crypto: st.crypto ?? cachedRow.updated_at,
          usStocks: st.usStocks ?? cachedRow.updated_at,
          argStocks: st.argStocks ?? cachedRow.updated_at,
        },
      },
      { cacheHeader: 'hit' }
    );
  }

  const result = await singleFlight('market-data:refresh', async () => {
    const [crypto, usStocks, argStocks] = await Promise.all([
      fetchCryptoTop5(),
      fetchStockQuotes(US_TICKERS, { stooqFallback: true }),
      fetchStockQuotes(ARG_TICKERS, { stooqFallback: false }),
    ]);

    const nowIso = new Date().toISOString();
    const merged = mergeWithCache({ crypto, usStocks, argStocks }, cachedPayload, nowIso);
    merged.stale.usStocks ||= US_TICKERS.some((ticker) => !usStocks.some((q) => q.ticker === ticker));
    merged.stale.argStocks ||= ARG_TICKERS.some((ticker) => !argStocks.some((q) => q.ticker === ticker));
    merged.stale.crypto ||= crypto.length < 5;

    const payloadToStore: MarketPayloadStored = {
      crypto: merged.crypto,
      usStocks: merged.usStocks,
      argStocks: merged.argStocks,
      sectionTimes: merged.sectionTimes,
      stale: merged.stale,
    };

    const hasAnyData = payloadHasAnyData(payloadToStore);
    if (hasAnyData) {
      await saveMergedPayload(payloadToStore);
    }

    return {
        crypto: merged.crypto,
        usStocks: merged.usStocks,
        argStocks: merged.argStocks,
        fetchedAt: nowIso,
        stale: merged.stale,
        sectionTimes: merged.sectionTimes,
      };
  });
  return jsonResponse(result, { cacheHeader: 'miss' });
}
