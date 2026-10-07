import { createHmac } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({ getPreapproval: vi.fn(), update: vi.fn(), lookup: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createServiceClientSync: () => ({
  from: () => {
    const query: any = { select: () => query, eq: () => query,
      maybeSingle: () => mocks.lookup() };
    return query;
  },
}) }));
vi.mock('@/lib/services/mercado-pago-service', () => ({ mercadoPagoService: {
  getPreapproval: mocks.getPreapproval,
  mapPreapprovalStatusToSubscription: () => ({ status: 'ACTIVE' }),
} }));
vi.mock('@/lib/services/subscriptions', () => ({ subscriptionsService: {
  getUserState: async () => ({ status: 'ACTIVE' }), updateUserState: mocks.update,
} }));
import { POST, GET } from '@/app/api/webhooks/mercado-pago/route';

const resourceId = 'preapproval-a', secret = 'isolated-fixture-secret', requestId = 'request-fixture', timestamp = '1791331200';
function request(method: 'GET' | 'POST', query: string, payload?: unknown, signResource: string | null = resourceId) {
  const v1 = createHmac('sha256', secret)
    .update(`${signResource == null ? '' : `id:${signResource.toLowerCase()};`}request-id:${requestId};ts:${timestamp};`).digest('hex');
  return new NextRequest(`http://localhost/api/webhooks/mercado-pago?${query}`, {
    method, headers: { 'x-signature': `ts=${timestamp},v1=${v1}`, 'x-request-id': requestId, 'Content-Type': 'application/json' },
    ...(method === 'POST' ? { body: JSON.stringify(payload) } : {}),
  });
}
beforeEach(() => {
  vi.stubEnv('MP_WEBHOOK_SECRET', secret);
  mocks.getPreapproval.mockReset().mockResolvedValue({ id: resourceId, external_reference: 'user-a', status: 'authorized' });
  mocks.lookup.mockReset().mockResolvedValue({ data: { id: 'user-a' } });
  mocks.update.mockReset().mockResolvedValue({ status: 'ACTIVE' });
});
afterEach(() => vi.unstubAllEnvs());

describe('Mercado Pago signed resource binding without live payments', () => {
  it.each([
    { id: 'preapproval-b' },
    { data: { id: 'preapproval-b' } },
    { resource: 'https://api.mercadopago.com/preapproval/preapproval-b' },
  ])('rejects a POST body resource alias that differs from the signed ID: %j', async payload => {
    const response = await POST(request('POST', `data.id=${resourceId}`, payload));
    expect(response.status).toBe(401);
    expect(mocks.getPreapproval).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('rejects GET query aliases which could override the signed data.id', async () => {
    for (const query of [`data.id=${resourceId}&id=preapproval-b`, `data.id=${resourceId}&preapproval_id=preapproval-b`,
      `data.id=${resourceId}&data.id=preapproval-b`]) {
      expect((await GET(request('GET', query))).status).toBe(401);
    }
    expect(mocks.getPreapproval).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('accepts the modern format with a distinct notification ID and looks up only the signed resource', async () => {
    const response = await POST(request('POST', `data.id=${resourceId}`, { id: 'notification-123', data: { id: resourceId } }));
    expect(response.status).toBe(200);
    expect(mocks.getPreapproval).toHaveBeenCalledExactlyOnceWith(resourceId);
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ userId: 'user-a', mpPreapprovalId: resourceId }));
  });

  it('accepts a legacy signed GET when all aliases agree', async () => {
    expect((await GET(request('GET', `id=${resourceId}&preapproval_id=${resourceId}`))).status).toBe(200);
    expect(mocks.getPreapproval).toHaveBeenCalledExactlyOnceWith(resourceId);
  });

  it('rejects an unsigned resource even if a manifest with no resource could be valid', async () => {
    expect((await POST(request('POST', '', { resource: `https://api.mercadopago.com/preapproval/${resourceId}` }, null))).status).toBe(401);
    expect(mocks.getPreapproval).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
