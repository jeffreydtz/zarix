import { beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
const mocks = vi.hoisted(() => ({ user: vi.fn(), create: vi.fn(), sell: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ auth: { getUser: mocks.user } }) }));
vi.mock('@/lib/services/investments', () => ({ investmentsService: { create: mocks.create, sell: mocks.sell } }));
import { POST } from '@/app/api/investments/route';
import { POST as sell } from '@/app/api/investments/[id]/sell/route';
beforeEach(() => { vi.clearAllMocks(); mocks.user.mockResolvedValue({ data: { user: { id: 'owner-a' } } }); mocks.create.mockResolvedValue({ id: 'investment' }); });
const body = { accountId: 'account', type: 'stock_us', name: 'Apple', quantity: 10, purchasePrice: 100, purchaseCurrency: 'USD', purchaseDate: '2026-10-09' };
function req(owner = 'owner-a', key: string | null = 'create:request:1') {
  return new NextRequest('http://localhost/api/investments', { method: 'POST', headers: { 'X-Queue-Owner': owner, ...(key ? { 'Idempotency-Key': key } : {}) }, body: JSON.stringify(body) });
}
it('rejects a queued investment from another signed-in owner', async () => {
  expect((await POST(req('owner-b'))).status).toBe(403); expect(mocks.create).not.toHaveBeenCalled();
});
it.each([null, 'short', 'bad key with spaces'])('requires a valid durable request key %s', async key => {
  expect((await POST(req('owner-a', key))).status).toBe(400); expect(mocks.create).not.toHaveBeenCalled();
});
it('binds authenticated ownership, forwards the request key and echoes confirmation', async () => {
  const response = await POST(req()); expect(response.status).toBe(201);
  expect(response.headers.get('Idempotency-Key')).toBe('create:request:1');
  expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ userId: 'owner-a', requestId: 'create:request:1', quantity: 10 }));
});
it('leaves absent soldAt out of the sale intent instead of adding a volatile date before hashing', async () => {
  mocks.sell.mockResolvedValue({ sale: { id: 'sale' } });
  const request = new NextRequest('http://localhost/api/investments/position/sell', { method: 'POST',
    headers: { 'Idempotency-Key': 'sale:request:1' }, body: JSON.stringify({ quantity: 1, price: 120 }) });
  expect((await sell(request, { params: Promise.resolve({ id: 'position' }) })).status).toBe(201);
  expect(mocks.sell).toHaveBeenCalledWith(expect.objectContaining({ soldAt: undefined, requestId: 'sale:request:1' }));
});
