import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.hoisted(() => vi.fn());
vi.mock('@/lib/supabase/server', () => ({ createServiceClientSync: () => ({ rpc }) }));
import { withPlanQuota, AI_DAILY_CAPS } from '@/lib/plans/service';

const input = { userId: 'u1', feature: 'ai' as const, fingerprint: 'f' };
beforeEach(() => rpc.mockReset());

describe('daily AI/OCR cap', () => {
  it('proposes 20 AI messages and 5 OCR per day', () => {
    expect(AI_DAILY_CAPS).toEqual({ ai: 20, ocr: 5 });
  });
  it('runs work when the durable counter allows it', async () => {
    rpc.mockResolvedValue({ data: { allowed: true, used: 3, limit: 20 }, error: null });
    await expect(withPlanQuota(input, async () => 'ok')).resolves.toBe('ok');
    expect(rpc).toHaveBeenCalledWith('consume_ai_daily_quota', { p_user_id: 'u1', p_feature: 'ai' });
  });
  it('rejects with 429 and never calls the provider when exhausted', async () => {
    rpc.mockResolvedValue({ data: { allowed: false, used: 5, limit: 5 }, error: null });
    const work = vi.fn();
    await expect(withPlanQuota({ ...input, feature: 'ocr' }, work)).rejects.toMatchObject({ status: 429 });
    expect(work).not.toHaveBeenCalled();
  });
  it('cron summaries skip the cap', async () => {
    await expect(withPlanQuota({ ...input, source: 'cron' }, async () => 'ok')).resolves.toBe('ok');
    expect(rpc).not.toHaveBeenCalled();
  });
  it('keeps working before the migration is applied (function missing)', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'Could not find the function public.consume_ai_daily_quota' } });
    await expect(withPlanQuota(input, async () => 'ok')).resolves.toBe('ok');
  });
  it('propagates unexpected database errors', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: '08006', message: 'connection failure' } });
    await expect(withPlanQuota(input, async () => 'ok')).rejects.toMatchObject({ code: '08006' });
  });
});
