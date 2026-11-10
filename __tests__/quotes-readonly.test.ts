import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ from: vi.fn(), insert: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createServiceClientSync: () => ({ from: mocks.from }) }));

const live = () => ({
  blue: { bid: 1400, ask: 1500, timestamp: Date.now() / 1000 },
  oficial: { bid: 1300, ask: 1350, timestamp: Date.now() / 1000 },
  mep: { al30: { '24hs': { price: 1450, timestamp: Date.now() / 1000 } } },
  ccl: { al30: { '24hs': { price: 1460, timestamp: Date.now() / 1000 } } },
});
const json = (data: unknown) => new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json' } });

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  mocks.insert.mockResolvedValue({ error: null });
  mocks.from.mockImplementation(() => ({
    select: () => mocks.from(),
    eq: () => mocks.from(),
    order: () => mocks.from(),
    limit: () => mocks.from(),
    single: async () => ({ data: null, error: null }),
    maybeSingle: async () => ({ data: null, error: null }),
    insert: mocks.insert,
  }));
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json(live())));
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('display quotes vs executable FX writes', () => {
  it('persists live provider samples on a display getDolarQuotes (weekend fallback)', async () => {
    const { cotizacionesService } = await import('@/lib/services/cotizaciones');
    await cotizacionesService.getDolarQuotes();
    expect(mocks.insert).toHaveBeenCalled();
  });

  it('getAllQuotes is the display path used by get_quotes (not executable)', async () => {
    const { cotizacionesService } = await import('@/lib/services/cotizaciones');
    const quotes = await cotizacionesService.getAllQuotes();
    expect(quotes.dolar.blue?.sell).toBe(1500);
    expect(quotes.dolar.mep?.sell).toBe(1450);
    expect(quotes.dolar.ccl?.sell).toBe(1460);
    expect(quotes.dolar.mep?.provider).toBe('criptoya');
    expect(quotes.dolar.ccl?.provider).toBe('criptoya');
    expect(quotes.dolar.status).toBe('available');
  });

  it('reads MEP/CCL from gd30/ci when al30 24hs is missing', async () => {
    vi.mocked(fetch).mockResolvedValue(json({
      blue: { bid: 1400, ask: 1500, timestamp: Date.now() / 1000 },
      oficial: { bid: 1300, ask: 1350, timestamp: Date.now() / 1000 },
      mep: { gd30: { ci: { price: 1470, timestamp: Date.now() / 1000 } } },
      ccl: { gd30: { '24hs': { price: 1480, timestamp: Date.now() / 1000 } } },
    }));
    const { cotizacionesService } = await import('@/lib/services/cotizaciones');
    const quotes = await cotizacionesService.getDolarQuotes();
    expect(quotes.mep?.sell).toBe(1470);
    expect(quotes.ccl?.sell).toBe(1480);
  });

  it('getExchangeRate rejects when live FX is down and nothing executable is stored', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('fixture outage'));
    const { cotizacionesService } = await import('@/lib/services/cotizaciones');
    await expect(cotizacionesService.getExchangeRate('USD', 'ARS')).rejects.toMatchObject({
      name: 'FxUnavailableError',
      code: 'FX_UNAVAILABLE',
    });
  });
});
