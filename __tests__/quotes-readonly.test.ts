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

describe('get_quotes is read-only', () => {
  it('does not insert into exchange_rates on a read', async () => {
    const { cotizacionesService } = await import('@/lib/services/cotizaciones');
    await cotizacionesService.getDolarQuotes();
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it('persists only when the cron path asks for it', async () => {
    const { cotizacionesService } = await import('@/lib/services/cotizaciones');
    await cotizacionesService.getDolarQuotes({ persist: true });
    expect(mocks.insert).toHaveBeenCalled();
  });
});
