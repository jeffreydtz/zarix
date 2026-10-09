// No live provider or database calls: authentication, Mercado Pago and persistence are doubles.
import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ getUser: vi.fn(), getState: vi.fn(), getPreapproval: vi.fn(), cancel: vi.fn(), update: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ auth: { getUser: mocks.getUser } }) }));
vi.mock('@/lib/services/subscriptions', () => ({ subscriptionsService: { getUserState: mocks.getState, updateUserState: mocks.update } }));
vi.mock('@/lib/services/mercado-pago-service', () => ({ mercadoPagoService: { getPreapproval: mocks.getPreapproval, cancelPreapproval: mocks.cancel } }));
import { POST } from '@/app/api/billing/cancel/route';
const state = { status: 'ACTIVE', mp_preapproval_id: 'mp-fixture', current_period_end: '2026-11-01T00:00:00Z', grace_period_end: null };
beforeEach(() => {
  vi.resetAllMocks();
  mocks.getUser.mockResolvedValue({ data: { user: { id: 'user-fixture' } } });
  mocks.getState.mockResolvedValue(state);
  mocks.getPreapproval.mockResolvedValue({ id: 'mp-fixture', external_reference: 'user-fixture', status: 'authorized' });
  mocks.cancel.mockResolvedValue({ id: 'mp-fixture', external_reference: 'user-fixture', status: 'cancelled' });
});
describe('authenticated recurring cancellation', () => {
  it('requires authentication', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });
    expect((await POST()).status).toBe(401); expect(mocks.cancel).not.toHaveBeenCalled();
  });
  it('requires an existing association', async () => {
    mocks.getState.mockResolvedValue({ ...state, mp_preapproval_id: null });
    expect((await POST()).status).toBe(404); expect(mocks.cancel).not.toHaveBeenCalled();
  });
  it('cannot cancel another user’s agreement', async () => {
    mocks.getPreapproval.mockResolvedValue({ id: 'mp-fixture', external_reference: 'different-user', status: 'authorized' });
    expect((await POST()).status).toBe(502); expect(mocks.cancel).not.toHaveBeenCalled();
  });
  it('preserves verified paid-through time and conditionally saves provider-confirmed cancellation', async () => {
    const response = await POST();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'CANCELED', current_period_end: state.current_period_end });
    expect(mocks.cancel).toHaveBeenCalledExactlyOnceWith('mp-fixture');
    expect(mocks.update).toHaveBeenCalledExactlyOnceWith({ userId: 'user-fixture', status: 'CANCELED', gracePeriodEnd: null, expectedState: state });
  });
  it('is idempotent for a cancellation confirmed in both systems', async () => {
    mocks.getState.mockResolvedValue({ ...state, status: 'CANCELED' });
    mocks.getPreapproval.mockResolvedValue({ id: 'mp-fixture', external_reference: 'user-fixture', status: 'cancelled' });
    expect((await POST()).status).toBe(200); expect(mocks.cancel).not.toHaveBeenCalled(); expect(mocks.update).not.toHaveBeenCalled();
  });
  it('does not mark the account canceled if the provider declines it', async () => {
    mocks.cancel.mockResolvedValue({ id: 'mp-fixture', external_reference: 'user-fixture', status: 'authorized' });
    expect((await POST()).status).toBe(502); expect(mocks.update).not.toHaveBeenCalled();
  });
  it('propagates provider errors without altering account state', async () => {
    mocks.cancel.mockRejectedValue(new Error('provider unavailable'));
    expect((await POST()).status).toBe(500); expect(mocks.update).not.toHaveBeenCalled();
  });
  it('returns retryable error on a concurrent database state change', async () => {
    mocks.update.mockRejectedValue(new Error('snapshot changed'));
    expect((await POST()).status).toBe(500);
  });
});
