import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const owner = '00000000-0000-4000-8000-000000000001';
const accountId = '00000000-0000-4000-8000-000000000002';
const transactionId = '00000000-0000-4000-8000-000000000003';
const mocks = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn(), fx: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: '00000000-0000-4000-8000-000000000001' } } }) } }),
  createServiceClientSync: () => mocks,
}));
vi.mock('@/lib/services/cotizaciones', () => ({ cotizacionesService: { getExchangeRate: mocks.fx } }));
import { POST } from '@/app/api/transactions/route';

function request(correlation: string, amount = 1500, currency = 'ARS') {
  return new NextRequest('http://localhost/api/transactions', {
    method: 'POST', headers: { 'content-type': 'application/json', 'idempotency-key': `manual:${correlation}`,
      'x-correlation-id': correlation, authorization: 'SECRETO_CNF13' },
    body: JSON.stringify({ accountId, type: 'expense', amount, currency,
      description: 'SUELDO_PRIVADO_CNF13', notes: 'IMAGEN_CNF13' }),
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.from.mockImplementation((table: string) => {
    const result = table === 'transaction_requests' ? { data: null }
      : { data: { id: accountId, user_id: owner, currency: 'ARS', is_active: true } };
    const q: any = {};
    for (const method of ['select', 'eq']) q[method] = () => q;
    q.maybeSingle = q.single = async () => result;
    return q;
  });
  mocks.rpc.mockResolvedValue({ data: { id: transactionId, user_id: owner, amount: 1500 } });
  mocks.fx.mockResolvedValue(1200);
  vi.spyOn(console, 'info').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe('manual route/service correlation with explicit database doubles', () => {
  it('links request, service and persistence to one transaction UUID', async () => {
    const response = await POST(request('corr-cnf13-01'));
    expect(response.status).toBe(201);
    expect(response.headers.get('x-correlation-id')).toBe('corr-cnf13-01');
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith('create_transaction_once', expect.any(Object));
    const rows = vi.mocked(console.info).mock.calls.map(([raw]) => JSON.parse(raw));
    expect(rows.filter(row => row.referenceId === transactionId).map(row => row.component)).toEqual(['database', 'service']);
    expect(rows.at(-1)).toMatchObject({ correlationId: 'corr-cnf13-01', outcome: 'success', status: 201 });
  });
  it('records validation rejection without invoking financial persistence', async () => {
    const response = await POST(request('corr-cnf13-02', -1));
    expect(response.status).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();
    const rows = vi.mocked(console.info).mock.calls.map(([raw]) => JSON.parse(raw));
    expect(rows.at(-1)).toMatchObject({ outcome: 'rejected', failureClass: 'validation', status: 400 });
  });
  it('classifies an SQL failure and never logs row contents or exception details', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: 'XX000',
      message: 'SECRETO_CNF13', details: 'SUELDO_PRIVADO_CNF13 IMAGEN_CNF13' } });
    const response = await POST(request('corr-cnf13-03'));
    expect(response.status).toBe(500);
    const rows = vi.mocked(console.info).mock.calls.map(([raw]) => JSON.parse(raw));
    expect(rows.at(-1)).toMatchObject({ failureClass: 'consistency', outcome: 'error', status: 500 });
    expect(rows.some(row => row.outcome === 'success' && row.referenceId === transactionId)).toBe(false);
    const logs = JSON.stringify([...vi.mocked(console.info).mock.calls, ...vi.mocked(console.error).mock.calls]);
    for (const marker of ['SECRETO_CNF13', 'SUELDO_PRIVADO_CNF13', 'IMAGEN_CNF13']) {
      expect(logs).not.toContain(marker);
      expect(await response.clone().text()).not.toContain(marker);
    }
  });

  it.each(['unavailable', 'invalid-rate'])('classifies FX %s without inventing a database failure', async mode => {
    if (mode === 'unavailable') mocks.fx.mockRejectedValue(Object.assign(new Error('SECRETO_CNF13'), { status: 429 }));
    else mocks.fx.mockResolvedValue(0);
    const response = await POST(request('corr-cnf13-fx', 1, 'USD'));
    expect(response.status).toBe(500);
    expect(mocks.rpc).not.toHaveBeenCalled();
    const rows = vi.mocked(console.info).mock.calls.map(([raw]) => JSON.parse(raw));
    expect(rows.filter(row => row.outcome === 'error').every(row => row.failureClass === 'provider')).toBe(true);
    expect(JSON.stringify(rows)).not.toContain('SECRETO_CNF13');
  });
});
