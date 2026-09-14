import { beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
const mocks = vi.hoisted(() => ({
  crypto: vi.fn(), stock: vi.fn(), dolar: vi.fn(), updates: vi.fn(), history: vi.fn(), rows: [] as { id: string; type: string; ticker: string }[],
}));
vi.mock('@/lib/cron-auth', () => ({ verifyCronBearer: () => true }));
vi.mock('@/lib/observability/alert', () => ({ alertAdmin: vi.fn() }));
vi.mock('@/lib/services/cotizaciones', () => ({ cotizacionesService: {
  getCryptoQuotes: mocks.crypto, getStockQuote: mocks.stock, getDolarQuotes: mocks.dolar,
} }));
vi.mock('@/lib/supabase/server', () => ({ createServiceClientSync: () => ({ from: (table: string) => {
  const chain = { eq: vi.fn(() => chain), in: vi.fn(() => chain), abortSignal: vi.fn().mockResolvedValue({ data: mocks.rows, error: null }) };
  return {
    select: () => chain,
    update: (payload: unknown) => { mocks.updates(payload); return chain; },
    upsert: (payload: unknown) => { mocks.history(table, payload); return { abortSignal: vi.fn().mockResolvedValue({ error: null }) }; },
  };
} }) }));
beforeEach(() => {
  vi.clearAllMocks();
  mocks.rows = [{ id: 'a', type: 'crypto', ticker: 'USDC' }, { id: 'b', type: 'crypto', ticker: 'DAI' }];
  mocks.dolar.mockResolvedValue({ blue: { sell: 1500, timestamp: new Date('2026-09-01T12:00:00Z') } });
});
it('batches stablecoins without substituting USDT and preserves source timestamps in writes', async () => {
  const timestamp = new Date('2026-09-01T12:00:00Z');
  mocks.crypto.mockResolvedValue({ USDC: { priceUSD: 0.999, timestamp }, DAI: { priceUSD: 1.001, timestamp } });
  const { GET } = await import('@/app/api/cron/update-prices/route');
  const response = await GET(new NextRequest('http://localhost/api/cron/update-prices'));
  expect(await response.json()).toMatchObject({ processed: 2, errors: 0 });
  expect(mocks.crypto).toHaveBeenCalledOnce();
  expect(mocks.crypto).toHaveBeenCalledWith(['USDC', 'DAI']);
  expect(mocks.updates.mock.calls.map(([value]) => value.current_price)).toEqual([0.999, 1.001]);
  expect(mocks.updates.mock.calls[0][0].current_price_updated_at).toBe(timestamp.toISOString());
  expect(mocks.history).toHaveBeenCalledOnce();
});
it('counts missing market quotes as failures instead of reporting silent success', async () => {
  mocks.crypto.mockResolvedValue({});
  const { GET } = await import('@/app/api/cron/update-prices/route');
  const response = await GET(new NextRequest('http://localhost/api/cron/update-prices'));
  expect(await response.json()).toMatchObject({ processed: 0, errors: 2 });
  expect(mocks.updates).not.toHaveBeenCalled();
});
