import { describe, expect, it } from 'vitest';
import { effectivePlan, PLAN_LIMITS } from '@/lib/plans/rules';

describe('plan policy (limits dropped 2026-10-15, production parity)', () => {
  it('keeps full access for ACTIVE and GRACE_PERIOD users without a paid period', () => {
    expect(effectivePlan({ status: 'ACTIVE', current_period_end: null, grace_period_end: null })).toBe('premium');
    expect(effectivePlan({ status: 'GRACE_PERIOD', current_period_end: null, grace_period_end: null })).toBe('premium');
  });
  it('denies PAST_DUE and expired CANCELED', () => {
    expect(effectivePlan({ status: 'PAST_DUE', current_period_end: null, grace_period_end: null })).toBe('free');
    expect(effectivePlan({ status: 'CANCELED', current_period_end: '2000-01-01T00:00:00Z', grace_period_end: null })).toBe('free');
    expect(effectivePlan(null)).toBe('free');
  });
  it('has no account or metered quotas', () => {
    expect(PLAN_LIMITS.free.accounts).toBeNull();
    expect(PLAN_LIMITS.premium.ai).toBeNull();
  });
});
