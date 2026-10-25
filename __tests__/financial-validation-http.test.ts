import { describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
const mocks = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'owner' } } }) } }),
  createServiceClientSync: () => ({ from: mocks.from, rpc: mocks.rpc }),
}));
vi.mock('@/lib/services/accounts', () => ({ accountsService: {}, normalizeDebtBalanceForStorage: vi.fn() }));
vi.mock('@/lib/services/cotizaciones', () => ({ cotizacionesService: {} }));
import { POST } from '@/app/api/transactions/route';
import { PATCH } from '@/app/api/transactions/[id]/route';
import { errorResponse } from '@/lib/api-handler';

describe('existing financial validation HTTP classification', () => {
  it('rejects sub-cent ARS money with HTTP400 before any DB mutation', async () => {
    const response = await POST(new NextRequest('http://localhost/api/transactions', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'test:precision:request' },
      body: JSON.stringify({ type: 'expense', accountId: 'account', amount: 1.001, currency: 'ARS' }),
    }));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'El monto en ARS, USD o EUR admite hasta dos decimales.' });
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it('rejects signed, boolean, and array amounts instead of coercing them', async () => {
    const headers = { 'Content-Type': 'application/json', 'Idempotency-Key': 'test:sign:request' };
    const base = { type: 'expense', accountId: 'account', currency: 'ARS' };
    for (const amount of ['-50', -50, true, [1000], ['1e3']]) {
      const response = await POST(new NextRequest('http://localhost/api/transactions', {
        method: 'POST', headers, body: JSON.stringify({ ...base, amount }),
      }));
      expect(response.status, String(amount)).toBe(400);
      expect(await response.json()).toMatchObject({ error: expect.stringMatching(/monto/i) });
    }
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('rejects the same coerced amounts on PATCH', async () => {
    for (const amount of ['-50', true, [1000], ['1e3']]) {
      const response = await PATCH(
        new NextRequest('http://localhost/api/transactions/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ account_id: 'account', currency: 'ARS', amount }),
        }),
        { params: Promise.resolve({ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1' }) }
      );
      expect(response.status, String(amount)).toBe(400);
      expect(await response.json()).toMatchObject({ error: expect.stringMatching(/monto/i) });
    }
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('keeps unexpected backend errors masked as HTTP500', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const response = errorResponse(new Error('SYNTHETIC_INTERNAL_DETAIL'));
      expect(response.status).toBe(500);
      expect(await response.json()).toEqual({ error: 'Ocurrió un error procesando la solicitud.' });
    } finally { log.mockRestore(); }
  });
});
