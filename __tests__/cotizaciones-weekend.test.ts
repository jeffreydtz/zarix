import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  from: vi.fn(), insert: vi.fn(), rates: {} as Record<string, { rate: number; timestamp: string }>,
  failedSources: new Set<string>(),
}));
vi.mock('@/lib/supabase/server', () => ({ createServiceClientSync: () => ({ from: mocks.from }) }));

const hour = 60 * 60 * 1000;
const time = (age: number) => new Date(Date.now() - age * hour);
const live = (mepAge = 30) => ({
  blue: { bid: 1290, ask: 1300, timestamp: time(1).getTime() / 1000 },
  oficial: { bid: 1200, ask: 1210, timestamp: time(1).getTime() / 1000 },
  mep: { al30: { '24hs': { price: 1300, timestamp: time(mepAge).getTime() / 1000 } } },
  ccl: { al30: { '24hs': { price: 1320, timestamp: time(mepAge).getTime() / 1000 } } },
});
const json = (data: unknown) => new Response(JSON.stringify(data));
function persisted(source: string, age: number, buy = 1290, sell = 1300) {
  const timestamp = time(age).toISOString();
  mocks.rates[source] = { rate: sell, timestamp };
  mocks.rates[`${source}_buy`] = { rate: buy, timestamp };
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-25T12:00:00Z'));
  vi.stubEnv('EXCHANGE_RATE_MAX_AGE_SECONDS', '86400');
  vi.stubEnv('EXCHANGE_RATE_MARKET_MAX_AGE_SECONDS', '345600');
  mocks.rates = {};
  mocks.failedSources = new Set();
  mocks.insert.mockResolvedValue({ error: null });
  mocks.from.mockImplementation(() => {
    let source = '';
    let timestamp: string | undefined;
    const query = {
      select: () => query,
      eq: (key: string, value: string) => {
        if (key === 'source') source = value;
        if (key === 'timestamp') timestamp = value;
        return query;
      },
      order: () => query,
      limit: () => query,
      single: async () => ({ data: mocks.rates[source] ?? null, error: mocks.failedSources.has(source) ? { message: 'fixture failure' } : null }),
      maybeSingle: async () => ({ data: mocks.rates[source]?.timestamp === timestamp ? mocks.rates[source] : null, error: null }),
      insert: mocks.insert,
    };
    return query;
  });
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string) => {
    if (url.includes('criptoya')) return json(live());
    if (url.includes('dolarapi')) return json([{ casa: 'oficial', compra: 1190, venta: 1200, fechaActualizacion: time(32).toISOString() }]);
    throw new Error('Unexpected fixture request');
  }));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('weekend FX resilience', () => {
  it('keeps fresh blue/oficial with a 30h market close and its original asOf', async () => {
    persisted('mep', 30);
    const { cotizacionesService } = await import('@/lib/services/cotizaciones');
    const quotes = await cotizacionesService.getDolarQuotes();
    expect(quotes.status).toBe('available');
    expect(quotes.blue).toMatchObject({ sell: 1300, stale: false, asOf: time(1) });
    expect(quotes.oficial).toMatchObject({ sell: 1210, provider: 'criptoya', asOf: time(1) });
    expect(quotes.mep).toMatchObject({ sell: 1300, stale: true, asOf: time(30) });
    expect(quotes.ccl).toMatchObject({ stale: true, asOf: time(30) });
  });

  it('selects the freshest individually valid sample across all three providers', async () => {
    persisted('ccl', 0.5, 1330, 1340);
    vi.mocked(fetch).mockImplementation(async (url) => String(url).includes('criptoya') ? json(live()) :
      json([{ casa: 'blue', compra: 1305, venta: 1310, fechaActualizacion: time(0.5).toISOString() }]));
    const { cotizacionesService } = await import('@/lib/services/cotizaciones');
    const quotes = await cotizacionesService.getDolarQuotes();
    expect(quotes.blue).toMatchObject({ sell: 1310, provider: 'dolarapi' });
    expect(quotes.oficial?.provider).toBe('criptoya');
    expect(quotes.ccl).toMatchObject({ sell: 1340, origin: 'persisted', asOf: time(0.5) });
  });

  it('marks MEP unavailable at 120h while returning blue and persisting valid rates only', async () => {
    persisted('mep', 120);
    vi.mocked(fetch).mockResolvedValueOnce(json(live(120)));
    const { cotizacionesService } = await import('@/lib/services/cotizaciones');
    const quotes = await cotizacionesService.getDolarQuotes({ require: ['blue', 'mep'] });
    expect(quotes).toMatchObject({ status: 'partial', missing: ['mep'] });
    expect(quotes.blue?.sell).toBe(1300);
    expect(quotes.mep).toBeUndefined();
    expect(quotes.ccl).toBeUndefined();
    const rows = mocks.insert.mock.calls[0][0];
    expect(rows).toHaveLength(4);
    expect(rows.every((row: { source: string }) => !row.source.startsWith('mep') && !row.source.startsWith('ccl'))).toBe(true);
  });

  it('persists blue even with stale MEP, preserving every provider timestamp', async () => {
    const { cotizacionesService } = await import('@/lib/services/cotizaciones');
    await cotizacionesService.getDolarQuotes();
    const rows = mocks.insert.mock.calls[0][0];
    expect(rows).toHaveLength(8);
    expect(rows).toContainEqual(expect.objectContaining({ source: 'blue', rate: 1300, timestamp: time(1).toISOString() }));
    expect(rows).toContainEqual(expect.objectContaining({ source: 'mep', rate: 1300, timestamp: time(30).toISOString() }));
    expect(rows.every((row: { timestamp: string }) => row.timestamp !== new Date().toISOString())).toBe(true);
  });

  it('does not persist merged DB values alongside the valid live blue', async () => {
    persisted('mep', 30);
    const payload = live(120);
    vi.mocked(fetch).mockResolvedValueOnce(json(payload)).mockRejectedValueOnce(new Error('fixture outage'));
    const { cotizacionesService } = await import('@/lib/services/cotizaciones');
    const quotes = await cotizacionesService.getDolarQuotes();
    expect(quotes.mep).toMatchObject({ origin: 'persisted', stale: true, asOf: time(30) });
    expect(mocks.insert.mock.calls[0][0]).toHaveLength(4);
    expect(mocks.insert.mock.calls[0][0]).not.toContainEqual(expect.objectContaining({ source: 'mep' }));
  });

  it('returns last-known DB rates as stale during a total outage without inserting them again', async () => {
    persisted('blue', 120);
    persisted('mep', 120);
    vi.mocked(fetch).mockRejectedValue(new Error('fixture outage'));
    const { cotizacionesService } = await import('@/lib/services/cotizaciones');
    const quotes = await cotizacionesService.getDolarQuotes({ require: ['blue'] });
    expect(quotes).toMatchObject({ status: 'available', missing: [] });
    expect(quotes.blue).toMatchObject({ sell: 1300, stale: true, origin: 'persisted', asOf: time(120) });
    expect(quotes.mep).toMatchObject({ stale: true, asOf: time(120) });
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it('returns typed unavailable with no rows, and read FX rates do not throw', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('fixture outage'));
    const { cotizacionesService, FxUnavailableError } = await import('@/lib/services/cotizaciones');
    expect(await cotizacionesService.getDolarQuotes({ require: ['blue'] })).toEqual({ status: 'unavailable', missing: ['blue'] });
    expect(await cotizacionesService.getTransactionsFxRates()).toMatchObject({ usdArs: null, eurArs: null, fxUnavailable: true });
    await expect(cotizacionesService.getExchangeRate('USD', 'ARS')).rejects.toBeInstanceOf(FxUnavailableError);
    await expect(cotizacionesService.getExchangeRate('ARS', 'USD')).rejects.toBeInstanceOf(FxUnavailableError);
    const all = await cotizacionesService.getAllQuotes();
    expect(all.dolar.status).toBe('unavailable');
    expect(all.crypto).toEqual({ btc: null, eth: null, usdt: null });
    expect(all.timestamp).toBeNull();
  });

  it('does not lose a DB rate when another per-rate DB query fails', async () => {
    persisted('blue', 1);
    mocks.failedSources.add('mep');
    vi.mocked(fetch).mockRejectedValue(new Error('fixture outage'));
    const { cotizacionesService } = await import('@/lib/services/cotizaciones');
    expect((await cotizacionesService.getDolarQuotes()).blue?.sell).toBe(1300);
  });

  it.each([0, -1, Number.NaN])('never returns or persists invalid price %s', async price => {
    const data = live();
    data.blue.ask = price;
    vi.mocked(fetch).mockResolvedValueOnce(json(data)).mockResolvedValueOnce(json([]));
    const { cotizacionesService } = await import('@/lib/services/cotizaciones');
    const quotes = await cotizacionesService.getDolarQuotes();
    expect(quotes.blue).toBeUndefined();
    expect(quotes.mep?.sell).toBe(1300);
    expect(mocks.insert.mock.calls[0][0]).not.toContainEqual(expect.objectContaining({ source: 'blue' }));
  });

  it('rejects future dates beyond five minutes even for the last-known fallback', async () => {
    persisted('blue', -1);
    vi.mocked(fetch).mockRejectedValue(new Error('fixture outage'));
    const { cotizacionesService } = await import('@/lib/services/cotizaciones');
    expect(await cotizacionesService.getDolarQuotes({ require: ['blue'] })).toEqual({ status: 'unavailable', missing: ['blue'] });
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it('keeps valid USD conversions when the independent EUR source fails', async () => {
    const { cotizacionesService } = await import('@/lib/services/cotizaciones');
    expect(await cotizacionesService.getTransactionsFxRates()).toMatchObject({ usdArs: 1300, eurArs: null, fxUnavailable: true, stale: false, asOf: time(1) });
  });

  it('honors the configurable market-close age limit independently of blue', async () => {
    vi.stubEnv('EXCHANGE_RATE_MARKET_MAX_AGE_SECONDS', '7200');
    const { cotizacionesService } = await import('@/lib/services/cotizaciones');
    const quotes = await cotizacionesService.getDolarQuotes({ require: ['blue'] });
    expect(quotes.status).toBe('available');
    expect(quotes.blue?.sell).toBe(1300);
    expect(quotes.mep).toBeUndefined();
  });
});
