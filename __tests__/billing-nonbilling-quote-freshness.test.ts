import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ from: vi.fn(), insert: vi.fn(), rates: {} as Record<string, { rate: number; timestamp: string }> }));
vi.mock('@/lib/supabase/server', () => ({ createServiceClientSync: () => ({ from: mocks.from }) }));

const sources = ['blue', 'oficial', 'mep', 'ccl'];
const live = () => ({
  blue: { bid: 1400, ask: 1500, timestamp: Date.now()/1000 }, oficial: { bid: 1300, ask: 1350, timestamp: Date.now()/1000 },
  mep: { al30: { '24hs': { price: 1450, timestamp: Date.now()/1000 } } }, ccl: { al30: { '24hs': { price: 1460, timestamp: Date.now()/1000 } } },
});
const json = (data: unknown) => new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json' } });

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-09T12:00:00Z'));
  vi.stubEnv('EXCHANGE_RATE_CACHE_TTL', '300');
  vi.stubEnv('EXCHANGE_RATE_MAX_AGE_SECONDS', '86400');
  vi.stubEnv('MARKET_DATA_TIMEOUT_MS', '8000');
  vi.spyOn(console, 'error').mockImplementation(() => {});
  mocks.rates = Object.fromEntries(sources.flatMap(source => [[source, { rate: 1200, timestamp: new Date().toISOString() }], [`${source}_buy`, { rate: 1150, timestamp: new Date().toISOString() }]]));
  mocks.insert.mockResolvedValue({ error: null });
  mocks.from.mockImplementation(() => {
    let source = '';
    let timestamp: string | undefined;
    const query = {
      select: () => query,
      eq: (key: string, value: string) => { if (key === 'source') source = value; if (key === 'timestamp') timestamp = value; return query; },
      order: () => query,
      limit: () => query,
      single: async () => ({ data: mocks.rates[source] ?? null, error: null }),
      maybeSingle: async () => ({ data: mocks.rates[source]?.timestamp === timestamp ? mocks.rates[source] : null, error: null }),
      insert: mocks.insert,
    };
    return query;
  });
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json(live())));
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('dollar quote freshness and cache boundaries', () => {
  it.each([299, 300, 301])('refreshes at the documented 300 second TTL boundary (%ss)', async age => {
    const { cotizacionesService } = await import('@/lib/services/cotizaciones');
    const initial = await cotizacionesService.getDolarQuotes();
    vi.setSystemTime(new Date(Date.parse('2026-10-09T12:00:00Z') + age * 1000));
    vi.mocked(fetch).mockResolvedValue(json(live()));
    const next = await cotizacionesService.getDolarQuotes();
    expect(fetch).toHaveBeenCalledTimes(age < 300 ? 2 : 4);
    expect(next.blue!.timestamp.getTime()).toBe(age < 300 ? initial.blue!.timestamp.getTime() : Date.now());
  });

  it('retains persisted value, original timestamp and fallback label when refresh fails exactly at TTL', async () => {
    const { cotizacionesService } = await import('@/lib/services/cotizaciones');
    await cotizacionesService.getDolarQuotes();
    vi.setSystemTime(new Date('2026-10-09T12:05:00Z'));
    vi.mocked(fetch).mockRejectedValue(new Error('synthetic provider outage'));
    const next = await cotizacionesService.getDolarQuotes();
    expect(fetch).toHaveBeenCalledTimes(4);
    expect(next.blue).toMatchObject({ sell: 1200, provider: null, origin: 'persisted', timestamp: new Date('2026-10-09T12:00:00Z') });
  });

  it('uses fresh persisted quotes for the dashboard without contacting providers', async () => {
    const { cotizacionesService } = await import('@/lib/services/cotizaciones');
    expect((await cotizacionesService.getDolarQuotes({ preferCache: true })).blue).toMatchObject({ buy: 1150, sell: 1200 });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('does not let a dashboard DB result suppress a later live refresh', async () => {
    const { cotizacionesService } = await import('@/lib/services/cotizaciones');
    await cotizacionesService.getDolarQuotes({ preferCache: true });
    const refreshed = await cotizacionesService.getDolarQuotes();
    expect(refreshed.blue).toMatchObject({ buy: 1400, sell: 1500 });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('retries live providers after a request had to fall back to the DB', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error('offline')).mockRejectedValueOnce(new Error('offline'));
    const { cotizacionesService } = await import('@/lib/services/cotizaciones');
    expect((await cotizacionesService.getDolarQuotes()).blue!.sell).toBe(1200);
    expect((await cotizacionesService.getDolarQuotes()).blue!.sell).toBe(1500);
    expect(fetch).toHaveBeenCalledTimes(4);
  });

  it('refreshes rather than using persisted rates older than 24 hours', async () => {
    sources.forEach(source => { mocks.rates[source].timestamp = '2026-10-08T11:59:59Z'; });
    const { cotizacionesService } = await import('@/lib/services/cotizaciones');
    expect((await cotizacionesService.getDolarQuotes({ preferCache: true })).blue!.sell).toBe(1500);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it.each(['stale', 'missing', 'negative', 'invalid-date'])('marks only blue unavailable when providers fail and its DB quote is %s', async (kind) => {
    vi.mocked(fetch).mockRejectedValue(new Error('synthetic outage'));
    if (kind === 'stale') mocks.rates.blue!.timestamp = '2026-10-01T00:00:00Z';
    if (kind === 'missing') delete mocks.rates.blue;
    if (kind === 'negative') mocks.rates.blue.rate = -1;
    if (kind === 'invalid-date') mocks.rates.blue!.timestamp = 'invalid';
    const { cotizacionesService } = await import('@/lib/services/cotizaciones');
    const quotes = await cotizacionesService.getDolarQuotes();
    expect(quotes.blue).toBeUndefined();
    expect(quotes).toMatchObject({ status: 'partial', missing: ['blue'] });
    expect(quotes.mep?.sell).toBe(1200);
  });

  it('does not extend source freshness when a DB result is put into memory', async () => {
    vi.stubEnv('EXCHANGE_RATE_MAX_AGE_SECONDS', '60');
    Object.values(mocks.rates).forEach(rate => { rate.timestamp = '2026-10-09T11:59:01Z'; });
    const { cotizacionesService } = await import('@/lib/services/cotizaciones');
    await cotizacionesService.getDolarQuotes({ preferCache: true });
    vi.setSystemTime(new Date('2026-10-09T12:00:02Z'));
    vi.mocked(fetch).mockRejectedValue(new Error('synthetic outage'));
    const quotes = await cotizacionesService.getDolarQuotes({ preferCache: true });
    expect(quotes.blue).toBeUndefined();
    expect(quotes.mep).toMatchObject({ stale: true, timestamp: new Date('2026-10-09T11:59:01Z') });
  });
});

describe('bounded market-provider requests', () => {
  it('times out the primary request and continues to DolarApi', async () => {
    vi.stubEnv('MARKET_DATA_TIMEOUT_MS', '5');
    let firstSignal: AbortSignal | undefined;
    vi.mocked(fetch)
      .mockImplementationOnce((_url, options) => new Promise((_resolve, reject) => {
        firstSignal = options?.signal as AbortSignal;
        firstSignal.addEventListener('abort', () => reject(new Error('synthetic timeout')), { once: true });
      }))
      .mockResolvedValueOnce(json(['blue', 'oficial', 'bolsa', 'contadoconliqui'].map(casa => ({ casa, compra: 1400, venta: 1500, fechaActualizacion: new Date().toISOString() }))));
    const { cotizacionesService } = await import('@/lib/services/cotizaciones');
    expect((await cotizacionesService.getDolarQuotes()).blue!.sell).toBe(1500);
    expect(firstSignal?.aborted).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('provides an abort signal for crypto, stock and EUR/USD requests', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(json({ bitcoin: { usd: 100, ars: 120000, last_updated_at: Date.now()/1000 } }))
      .mockResolvedValueOnce(json({ chart: { result: [{ meta: { regularMarketPrice: 100, regularMarketTime: Date.now()/1000, currency: 'USD' } }] } }))
      .mockResolvedValueOnce(json({ chart: { result: [{ meta: { regularMarketPrice: 1.1, regularMarketTime: Date.now()/1000 } }] } }));
    const { cotizacionesService } = await import('@/lib/services/cotizaciones');
    await cotizacionesService.getCryptoQuote('BTC');
    await cotizacionesService.getStockQuote('AAPL');
    await cotizacionesService.getExchangeRate('EUR', 'USD');
    for (const [, options] of vi.mocked(fetch).mock.calls) {
      expect(options?.signal).toBeInstanceOf(AbortSignal);
    }
  });
});

describe('truthful persisted bid/ask fallback', () => {
  it('rejects legacy sell-only rows rather than inventing the buy side', async () => {
    delete mocks.rates.blue_buy;
    vi.mocked(fetch).mockRejectedValue(new Error('synthetic outage'));
    const { cotizacionesService } = await import('@/lib/services/cotizaciones');
    const quotes = await cotizacionesService.getDolarQuotes();
    expect(quotes.blue).toBeUndefined();
    expect(quotes.mep?.sell).toBe(1200);
  });
  it('rejects sides from different timestamps', async () => {
    mocks.rates.blue_buy.timestamp = '2026-10-09T11:00:00Z';
    vi.mocked(fetch).mockRejectedValue(new Error('synthetic outage'));
    const { cotizacionesService } = await import('@/lib/services/cotizaciones');
    const quotes = await cotizacionesService.getDolarQuotes();
    expect(quotes.blue).toBeUndefined();
    expect(quotes.mep?.sell).toBe(1200);
  });
  it('stores both sides together with the same source timestamp', async () => {
    const { cotizacionesService } = await import('@/lib/services/cotizaciones');
    await cotizacionesService.getDolarQuotes();
    const rows = mocks.insert.mock.calls.flatMap(call => call[0]);
    expect(rows).toHaveLength(8);
    expect(mocks.insert.mock.calls.every(call => call[0].length === 2)).toBe(true);
    expect(rows).toContainEqual(expect.objectContaining({ source: 'blue', rate: 1500 }));
    expect(rows).toContainEqual(expect.objectContaining({ source: 'blue_buy', rate: 1400 }));
    expect(new Set(rows.map((row: any) => row.timestamp)).size).toBe(1);
  });
});


describe('provider source timestamps', () => {
  it('preserves the actual CriptoYa timestamp instead of refreshing stale source time', async () => {
    mocks.rates = {};
    const data = live(); data.blue!.timestamp = (Date.now() - 60000)/1000;
    vi.mocked(fetch).mockResolvedValueOnce(json(data));
    const { cotizacionesService } = await import('@/lib/services/cotizaciones');
    expect((await cotizacionesService.getDolarQuotes()).blue!.timestamp.toISOString()).toBe('2026-10-09T11:59:00.000Z');
  });
  it('rejects stale live payload then preserves the timestamp of persisted fallback', async () => {
    const data = live(); data.blue!.timestamp = (Date.now() - 90000000)/1000;
    vi.mocked(fetch).mockResolvedValueOnce(json(data)).mockRejectedValueOnce(new Error('fallback unavailable'));
    const { cotizacionesService } = await import('@/lib/services/cotizaciones');
    expect((await cotizacionesService.getDolarQuotes()).blue!.sell).toBe(1200);
    const rows = mocks.insert.mock.calls.flatMap(call => call[0]);
    expect(rows).toHaveLength(6);
    expect(rows).not.toContainEqual(expect.objectContaining({ source: 'blue' }));
  });
  it('preserves DolarApi fechaActualizacion rather than observation time', async () => {
    mocks.rates = {};
    vi.mocked(fetch).mockRejectedValueOnce(new Error('primary down')).mockResolvedValueOnce(json(['blue','oficial','bolsa','contadoconliqui'].map(casa=>({casa,compra:1400,venta:1500,fechaActualizacion:'2026-10-09T11:00:00Z'}))));
    const { cotizacionesService } = await import('@/lib/services/cotizaciones');
    expect((await cotizacionesService.getDolarQuotes()).blue!.timestamp.toISOString()).toBe('2026-10-09T11:00:00.000Z');
  });
});


describe('crypto and stock source freshness', () => {
  it('rejects stale crypto instead of stamping retrieval time on the quote', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(json({bitcoin:{usd:100,ars:120000,last_updated_at:1}}));
    const {cotizacionesService}=await import('@/lib/services/cotizaciones');
    await expect(cotizacionesService.getCryptoQuote('BTC')).rejects.toThrow('vencida');
    expect(String(vi.mocked(fetch).mock.calls[0][0])).toContain('include_last_updated_at=true');
  });
  it('rejects stale stock source time and nonpositive prices', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(json({chart:{result:[{meta:{regularMarketPrice:100,regularMarketTime:1,currency:'USD'}}]}}));
    const {cotizacionesService}=await import('@/lib/services/cotizaciones');
    await expect(cotizacionesService.getStockQuote('AAPL')).rejects.toThrow('vencida');
  });
});


it('derived FX cannot extend an expiring source quote by the memory cache TTL', async () => {
  vi.stubEnv('EXCHANGE_RATE_MAX_AGE_SECONDS','60');
  const { EXECUTABLE_FX_MAX_AGE_MS } = await import('@/lib/executable-fx');
  vi.mocked(fetch).mockResolvedValueOnce(json({chart:{result:[{meta:{
    regularMarketPrice:1.1,
    regularMarketTime:(Date.now() - EXECUTABLE_FX_MAX_AGE_MS + 2000)/1000,
  }}]}}));
  const {cotizacionesService}=await import('@/lib/services/cotizaciones');
  expect(await cotizacionesService.getExchangeRate('EUR','USD')).toBe(1.1);
  vi.setSystemTime(new Date(Date.now() + 3000));
  vi.mocked(fetch).mockRejectedValue(new Error('synthetic outage'));
  await expect(cotizacionesService.getExchangeRate('EUR','USD')).rejects.toThrow('Cotización EUR→USD no disponible, inválida o vencida');
});
