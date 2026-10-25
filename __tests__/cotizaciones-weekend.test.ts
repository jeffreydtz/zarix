import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

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
const insertedRows = () => mocks.insert.mock.calls.flatMap(call => call[0]);
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
  vi.stubEnv('EXCHANGE_RATE_CACHE_TTL', '300');
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
      single: async () => ({ data: mocks.rates[source] ?? null, error: mocks.failedSources.has(source) ? { code: 'PGRST116', message: 'No fixture row' } : null }),
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
    const rows = insertedRows();
    expect(rows).toHaveLength(4);
    expect(rows.every((row: { source: string }) => !row.source.startsWith('mep') && !row.source.startsWith('ccl'))).toBe(true);
  });

  it('persists blue even with stale MEP, preserving every provider timestamp', async () => {
    const { cotizacionesService } = await import('@/lib/services/cotizaciones');
    await cotizacionesService.getDolarQuotes();
    const rows = insertedRows();
    expect(rows).toHaveLength(8);
    expect(rows).toContainEqual(expect.objectContaining({ source: 'blue', rate: 1300, timestamp: time(1).toISOString() }));
    expect(rows).toContainEqual(expect.objectContaining({ source: 'mep', rate: 1300, timestamp: time(30).toISOString() }));
    expect(rows).toContainEqual(expect.objectContaining({ source: 'ccl', rate: 1320, timestamp: time(30).toISOString() }));
    expect(mocks.insert.mock.calls.every(call => call[0].length === 2)).toBe(true);
    expect(rows.every((row: { timestamp: string }) => row.timestamp !== new Date().toISOString())).toBe(true);
  });

  it('does not persist merged DB values alongside the valid live blue', async () => {
    persisted('mep', 30);
    const payload = live(120);
    vi.mocked(fetch).mockResolvedValueOnce(json(payload)).mockRejectedValueOnce(new Error('fixture outage'));
    const { cotizacionesService } = await import('@/lib/services/cotizaciones');
    const quotes = await cotizacionesService.getDolarQuotes();
    expect(quotes.mep).toMatchObject({ origin: 'persisted', stale: true, asOf: time(30) });
    expect(insertedRows()).toHaveLength(4);
    expect(insertedRows()).not.toContainEqual(expect.objectContaining({ source: 'mep' }));
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

  it('does not lose a DB rate when another per-rate DB query has no row', async () => {
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
    expect(insertedRows()).not.toContainEqual(expect.objectContaining({ source: 'blue' }));
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

  it('keeps last-known blue for display but rejects executable conversions in both directions', async () => {
    persisted('blue', 24 * 24);
    vi.mocked(fetch).mockRejectedValue(new Error('fixture outage'));
    const { cotizacionesService, FxUnavailableError } = await import('@/lib/services/cotizaciones');
    expect((await cotizacionesService.getDolarQuotes()).blue).toMatchObject({ sell: 1300, stale: true });
    await expect(cotizacionesService.getExchangeRate('USD', 'ARS')).rejects.toBeInstanceOf(FxUnavailableError);
    await expect(cotizacionesService.getExchangeRate('ARS', 'USD')).rejects.toThrow('Cotización ARS→USD no disponible, inválida o vencida');
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it('rechecks source freshness when a previously executable rate ages inside its cache TTL', async () => {
    vi.stubEnv('EXCHANGE_RATE_MAX_AGE_SECONDS', '3600');
    const { cotizacionesService } = await import('@/lib/services/cotizaciones');
    expect(await cotizacionesService.getExchangeRate('USD', 'ARS')).toBe(1300);
    persisted('blue', 1);
    vi.setSystemTime(new Date(Date.now() + 1000));
    vi.mocked(fetch).mockRejectedValue(new Error('fixture outage'));
    await expect(cotizacionesService.getExchangeRate('USD', 'ARS')).rejects.toThrow('vencida');
  });

  it('rejects EUR/ARS writes using old blue even when the EUR/USD leg is fresh', async () => {
    persisted('blue', 24 * 24);
    vi.mocked(fetch).mockImplementation(async url => {
      if (String(url).includes('EURUSD')) return json({ chart: { result: [{ meta: {
        regularMarketPrice: 1.1, regularMarketTime: Date.now() / 1000,
      } }] } });
      throw new Error('fixture outage');
    });
    const { cotizacionesService } = await import('@/lib/services/cotizaciones');
    expect(await cotizacionesService.getTransactionsFxRates()).toMatchObject({
      usdArs: 1300, eurArs: expect.closeTo(1430), stale: true, asOf: time(24 * 24),
    });
    await expect(cotizacionesService.getExchangeRate('EUR', 'ARS')).rejects.toThrow('vencida');
    await expect(cotizacionesService.getExchangeRate('ARS', 'EUR')).rejects.toThrow('vencida');
    expect(await cotizacionesService.getExchangeRate('EUR', 'USD')).toBe(1.1);
  });

  it('expires preferCache from the actual DB fetch despite requests every four minutes', async () => {
    persisted('blue', 1);
    const { cotizacionesService } = await import('@/lib/services/cotizaciones');
    const read = () => cotizacionesService.getDolarQuotes({ preferCache: true, require: ['blue'] });
    expect((await read()).blue?.sell).toBe(1300);
    const dbReads = mocks.from.mock.calls.length;
    vi.setSystemTime(new Date(Date.now() + 4 * 60 * 1000));
    persisted('blue', 0, 1390, 1400);
    expect((await read()).blue?.sell).toBe(1300);
    expect(mocks.from).toHaveBeenCalledTimes(dbReads);
    vi.setSystemTime(new Date(Date.now() + 4 * 60 * 1000));
    expect((await read()).blue?.sell).toBe(1400);
    expect(mocks.from.mock.calls.length).toBeGreaterThan(dbReads);
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([true, false])('keeps 10h DB MEP stale with live blue=%s, including cached resolutions', async hasLiveBlue => {
    persisted('mep', 10);
    vi.mocked(fetch).mockImplementation(async url => {
      if (hasLiveBlue && String(url).includes('criptoya')) return json({ blue: live().blue });
      throw new Error('fixture outage');
    });
    const { cotizacionesService } = await import('@/lib/services/cotizaciones');
    const { isExecutableDolarQuote } = await import('@/lib/executable-fx');
    for (let read = 0; read < 2; read++) {
      const quotes = await cotizacionesService.getDolarQuotes({ require: ['mep'] });
      expect(quotes.mep).toMatchObject({ origin: 'persisted', stale: true, asOf: time(10) });
      expect(isExecutableDolarQuote(quotes.mep, 'mep')).toBe(false);
    }
    expect(fetch).toHaveBeenCalledTimes(hasLiveBlue ? 2 : 4);
    expect(insertedRows()).not.toContainEqual(expect.objectContaining({ source: 'mep' }));
  });

  it('marks preferCache DB quotes stale and refreshes providers for an executable request', async () => {
    persisted('blue', 10);
    const { cotizacionesService } = await import('@/lib/services/cotizaciones');
    expect((await cotizacionesService.getDolarQuotes({ preferCache: true, require: ['blue'] })).blue)
      .toMatchObject({ stale: true, origin: 'persisted' });
    expect(fetch).not.toHaveBeenCalled();
    expect((await cotizacionesService.getDolarQuotes({ preferCache: true, require: ['blue'], executable: true })).blue)
      .toMatchObject({ stale: false, origin: 'provider' });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('refetches a missing required rate instead of returning a partial provider cache', async () => {
    const payload: Partial<ReturnType<typeof live>> = { mep: live(1).mep };
    vi.mocked(fetch).mockImplementation(async url => String(url).includes('criptoya') ? json(payload) : json([]));
    const { cotizacionesService } = await import('@/lib/services/cotizaciones');
    expect((await cotizacionesService.getDolarQuotes({ require: ['mep'] })).blue).toBeUndefined();
    payload.blue = live().blue;
    expect((await cotizacionesService.getDolarQuotes({ require: ['blue'] })).blue?.sell).toBe(1300);
    expect(fetch).toHaveBeenCalledTimes(4);
  });

  it('refetches a stale required cache rate for execution and can recover before the TTL', async () => {
    persisted('mep', 10);
    const payload: Partial<ReturnType<typeof live>> = { blue: live().blue };
    vi.mocked(fetch).mockImplementation(async url => String(url).includes('criptoya') ? json(payload) : json([]));
    const { cotizacionesService } = await import('@/lib/services/cotizaciones');
    expect((await cotizacionesService.getDolarQuotes({ require: ['blue'] })).mep?.stale).toBe(true);
    payload.mep = live(1).mep;
    expect((await cotizacionesService.getDolarQuotes({ require: ['mep'], executable: true })).mep)
      .toMatchObject({ stale: false, origin: 'provider' });
    expect(fetch).toHaveBeenCalledTimes(4);
  });

  it('keeps a 30h live blue displayable but stale and nonexecutable under the 96h display override', async () => {
    vi.stubEnv('EXCHANGE_RATE_MAX_AGE_SECONDS', '345600');
    const payload = { blue: { bid: 1290, ask: 1300, timestamp: time(30).getTime() / 1000 } };
    vi.mocked(fetch).mockImplementation(async url => String(url).includes('criptoya') ? json(payload) : json([]));
    const { cotizacionesService, FxUnavailableError } = await import('@/lib/services/cotizaciones');
    const { isExecutableDolarQuote, EXECUTABLE_FX_MAX_AGE_MS } = await import('@/lib/executable-fx');
    const { blue } = await cotizacionesService.getDolarQuotes({ require: ['blue'] });
    expect(blue).toMatchObject({ sell: 1300, stale: true, asOf: time(30) });
    expect(EXECUTABLE_FX_MAX_AGE_MS).toBe(24 * hour);
    expect(isExecutableDolarQuote(blue)).toBe(false);
    expect(isExecutableDolarQuote({ ...blue!, stale: false })).toBe(false);
    await expect(cotizacionesService.getExchangeRate('USD', 'ARS')).rejects.toBeInstanceOf(FxUnavailableError);
    await expect(cotizacionesService.getExchangeRate('ARS', 'USD')).rejects.toBeInstanceOf(FxUnavailableError);
  });

  it('keeps 30h EUR/USD displayable under the 96h override but rejects executable EUR/USD', async () => {
    vi.stubEnv('EXCHANGE_RATE_MAX_AGE_SECONDS', '345600');
    vi.mocked(fetch).mockImplementation(async url => {
      if (String(url).includes('EURUSD')) return json({ chart: { result: [{ meta: {
        regularMarketPrice: 1.1, regularMarketTime: time(30).getTime() / 1000,
      } }] } });
      if (String(url).includes('criptoya')) return json(live());
      throw new Error('fixture outage');
    });
    const { cotizacionesService } = await import('@/lib/services/cotizaciones');
    expect(await cotizacionesService.getTransactionsFxRates(['EUR'])).toMatchObject({
      usdArs: 1300, eurArs: expect.closeTo(1430), fxUnavailable: false,
    });
    await expect(cotizacionesService.getExchangeRate('EUR', 'USD')).rejects.toThrow('vencida');
    await expect(cotizacionesService.getExchangeRate('USD', 'EUR')).rejects.toThrow('vencida');
  });

  it('rechecks the executable hard age while the display cache remains within 96h', async () => {
    vi.stubEnv('EXCHANGE_RATE_MAX_AGE_SECONDS', '345600');
    const payload = { blue: { bid: 1290, ask: 1300, timestamp: (Date.now() - 24 * hour + 1000) / 1000 } };
    vi.mocked(fetch).mockImplementation(async url => String(url).includes('criptoya') ? json(payload) : json([]));
    const { cotizacionesService } = await import('@/lib/services/cotizaciones');
    expect(await cotizacionesService.getExchangeRate('USD', 'ARS')).toBe(1300);
    vi.setSystemTime(new Date(Date.now() + 2000));
    await expect(cotizacionesService.getExchangeRate('USD', 'ARS')).rejects.toThrow('vencida');
    expect(fetch).toHaveBeenCalledTimes(4);
  });

  it.each(['USD', 'ARS', 'EUR'])('rejects recent forced-stale blue for %s cross-currency writes', async currency => {
    persisted('blue', 10);
    vi.mocked(fetch).mockImplementation(async url => {
      if (String(url).includes('EURUSD')) return json({ chart: { result: [{ meta: {
        regularMarketPrice: 1.1, regularMarketTime: Date.now() / 1000,
      } }] } });
      throw new Error('fixture outage');
    });
    const { cotizacionesService } = await import('@/lib/services/cotizaciones');
    await expect(cotizacionesService.getExchangeRate(currency, currency === 'ARS' ? 'USD' : 'ARS'))
      .rejects.toThrow('vencida');
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it('propagates DB/RLS failures through quote, display-rate and executable-rate callers', async () => {
    const error = { code: '42501', message: 'fixture permission denied' };
    mocks.from.mockImplementation(() => { throw error; });
    const { cotizacionesService } = await import('@/lib/services/cotizaciones');
    await expect(cotizacionesService.getDolarQuotes({ require: ['blue'] })).rejects.toBe(error);
    await expect(cotizacionesService.getTransactionsFxRates(['USD'])).rejects.toBe(error);
    await expect(cotizacionesService.getExchangeRate('USD', 'ARS')).rejects.toBe(error);
  });

  it('propagates unexpected quote-history write failures instead of reporting an FX outage', async () => {
    const error = { code: '42501', message: 'fixture permission denied' };
    mocks.insert.mockResolvedValue({ error });
    const { cotizacionesService } = await import('@/lib/services/cotizaciones');
    await expect(cotizacionesService.getExchangeRate('USD', 'ARS')).rejects.toBe(error);
  });

  it('only degrades typed FX failures from display-rate callers', async () => {
    const { cotizacionesService, FxUnavailableError } = await import('@/lib/services/cotizaciones');
    const getDolarQuotes = vi.spyOn(cotizacionesService, 'getDolarQuotes');
    getDolarQuotes.mockRejectedValueOnce(new FxUnavailableError('USD/ARS'));
    expect(await cotizacionesService.getTransactionsFxRates(['USD'])).toMatchObject({ fxUnavailable: true });
    const error = new TypeError('fixture programming error');
    getDolarQuotes.mockRejectedValue(error);
    await expect(cotizacionesService.getTransactionsFxRates(['USD'])).rejects.toBe(error);
    await expect(cotizacionesService.getExchangeRate('USD', 'ARS')).rejects.toBe(error);
  });

  it('persists each atomic rate pair idempotently under the actual schema uniqueness constraint', async () => {
    const db = new PGlite();
    try {
      const schema = readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8');
      const table = schema.match(/CREATE TABLE exchange_rates \([\s\S]*?\n\);/)![0];
      await db.exec(table.replace('uuid_generate_v4()', 'gen_random_uuid()'));
      mocks.insert.mockImplementation(async (rows: Array<Record<string, unknown>>) => {
        const params = rows.flatMap(row => [row.source, row.from_currency, row.to_currency, row.rate, row.timestamp]);
        const values = rows.map((_, i) => `(${[1, 2, 3, 4, 5].map(j => `$${i * 5 + j}`).join(',')})`).join(',');
        try {
          await db.query(`INSERT INTO exchange_rates(source,from_currency,to_currency,rate,timestamp) VALUES ${values}`, params);
          return { error: null };
        } catch (error) {
          return { error };
        }
      });
      const payload = live(1);
      vi.mocked(fetch).mockImplementation(async url => String(url).includes('criptoya') ? json(payload) : json([]));
      const { cotizacionesService } = await import('@/lib/services/cotizaciones');
      await cotizacionesService.getDolarQuotes();
      vi.setSystemTime(new Date(Date.now() + 5 * 60 * 1000));
      payload.blue = { bid: 1390, ask: 1400, timestamp: Date.now() / 1000 };
      await cotizacionesService.getDolarQuotes();
      const rows = await db.query<{ source: string; rate: string; timestamp: Date }>(
        'SELECT source,rate,timestamp FROM exchange_rates ORDER BY timestamp DESC'
      );
      expect(rows.rows).toHaveLength(10);
      expect(rows.rows.slice(0, 2).map(row => row.source).sort()).toEqual(['blue', 'blue_buy']);
      expect(rows.rows.slice(0, 2).map(row => Number(row.rate)).sort()).toEqual([1390, 1400]);
      expect(mocks.insert.mock.calls.every(call => call[0].length === 2)).toBe(true);
      expect(console.error).not.toHaveBeenCalled();

      // Even a pre-existing single side must not create its unmatched counterpart.
      await db.query('DELETE FROM exchange_rates WHERE source = $1', ['mep']);
      vi.setSystemTime(new Date(Date.now() + 5 * 60 * 1000));
      await cotizacionesService.getDolarQuotes();
      expect((await db.query("SELECT source FROM exchange_rates WHERE source = 'mep'")).rows).toHaveLength(0);
    } finally {
      await db.close();
    }
  }, 15000);
});
