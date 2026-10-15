// Synthetic provider fixtures only. These tests do not verify a live MP account.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mapAuthorizedPayment } from '@/lib/billing/subscription-events';
import type { MercadoPagoAuthorizedPayment, MercadoPagoPreapproval } from '@/lib/services/mercado-pago-service';
import type { UserSubscriptionState } from '@/lib/services/subscriptions';
const now = new Date('2026-10-09T03:00:00Z');
const preapproval: MercadoPagoPreapproval = { id: 'mp-fixture', external_reference: 'user-fixture', status: 'authorized', next_payment_date: '2030-01-01T00:00:00Z', auto_recurring: { frequency: 1, frequency_type: 'months', currency_id: 'ARS', transaction_amount: 1500 } };
const invoice: MercadoPagoAuthorizedPayment = { id: 123, preapproval_id: 'mp-fixture', external_reference: 'user-fixture', currency_id: 'ARS', transaction_amount: '1500.00', debit_date: '2026-10-01T03:00:00Z', payment: { id: 456, status: 'approved' } };
const current: UserSubscriptionState = { status: 'PAST_DUE', mp_preapproval_id: 'mp-fixture', current_period_end: null, grace_period_end: null };
beforeEach(() => { vi.stubEnv('MP_SUBSCRIPTION_AMOUNT', '1500'); vi.stubEnv('MP_SUBSCRIPTION_CURRENCY', 'ARS'); vi.stubEnv('MP_SUBSCRIPTION_PLANS_JSON', ''); });
afterEach(() => vi.unstubAllEnvs());
describe('verified installment state and periods', () => {
  it('grants exactly one configured cycle from the billed date, ignoring next_payment_date', () => {
    expect(mapAuthorizedPayment(invoice, preapproval, current, now)).toEqual({ status: 'ACTIVE', currentPeriodEnd: '2026-11-01T03:00:00.000Z', gracePeriodEnd: null });
  });
  it.each(['pending', 'in_process', 'rejected', undefined])('does not grant initial access for payment status %s', status => {
    expect(mapAuthorizedPayment({ ...invoice, payment: { status } }, preapproval, current, now)).toBeNull();
  });
  it.each([{ transaction_amount: 1 }, { currency_id: 'USD' }, { debit_date: 'bad' }, { debit_date: '2026-12-01' }])('rejects invalid invoice terms or future date %j', patch => {
    expect(() => mapAuthorizedPayment({ ...invoice, ...patch }, preapproval, current, now)).toThrow();
  });
  it.each([{ transaction_amount: 1 }, { currency_id: 'USD' }, { frequency: 12 }, { frequency_type: 'days' as const }])('rejects changed subscription terms %j', patch => {
    expect(() => mapAuthorizedPayment(invoice, { ...preapproval, auto_recurring: { ...preapproval.auto_recurring, ...patch } }, current, now)).toThrow();
  });
  it('ignores duplicate and out-of-order older invoices', () => {
    const paid = { ...current, status: 'ACTIVE' as const, current_period_end: '2026-11-01T03:00:00.000Z' };
    expect(mapAuthorizedPayment(invoice, preapproval, paid, now)).toBeNull();
    expect(mapAuthorizedPayment({ ...invoice, debit_date: '2026-09-01T03:00:00Z' }, preapproval, paid, now)).toBeNull();
  });
  it('preserves cancellation on a delayed confirmed payment', () => {
    expect(mapAuthorizedPayment(invoice, { ...preapproval, status: 'cancelled' }, current, now)?.status).toBe('CANCELED');
  });
  it('clamps a calendar-month cycle at month end', () => {
    expect(mapAuthorizedPayment({ ...invoice, debit_date: '2026-01-31T03:00:00Z' }, preapproval, current, new Date('2026-02-01'))?.currentPeriodEnd).toBe('2026-02-28T03:00:00.000Z');
  });
  it('preserves the local billing day near a UTC month boundary', () => {
    expect(mapAuthorizedPayment({ ...invoice, debit_date: '2026-01-30T23:30:00-03:00' }, preapproval, current, new Date('2026-02-01'))?.currentPeriodEnd).toBe('2026-03-01T02:30:00.000Z');
  });
  it('uses twelve months for a verified yearly plan', () => {
    vi.stubEnv('MP_SUBSCRIPTION_PLANS_JSON', JSON.stringify([{ id: 'annual', name: 'Anual', description: 'Un año', amount: 1500, currency: 'ARS', interval: 'yearly' }]));
    expect(mapAuthorizedPayment(invoice, { ...preapproval, auto_recurring: { ...preapproval.auto_recurring, frequency: 12 } }, current, now)?.currentPeriodEnd).toBe('2027-10-01T03:00:00.000Z');
  });
  it('starts grace from the old paid-through date and never extends it on repeated failures', () => {
    const paid = { ...current, status: 'ACTIVE' as const, current_period_end: '2026-10-05T03:00:00.000Z' };
    const rejected = { ...invoice, debit_date: '2026-10-05T03:00:00Z', payment: { status: 'rejected' } };
    const first = mapAuthorizedPayment(rejected, preapproval, paid, now);
    expect(first).toEqual({ status: 'GRACE_PERIOD', gracePeriodEnd: '2026-10-12T03:00:00.000Z' });
    expect(mapAuthorizedPayment(rejected, preapproval, { ...paid, status: 'GRACE_PERIOD', grace_period_end: first!.gracePeriodEnd! }, new Date('2026-10-10'))).toEqual(first);
    expect(mapAuthorizedPayment(rejected, preapproval, paid, new Date('2026-10-13'))?.status).toBe('PAST_DUE');
  });
  it('cannot resurrect grace after a refund or an already-ended grace period', () => {
    expect(mapAuthorizedPayment({ ...invoice, payment: { status: 'rejected' } }, preapproval, { ...current, status: 'PAST_DUE', current_period_end: '2026-10-08T00:00:00Z' }, now)).toBeNull();
  });
  it('requires an actual approved payment ID', () => {
    expect(() => mapAuthorizedPayment({ ...invoice, payment: { status: 'approved' } }, preapproval, current, now)).toThrow('payment identifier');
  });
  it('a historical refund cannot revoke a newer paid installment', () => {
    const refunded = { ...invoice, payment: { status: 'refunded' } };
    expect(mapAuthorizedPayment(refunded, preapproval, { ...current, current_period_end: '2026-12-01T03:00:00.000Z' }, now)).toBeNull();
    expect(mapAuthorizedPayment(refunded, preapproval, { ...current, current_period_end: '2026-11-01T03:00:00.000Z' }, now)?.status).toBe('PAST_DUE');
  });
});
