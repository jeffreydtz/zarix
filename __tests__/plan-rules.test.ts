import { describe, expect, it } from 'vitest';
import { effectivePlan, PLAN_LIMITS, planError } from '@/lib/plans/rules';
const now = new Date('2026-10-09T12:00:00.000Z');
const future = '2026-11-01T00:00:00.000Z';
const past = '2026-10-01T00:00:00.000Z';
describe('proposed plan policy', () => {
  it('keeps commercial allowances explicit without invented prices', () => {
    expect(PLAN_LIMITS).toEqual({ free: { accounts: 3, ocr: 0, ai: 0 }, premium: { accounts: 20, ocr: 20, ai: 40 } });
  });
  it.each(['ACTIVE', 'CANCELED'])('retains paid-through %s entitlement', status => {
    expect(effectivePlan({ status, current_period_end: future, grace_period_end: null }, now)).toBe('premium');
    expect(effectivePlan({ status, current_period_end: now.toISOString(), grace_period_end: null }, now)).toBe('free');
  });
  it.each([null, '', 'invalid', past])('fails closed for default ACTIVE with invalid/expired end %s', end => {
    expect(effectivePlan({ status: 'ACTIVE', current_period_end: end, grace_period_end: null }, now)).toBe('free');
  });
  it('requires explicit valid grace and an existing paid period', () => {
    expect(effectivePlan({ status: 'GRACE_PERIOD', current_period_end: past, grace_period_end: future }, now)).toBe('premium');
    expect(effectivePlan({ status: 'GRACE_PERIOD', current_period_end: null, grace_period_end: future }, now)).toBe('free');
    expect(effectivePlan({ status: 'GRACE_PERIOD', current_period_end: past, grace_period_end: past }, now)).toBe('free');
  });
  it('does not authorize unknown statuses or missing user', () => {
    expect(effectivePlan(null, now)).toBe('free');
    expect(effectivePlan({ status: 'PAST_DUE', current_period_end: future, grace_period_end: future }, now)).toBe('free');
  });
  it('maps exact safe domain errors, never arbitrary DB details', () => {
    expect(planError({ message: 'plan_quota_exhausted' })?.status).toBe(429);
    expect(planError({ message: 'secret sql in plan_quota_exhausted' })).toBeUndefined();
  });
});
