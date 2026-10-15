import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  user: { id: 'U1' } as { id: string } | null,
  normalFrom: vi.fn(), serviceFrom: vi.fn(), serviceClient: vi.fn(), recompute: vi.fn(),
}));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: mocks.user } }) }, from: mocks.normalFrom }),
  createServiceClientSync: mocks.serviceClient,
}));
vi.mock('@/lib/services/transactions', () => ({
  transactionsService: { recomputeAccountBalanceFromLedger: mocks.recompute }, computeTransferAmounts: vi.fn(),
}));
import { DELETE as deleteOne } from '@/app/api/transactions/[id]/route';
import { DELETE as deleteBulk } from '@/app/api/transactions/bulk/route';
import { DELETE as deleteAll } from '@/app/api/transactions/route';

function query(reply: Record<string, unknown>) {
  const q: Record<string, any> = {};
  for (const name of ['delete', 'eq', 'in', 'select']) q[name] = vi.fn(() => q);
  q.then = (resolve: (value: unknown) => unknown) => Promise.resolve(reply).then(resolve);
  return q;
}
const request = (body?: unknown) => new NextRequest('https://example.test/api/transactions', {
  method: 'DELETE', ...(body === undefined ? {} : { body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }),
});
const context = { params: Promise.resolve({ id: 'T1' }) };
let normal: ReturnType<typeof query>, service: ReturnType<typeof query>;
beforeEach(() => {
  vi.clearAllMocks(); mocks.user = { id: 'U1' };
  normal = query({ data: [{ id: 'T1' }, { id: 'T2' }], count: 2, error: null });
  service = query({ data: [], error: null });
  mocks.normalFrom.mockReturnValue(normal); mocks.serviceFrom.mockReturnValue(service);
  mocks.serviceClient.mockReturnValue({ from: mocks.serviceFrom });
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('transaction deletion keeps the verified actor JWT for the database audit', () => {
  it('deletes one movement with the authenticated client and existing owner filter', async () => {
    expect((await deleteOne(request(), context)).status).toBe(204);
    expect(mocks.normalFrom).toHaveBeenCalledWith('transactions');
    expect(normal.delete).toHaveBeenCalledOnce();
    expect(normal.eq.mock.calls).toEqual([['id', 'T1'], ['user_id', 'U1']]);
    expect(mocks.serviceClient).not.toHaveBeenCalled();
  });
  it('uses the authenticated client for every bulk DELETE, keeping the service read scoped', async () => {
    const response = await deleteBulk(request({ transactionIds: ['T1', 'T2'] }));
    expect(response.status).toBe(200); expect((await response.json()).deleted).toBe(2);
    expect(normal.delete).toHaveBeenCalledOnce();
    expect(normal.eq).toHaveBeenCalledWith('user_id', 'U1');
    expect(normal.in).toHaveBeenCalledWith('id', ['T1', 'T2']);
    expect(service.eq).toHaveBeenCalledWith('user_id', 'U1');
    expect(service.delete).not.toHaveBeenCalled();
  });
  it('uses the authenticated client for confirmed DELETE_ALL and returns its exact count', async () => {
    const response = await deleteAll(request({ confirm: 'DELETE_ALL' }));
    expect(response.status).toBe(200); expect((await response.json()).deleted).toBe(2);
    expect(normal.delete).toHaveBeenCalledWith({ count: 'exact' });
    expect(normal.eq).toHaveBeenCalledWith('user_id', 'U1');
    expect(mocks.serviceClient).not.toHaveBeenCalled();
  });
  it('keeps DELETE_ALL explicit confirmation', async () => {
    expect((await deleteAll(request({}))).status).toBe(400);
    expect(mocks.normalFrom).not.toHaveBeenCalled();
  });
  it('does not log a private row from the bulk reconciliation error', async () => {
    mocks.serviceFrom.mockReturnValue(query({ data: [{ account_id: 'A1', destination_account_id: null }], error: null }));
    const error = { details: 'synthetic private financial row' };
    mocks.recompute.mockRejectedValueOnce(error);
    expect((await deleteBulk(request({ transactionIds: ['T1'] }))).status).toBe(200);
    expect(mocks.recompute).toHaveBeenCalledWith('U1', 'A1');
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain(error.details);
  });
  it.each(['one', 'bulk', 'all'])('never falls back to a privileged DELETE after %s fails', async kind => {
    const error = { code: '42501', message: 'synthetic audit denied', details: 'synthetic private previous row' };
    mocks.normalFrom.mockReturnValue(query({ data: null, error }));
    const response = kind === 'one' ? await deleteOne(request(), context)
      : kind === 'bulk' ? await deleteBulk(request({ transactionIds: ['T1'] }))
      : await deleteAll(request({ confirm: 'DELETE_ALL' }));
    expect(response.status).toBe(500);
    expect(mocks.normalFrom).toHaveBeenCalledOnce();
    expect(service.delete).not.toHaveBeenCalled();
    expect(vi.mocked(console.error).mock.calls.flat()).not.toContain(error);
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain(error.details);
  });
  it.each(['one', 'bulk', 'all'])('rejects an absent session before the %s write', async kind => {
    mocks.user = null;
    const response = kind === 'one' ? await deleteOne(request(), context)
      : kind === 'bulk' ? await deleteBulk(request({ transactionIds: ['T1'] }))
      : await deleteAll(request({ confirm: 'DELETE_ALL' }));
    expect(response.status).toBe(401);
    expect(mocks.normalFrom).not.toHaveBeenCalled(); expect(mocks.serviceClient).not.toHaveBeenCalled();
  });
});
