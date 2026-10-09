import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createServiceClientSync: () => ({ rpc: mocks.rpc }) }));
import { withPlanQuota, AmbiguousPlanWorkError } from '@/lib/plans/service';
const input = { userId: 'owner', feature: 'ai' as const, requestKey: 'fixture-request', fingerprint: 'hello' };
beforeEach(() => mocks.rpc.mockReset().mockResolvedValue({ data: { replayed: false }, error: null }));
describe('provider quota reservation and retries', () => {
  it('reserves before work and commits response once', async () => {
    const work = vi.fn(async () => {
      expect(mocks.rpc).toHaveBeenCalledOnce();
      return { answer: 'fixture' };
    });
    await expect(withPlanQuota(input, work)).resolves.toEqual({ answer: 'fixture' });
    expect(mocks.rpc.mock.calls[0][0]).toBe('reserve_plan_usage');
    expect(mocks.rpc.mock.calls[1]).toEqual(['finish_plan_usage', expect.objectContaining({ p_user_id: 'owner', p_succeeded: true, p_result: { answer: 'fixture' } })]);
  });
  it('replays persisted results without touching provider', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: { replayed: true, result: { answer: 'saved' } }, error: null });
    const work = vi.fn();
    expect(await withPlanQuota(input, work)).toEqual({ answer: 'saved' });
    expect(work).not.toHaveBeenCalled();expect(mocks.rpc).toHaveBeenCalledOnce();
  });
  it('does not call provider when quota or entitlement denied', async () => {
    mocks.rpc.mockResolvedValueOnce({ error: { message: 'plan_quota_exhausted' } });
    const work = vi.fn();
    await expect(withPlanQuota(input, work)).rejects.toMatchObject({ status: 429 });
    expect(work).not.toHaveBeenCalled();
  });
  it('releases failed provider reservation with fenced token', async () => {
    const failure = new Error('provider unavailable');
    await expect(withPlanQuota(input, async () => { throw failure; })).rejects.toBe(failure);
    expect(mocks.rpc.mock.calls[1][1]).toMatchObject({ p_succeeded: false, p_token: mocks.rpc.mock.calls[0][1].p_token });
  });
  it('retains uncertain post-write work for reconciliation, never auto-replays it', async () => {
    await expect(withPlanQuota(input, async () => { throw new AmbiguousPlanWorkError(new Error('timeout after write')); })).rejects.toBeInstanceOf(AmbiguousPlanWorkError);
    expect(mocks.rpc).toHaveBeenCalledOnce();
  });
  it('does not refund successful work when persisting completion fails', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: { replayed: false } }).mockResolvedValueOnce({ error: { message: 'network failure' } });
    await expect(withPlanQuota(input, async () => ({ answer: 'done' }))).rejects.toEqual({ message: 'network failure' });
    expect(mocks.rpc).toHaveBeenCalledTimes(2);
    expect(mocks.rpc.mock.calls[1][1].p_succeeded).toBe(true);
  });
  it('rejects invalid oversized request keys without database or provider work', async () => {
    const work = vi.fn();
    await expect(withPlanQuota({ ...input, requestKey: 'x'.repeat(181) }, work)).rejects.toMatchObject({ status: 400 });
    expect(mocks.rpc).not.toHaveBeenCalled();expect(work).not.toHaveBeenCalled();
  });
});
