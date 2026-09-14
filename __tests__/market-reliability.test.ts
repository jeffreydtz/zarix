import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cachedStaleFlags, mergeWithCache } from '@/lib/market-data/cache';
import { mapConcurrent, singleFlight } from '@/lib/market-data/requests';

const insert = vi.hoisted(() => vi.fn((_rows: unknown[]) => ({ abortSignal: vi.fn().mockResolvedValue({ error: null }) })));
vi.mock('@/lib/supabase/server', () => ({ createServiceClientSync: () => ({ from: () => ({ insert }) }) }));

beforeEach(() => { vi.resetModules(); vi.clearAllMocks(); });
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
const stock = (ticker: string, price: number) => ({ ticker, price, name: ticker, change: 0, changePct: 0, currency: 'USD' });

describe('market cache integrity', () => {
  it('preserves stale warnings after a database round trip', () => {
    const old = '2026-09-01T00:00:00.000Z';
    const previous = { crypto: [], argStocks: [], usStocks: [stock('AAPL', 100)], sectionTimes: { usStocks: old } };
    const merged = mergeWithCache({ crypto: [], argStocks: [], usStocks: [] }, previous, new Date().toISOString());
    expect(merged.sectionTimes.usStocks).toBe(old);
    expect(cachedStaleFlags(JSON.parse(JSON.stringify(merged)), new Date().toISOString()).usStocks).toBe(true);
  });
  it('keeps cached missing symbols when provider responds with only one stock', () => {
    const previous = { crypto: [], argStocks: [], usStocks: [stock('AAPL', 100), stock('MSFT', 200)] };
    const merged = mergeWithCache({ crypto: [], argStocks: [], usStocks: [stock('AAPL', 110)] }, previous, new Date().toISOString());
    expect(merged.usStocks.map((q) => [q.ticker, q.price])).toEqual([['AAPL', 110], ['MSFT', 200]]);
    expect(merged.stale.usStocks).toBe(true);
  });
  it('never declares an empty section fresh', () => {
    const merged = mergeWithCache({ crypto: [], argStocks: [], usStocks: [] }, null, new Date().toISOString());
    expect(merged.stale).toEqual({ crypto: true, usStocks: true, argStocks: true });
    expect(merged.sectionTimes.crypto).toBeUndefined();
  });
});

describe('provider requests', () => {
  it('deduplicates concurrent work and permits retry after a rejection', async () => {
    const fail = vi.fn().mockRejectedValue(new Error('offline'));
    await Promise.allSettled([singleFlight('test-failure', fail), singleFlight('test-failure', fail)]);
    expect(fail).toHaveBeenCalledTimes(1);
    await expect(singleFlight('test-failure', async () => 7)).resolves.toBe(7);
  });
  it('limits fallback concurrency without dropping work', async () => {
    let active = 0; let peak = 0;
    const results = await mapConcurrent([1, 2, 3, 4, 5, 6], 3, async (n) => {
      peak = Math.max(peak, ++active);
      await new Promise((resolve) => setTimeout(resolve, 1));
      active--; return n * 2;
    });
    expect(peak).toBe(3);
    expect(results).toEqual([2, 4, 6, 8, 10, 12]);
  });
  it('batches 3 crypto IDs into 1 fetch, shares concurrent requests, preserves provider time', async () => {
    const timestamp = Math.floor(Date.now() / 1000) - 90;
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({
      bitcoin: { usd: 60000, ars: 60000000, last_updated_at: timestamp },
      ethereum: { usd: 3000, ars: 3000000, last_updated_at: timestamp },
      tether: { usd: 0.99, ars: 990, last_updated_at: timestamp },
    }) });
    vi.stubGlobal('fetch', fetcher);
    const { cotizacionesService } = await import('@/lib/services/cotizaciones');
    const [a, b] = await Promise.all([
      cotizacionesService.getCryptoQuotes(['BTC', 'ETH', 'USDT']),
      cotizacionesService.getCryptoQuotes(['ETH', 'BTC', 'USDT']),
    ]);
    expect(fetcher).toHaveBeenCalledTimes(1);
    const query = new URL(fetcher.mock.calls[0][0]).searchParams;
    expect(query.get('ids')?.split(',').sort()).toEqual(['bitcoin', 'ethereum', 'tether']);
    expect(query.get('include_last_updated_at')).toBe('true');
    expect(a.BTC.timestamp.getTime()).toBe(timestamp * 1000);
    expect(b.USDT.priceUSD).toBe(0.99);
    await cotizacionesService.getCryptoQuote('btc');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('rejects invalid zero/nonfinite prices instead of persisting them', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ bitcoin: { usd: Infinity, ars: 50 }, ethereum: { usd: 0, ars: 50 } }) }));
    const { cotizacionesService } = await import('@/lib/services/cotizaciones');
    expect(await cotizacionesService.getCryptoQuotes(['BTC', 'ETH'])).toEqual({});
    await expect(cotizacionesService.getCryptoQuote('BTC')).rejects.toThrow('no disponible');
  });
  it('rejects incomplete first dollar provider, keeps DolarAPI source dates', async () => {
    const time = new Date(Date.now() - 3600000).toISOString();
    const fetcher = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ blue: { bid: 1000, ask: 1100 }, oficial: Infinity }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ['blue', 'oficial', 'bolsa', 'contadoconliqui'].map((casa) => ({ casa, compra: 1000, venta: 1100, fechaActualizacion: time })) });
    vi.stubGlobal('fetch', fetcher);
    const { cotizacionesService } = await import('@/lib/services/cotizaciones');
    const [a, b] = await Promise.all([cotizacionesService.getDolarQuotes(), cotizacionesService.getDolarQuotes()]);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(a.blue.timestamp.toISOString()).toBe(time);
    expect(b.mep.sell).toBe(1100);
    expect(insert.mock.calls[0]?.[0]).toEqual(expect.arrayContaining([expect.objectContaining({ timestamp: time })]));
    for (const call of fetcher.mock.calls) expect(call[1].signal).toBeInstanceOf(AbortSignal);
  });
  it('reads Data912 pct_change, shares concurrent fetches, preserves old observation on errors', async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => [{ symbol: 'GGAL', c: 5000, pct_change: -2.5 }] })
      .mockResolvedValue({ ok: false });
    vi.stubGlobal('fetch', fetcher);
    const { fetchArgStocks } = await import('@/lib/market-data/data912-client');
    const [first] = await Promise.all([fetchArgStocks(), fetchArgStocks()]);
    expect(first[0].changePct).toBe(-2.5);
    expect(fetcher).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(301000);
    const stale = await fetchArgStocks();
    expect(stale[0].stale).toBe(true);
    expect(stale[0].observedAt).toBe(first[0].observedAt);
  });
  it('never substitutes QQQ for the Nasdaq Composite', async () => {
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    const { fetchStooqUsQuote } = await import('@/lib/stooq-us-quote');
    await expect(fetchStooqUsQuote('^IXIC')).resolves.toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });
});
