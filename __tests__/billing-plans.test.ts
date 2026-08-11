import { describe, it, expect, afterEach, vi } from 'vitest';
import { getBillingPlans, getBillingPlanById } from '@/lib/billing/plans';

// Clear the env keys the module reads so the process' real environment
// cannot leak into these assertions.
function clearBillingEnv() {
  vi.stubEnv('MP_SUBSCRIPTION_PLANS_JSON', '');
  vi.stubEnv('MP_SUBSCRIPTION_AMOUNT', '');
  vi.stubEnv('MP_SUBSCRIPTION_CURRENCY', '');
  vi.stubEnv('MP_SUBSCRIPTION_REASON', '');
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('getBillingPlans — fallback (no MP_SUBSCRIPTION_PLANS_JSON)', () => {
  it('returns the default zarix-monthly plan', () => {
    clearBillingEnv();
    const plans = getBillingPlans();
    expect(plans).toHaveLength(1);
    expect(plans[0]).toMatchObject({
      id: 'zarix-monthly',
      name: 'Zarix Mensual',
      amount: 9.99,
      currency: 'ARS',
      interval: 'monthly',
    });
  });

  it('honors MP_SUBSCRIPTION_AMOUNT/CURRENCY/REASON overrides', () => {
    clearBillingEnv();
    vi.stubEnv('MP_SUBSCRIPTION_AMOUNT', '19.99');
    vi.stubEnv('MP_SUBSCRIPTION_CURRENCY', 'usd');
    vi.stubEnv('MP_SUBSCRIPTION_REASON', 'Custom reason');
    const [plan] = getBillingPlans();
    expect(plan.amount).toBe(19.99);
    expect(plan.currency).toBe('USD');
    expect(plan.reason).toBe('Custom reason');
  });

  it('ignores a non-positive/invalid MP_SUBSCRIPTION_AMOUNT and uses 9.99', () => {
    clearBillingEnv();
    vi.stubEnv('MP_SUBSCRIPTION_AMOUNT', '-5');
    expect(getBillingPlans()[0].amount).toBe(9.99);
    vi.stubEnv('MP_SUBSCRIPTION_AMOUNT', 'abc');
    expect(getBillingPlans()[0].amount).toBe(9.99);
  });
});

describe('getBillingPlans — MP_SUBSCRIPTION_PLANS_JSON parsing', () => {
  it('parses and normalizes a valid plan array', () => {
    clearBillingEnv();
    vi.stubEnv(
      'MP_SUBSCRIPTION_PLANS_JSON',
      JSON.stringify([
        { id: 'p1', name: 'Plan 1', description: 'desc', amount: '100', currency: 'ars', interval: 'yearly' },
      ])
    );
    const plans = getBillingPlans();
    expect(plans).toHaveLength(1);
    expect(plans[0]).toMatchObject({
      id: 'p1',
      name: 'Plan 1',
      amount: 100,
      currency: 'ARS',
      interval: 'yearly',
      reason: 'Plan 1 - Zarix', // default reason derived from name
    });
  });

  it('keeps a provided reason and drops invalid entries', () => {
    clearBillingEnv();
    vi.stubEnv(
      'MP_SUBSCRIPTION_PLANS_JSON',
      JSON.stringify([
        { id: 'ok', name: 'Good', description: 'd', amount: 50, currency: 'USD', interval: 'monthly', reason: 'Keep me' },
        { id: 'bad', name: '', description: 'd', amount: 50, currency: 'USD', interval: 'monthly' }, // missing name
        { id: 'bad2', name: 'X', description: 'd', amount: 0, currency: 'USD', interval: 'monthly' }, // amount <= 0
        { id: 'bad3', name: 'Y', description: 'd', amount: 5, currency: 'USD', interval: 'weekly' }, // bad interval
      ])
    );
    const plans = getBillingPlans();
    expect(plans).toHaveLength(1);
    expect(plans[0].id).toBe('ok');
    expect(plans[0].reason).toBe('Keep me');
  });

  it('falls back when JSON is malformed', () => {
    clearBillingEnv();
    vi.stubEnv('MP_SUBSCRIPTION_PLANS_JSON', '{not valid json');
    expect(getBillingPlans()[0].id).toBe('zarix-monthly');
  });

  it('falls back when JSON is not an array', () => {
    clearBillingEnv();
    vi.stubEnv('MP_SUBSCRIPTION_PLANS_JSON', JSON.stringify({ id: 'x' }));
    expect(getBillingPlans()[0].id).toBe('zarix-monthly');
  });

  it('falls back when every entry is invalid', () => {
    clearBillingEnv();
    vi.stubEnv('MP_SUBSCRIPTION_PLANS_JSON', JSON.stringify([{ id: 'x' }]));
    expect(getBillingPlans()[0].id).toBe('zarix-monthly');
  });
});

describe('getBillingPlanById', () => {
  it('resolves the fallback plan by its id', () => {
    clearBillingEnv();
    expect(getBillingPlanById('zarix-monthly')?.id).toBe('zarix-monthly');
  });

  it('returns null for an unknown id', () => {
    clearBillingEnv();
    expect(getBillingPlanById('does-not-exist')).toBeNull();
  });
});
