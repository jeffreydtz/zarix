// Isolated Supabase query double: verifies conditional writes, not deployed RLS.
import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ calls: [] as unknown[][], result: { data: null, error: null } as any }));
vi.mock('@/lib/supabase/server', () => ({ createServiceClientSync: () => ({ from(table: string) {
  mocks.calls.push(['from', table]);
  const query: any = {};
  for (const method of ['update', 'select', 'eq', 'is']) query[method] = (...args: unknown[]) => { mocks.calls.push([method, ...args]); return query; };
  query.single = async () => mocks.result;
  return query;
} }) }));
import { subscriptionsService } from '@/lib/services/subscriptions';
const state = { status: 'ACTIVE' as const, mp_preapproval_id: 'mp-fixture', current_period_end: '2026-11-01T00:00:00Z', grace_period_end: null };
beforeEach(() => { mocks.calls.length = 0; mocks.result = { data: state, error: null }; });
describe('billing persistence compare-and-swap', () => {
  it('scopes a transition to user, association, previous status and previous dates', async () => {
    await subscriptionsService.updateUserState({ userId: 'user-fixture', status: 'CANCELED', gracePeriodEnd: null, expectedState: state });
    expect(mocks.calls).toContainEqual(['eq', 'id', 'user-fixture']);
    expect(mocks.calls).toContainEqual(['eq', 'mp_preapproval_id', 'mp-fixture']);
    expect(mocks.calls).toContainEqual(['eq', 'status', 'ACTIVE']);
    expect(mocks.calls).toContainEqual(['eq', 'current_period_end', state.current_period_end]);
    expect(mocks.calls).toContainEqual(['is', 'grace_period_end', null]);
    expect(mocks.calls).toContainEqual(['update', { status: 'CANCELED', grace_period_end: null }]);
  });
  it('propagates no-match failures so the webhook retries against fresh state', async () => {
    mocks.result = { data: null, error: { code: 'PGRST116', message: 'No matching current version' } };
    await expect(subscriptionsService.updateUserState({ userId: 'user-fixture', status: 'ACTIVE', expectedState: state })).rejects.toMatchObject({ code: 'PGRST116' });
  });
});
