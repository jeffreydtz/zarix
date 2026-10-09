// Isolated contract tests: every provider request uses a fetch double, never Mercado Pago.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mercadoPagoService, type MercadoPagoPreapproval } from '@/lib/services/mercado-pago-service';

const now = new Date('2026-10-09T03:00:00Z');
const base: MercadoPagoPreapproval = {
  id: 'preapproval-fixture', external_reference: 'user-fixture', status: 'authorized',
  next_payment_date: '2026-11-09T03:00:00Z',
  auto_recurring: { frequency: 1, frequency_type: 'months', transaction_amount: 1500, currency_id: 'ARS' },
};
const fetchMock = vi.fn();
beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
  vi.stubEnv('MP_ACCESS_TOKEN', 'isolated-test-token');
  vi.stubEnv('MP_API_BASE_URL', 'https://provider.example.test');
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe('Mercado Pago provider contracts with explicit doubles', () => {
  it('creates a pending agreement using server-selected amount, currency and annual recurrence', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify(base)));
    await mercadoPagoService.createPreapproval({ userId: 'user-fixture', payerEmail: 'payer@example.test', reason: 'Annual test', backUrl: 'https://zarix.example.test/settings', transactionAmount: 18000, currencyId: 'ARS', frequency: 12, frequencyType: 'months' });
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('https://provider.example.test/preapproval');
    expect(options.headers.Authorization).toBe('Bearer isolated-test-token');
    expect(JSON.parse(options.body)).toMatchObject({ status: 'pending', external_reference: 'user-fixture', auto_recurring: { transaction_amount: 18000, currency_id: 'ARS', frequency: 12, frequency_type: 'months' } });
    expect(options.cache).toBe('no-store');
    expect(options.signal).toBeInstanceOf(AbortSignal);
  });
  it('fetches invoice state and cancels only the selected encoded agreement', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify(base)));
    await mercadoPagoService.getAuthorizedPayment('123');
    expect(fetchMock.mock.calls[0][0]).toBe('https://provider.example.test/authorized_payments/123');
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ ...base, status: 'cancelled' })));
    await mercadoPagoService.cancelPreapproval('mp/id');
    expect(fetchMock.mock.calls[1][0]).toBe('https://provider.example.test/preapproval/mp%2Fid');
    expect(fetchMock.mock.calls[1][1].method).toBe('PUT');
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ status: 'cancelled' });
  });
  it('fails closed without an access token and never makes a provider call', async () => {
    vi.stubEnv('MP_ACCESS_TOKEN', '');
    await expect(mercadoPagoService.getPreapproval('id')).rejects.toThrow('MP_ACCESS_TOKEN');
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('encodes the resource ID and propagates provider errors without logging the provider body', async () => {
    fetchMock.mockResolvedValue(new Response('sensitive provider content', { status: 502 }));
    await expect(mercadoPagoService.getPreapproval('id/other?value')).rejects.toThrow('MercadoPago API 502');
    expect(fetchMock.mock.calls[0][0]).toBe('https://provider.example.test/preapproval/id%2Fother%3Fvalue');
    fetchMock.mockResolvedValue(new Response('sensitive provider content', { status: 401 }));
    await expect(mercadoPagoService.getPreapproval('id')).rejects.not.toThrow('sensitive provider content');
  });
});

describe('Mercado Pago subscription lifecycle is not proof of payment', () => {
  it.each(['authorized', 'active', 'pending', 'unexpected', 'rejected'])('does not create paid time for %s', status => {
    expect(mercadoPagoService.mapPreapprovalStatusToSubscription({ ...base, status }, 'PAST_DUE', now)).toEqual({ status: 'PAST_DUE' });
  });
  it.each(['paused', 'cancelled', 'canceled'])('cancels %s without erasing paid time', status => {
    expect(mercadoPagoService.mapPreapprovalStatusToSubscription({ ...base, status }, 'ACTIVE', now)).toEqual({ status: 'CANCELED', gracePeriodEnd: null });
  });
});
