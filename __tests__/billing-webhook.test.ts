import { createHmac } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({ getPreapproval: vi.fn(), getAuthorizedPayment: vi.fn(), getUserState: vi.fn(), update: vi.fn(), lookup: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createServiceClientSync: () => ({
  from: () => {
    const query: any = { select: () => query, eq: () => query,
      maybeSingle: () => mocks.lookup() };
    return query;
  },
}) }));
vi.mock('@/lib/services/mercado-pago-service', () => ({ mercadoPagoService: {
  getPreapproval: mocks.getPreapproval,
  getAuthorizedPayment: mocks.getAuthorizedPayment,
  mapPreapprovalStatusToSubscription: () => ({ status: 'CANCELED', gracePeriodEnd: null }),
} }));
vi.mock('@/lib/services/subscriptions', () => ({ subscriptionsService: {
  getUserState: mocks.getUserState, updateUserState: mocks.update,
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
  vi.stubEnv('MP_SUBSCRIPTION_AMOUNT', '1500');
  vi.stubEnv('MP_SUBSCRIPTION_CURRENCY', 'ARS');
  vi.stubEnv('MP_SUBSCRIPTION_PLANS_JSON', '');
  mocks.getAuthorizedPayment.mockReset();
  mocks.getUserState.mockReset().mockResolvedValue({ status: 'ACTIVE', mp_preapproval_id: resourceId, current_period_end: null, grace_period_end: null });
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

describe('billing webhook provider/tenant failures with isolated doubles', () => {
  it('requires a configured secret', async () => {
    vi.stubEnv('MP_WEBHOOK_SECRET', '');
    expect((await GET(request('GET', `data.id=${resourceId}`))).status).toBe(401);
    expect(mocks.lookup).not.toHaveBeenCalled();
  });
  it('rejects a forged signature before any database or provider work', async () => {
    const req = request('GET', `data.id=${resourceId}`);
    req.headers.set('x-signature', 'ts=123,v1=forged');
    expect((await GET(req)).status).toBe(401);
    expect(mocks.lookup).not.toHaveBeenCalled();
  });
  it('does not attach an old or unassociated subscription using external_reference', async () => {
    mocks.lookup.mockResolvedValue({ data: null });
    expect((await GET(request('GET', `data.id=${resourceId}`))).status).toBe(200);
    expect(mocks.lookup).toHaveBeenCalledTimes(1);
    expect(mocks.getPreapproval).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it.each([{ id: 'other-resource', external_reference: 'user-a' }, { id: resourceId, external_reference: 'other-user' }])('rejects mismatched provider association %j', fixture => {
    mocks.getPreapproval.mockResolvedValue({ ...fixture, status: 'authorized' });
    return GET(request('GET', `data.id=${resourceId}`)).then(response => {
      expect(response.status).toBe(500);
      expect(mocks.update).not.toHaveBeenCalled();
    });
  });
  it('does not mutate when the association changes between lookups', async () => {
    mocks.getUserState.mockResolvedValue({ status: 'ACTIVE', mp_preapproval_id: 'newer-agreement' });
    expect((await GET(request('GET', `data.id=${resourceId}`))).status).toBe(200);
    expect(mocks.getPreapproval).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it('passes the pre-fetch snapshot into a conditional write and retries database failures', async () => {
    mocks.update.mockRejectedValue(new Error('snapshot changed'));
    expect((await GET(request('GET', `data.id=${resourceId}`))).status).toBe(500);
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ expectedState: expect.objectContaining({ mp_preapproval_id: resourceId, status: 'ACTIVE' }) }));
  });
  it('does not acknowledge a failed owner lookup as success', async () => {
    mocks.lookup.mockResolvedValue({ data: null, error: new Error('database unavailable') });
    expect((await GET(request('GET', `data.id=${resourceId}`))).status).toBe(500);
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it('is idempotent when a repeated event has no state change', async () => {
    mocks.getUserState.mockResolvedValue({ status: 'CANCELED', mp_preapproval_id: resourceId, current_period_end: null, grace_period_end: null });
    expect((await GET(request('GET', `data.id=${resourceId}`))).status).toBe(200);
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it('ignores unsupported event types rather than treating payments as subscriptions', async () => {
    expect((await POST(request('POST', `data.id=${resourceId}&type=payment`, { data: { id: resourceId }, type: 'payment' }))).status).toBe(200);
    expect(mocks.getPreapproval).not.toHaveBeenCalled();
    expect(mocks.lookup).not.toHaveBeenCalled();
  });
  it('processes a signed installment only after verifying its subscription and user', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-09T03:00:00Z'));
    try {
      mocks.getAuthorizedPayment.mockResolvedValue({ id: '123', preapproval_id: resourceId, external_reference: 'user-a', currency_id: 'ARS', transaction_amount: 1500, debit_date: '2026-10-01T00:00:00Z', payment: { id: '456', status: 'approved' } });
      mocks.getPreapproval.mockResolvedValue({ id: resourceId, external_reference: 'user-a', status: 'authorized', auto_recurring: { frequency: 1, frequency_type: 'months', currency_id: 'ARS', transaction_amount: 1500 } });
      const response = await POST(request('POST', 'data.id=123&type=subscription_authorized_payment', { data: { id: 123 }, type: 'subscription_authorized_payment' }, '123'));
      expect(response.status).toBe(200);
      expect(mocks.getAuthorizedPayment).toHaveBeenCalledTimes(2);
      expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ userId: 'user-a', currentPeriodEnd: '2026-11-01T00:00:00.000Z' }));
    } finally { vi.useRealTimers(); }
  });
});

describe('CNF-13 payment correlation with explicit provider/database doubles', () => {
  it.each(['success', 'rejection', 'provider-failure'] as const)('records %s without provider contents', async mode => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const index = { success: '07', rejection: '08', 'provider-failure': '09' }[mode];
    const owner = '00000000-0000-4000-8000-000000000013';
    mocks.lookup.mockResolvedValue({ data: { id: owner } });
    mocks.getPreapproval.mockResolvedValue({ id: resourceId, external_reference: owner, status: 'cancelled' });
    if (mode === 'provider-failure') mocks.getPreapproval.mockRejectedValue(new Error('SECRETO_CNF13 SUELDO_PRIVADO_CNF13 IMAGEN_CNF13'));
    const req = request('POST', `data.id=${resourceId}`, { data: { id: resourceId },
      token: 'SECRETO_CNF13', description: 'SUELDO_PRIVADO_CNF13', image: 'IMAGEN_CNF13' });
    req.headers.set('x-correlation-id', `corr-cnf13-${index}`);
    if (mode === 'rejection') req.headers.set('x-signature', 'ts=123,v1=forged');
    try {
      const response = await POST(req);
      expect(response.status).toBe(mode === 'success' ? 200 : mode === 'rejection' ? 401 : 500);
      expect(response.headers.get('x-correlation-id')).toBe(`corr-cnf13-${index}`);
      const rows = info.mock.calls.map(([raw]) => JSON.parse(raw));
      expect(rows.at(-1)).toMatchObject({ channel: 'payment',
        outcome: mode === 'success' ? 'success' : mode === 'rejection' ? 'rejected' : 'error' });
      if (mode === 'success') expect(rows).toContainEqual(expect.objectContaining({
        component: 'database', action: 'persist', referenceType: 'user', referenceId: owner,
      }));
      if (mode === 'provider-failure') expect(rows.filter(row => row.outcome === 'error')
        .every(row => row.failureClass === 'provider')).toBe(true);
      if (mode !== 'success') expect(mocks.update).not.toHaveBeenCalled();
      const logs = JSON.stringify([...info.mock.calls, ...error.mock.calls]);
      for (const marker of ['SECRETO_CNF13', 'SUELDO_PRIVADO_CNF13', 'IMAGEN_CNF13']) expect(logs).not.toContain(marker);
    } finally { info.mockRestore(); error.mockRestore(); }
  });
});
