import type { MercadoPagoPreapproval, MercadoPagoAuthorizedPayment, SubscriptionTransition } from '@/lib/services/mercado-pago-service';
import type { UserSubscriptionState } from '@/lib/services/subscriptions';
import { getBillingPlans, type BillingPlan } from './plans';

function amount(value: unknown): number {
  return typeof value === 'number' || typeof value === 'string' ? Number(value) : NaN;
}

/** Only explicit server-side commercial terms may establish paid access. */
export function matchesBillingPlan(preapproval: MercadoPagoPreapproval, plan: BillingPlan): boolean {
  const recurrence = preapproval.auto_recurring;
  return recurrence?.currency_id === plan.currency &&
    amount(recurrence.transaction_amount) === plan.amount &&
    recurrence.frequency_type === 'months' &&
    recurrence.frequency === (plan.interval === 'yearly' ? 12 : 1);
}

function installmentPeriodEnd(debitDate: string, months: number): string | null {
  const start = new Date(debitDate);
  if (!Number.isFinite(start.getTime())) return null;
  // Preserve the invoice's numeric timezone offset when adding calendar months.
  // Converting a late local evening to UTC first can shift the billing day.
  const offset = debitDate.match(/([+-])(\d{2}):?(\d{2})$/);
  const offsetMinutes = offset ? (offset[1] === '-' ? -1 : 1) * (Number(offset[2]) * 60 + Number(offset[3])) : 0;
  const end = new Date(start.getTime() + offsetMinutes * 60_000);
  const day = end.getUTCDate();
  end.setUTCDate(1);
  end.setUTCMonth(end.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 0)).getUTCDate();
  end.setUTCDate(Math.min(day, lastDay));
  return new Date(end.getTime() - offsetMinutes * 60_000).toISOString();
}

/** Uses a fetched invoice's actual payment result, never a notification's body. */
export function mapAuthorizedPayment(
  invoice: MercadoPagoAuthorizedPayment,
  preapproval: MercadoPagoPreapproval,
  current: UserSubscriptionState,
  now = new Date()
): SubscriptionTransition | null {
  const plan = getBillingPlans().find(candidate => matchesBillingPlan(preapproval, candidate));
  if (!plan || invoice.currency_id !== plan.currency || amount(invoice.transaction_amount) !== plan.amount) {
    throw new Error('Mercado Pago payment terms do not match a configured billing plan');
  }
  if (!invoice.debit_date || new Date(invoice.debit_date).getTime() > now.getTime()) {
    throw new Error('Mercado Pago invoice has no valid elapsed billing date');
  }
  const periodEnd = installmentPeriodEnd(invoice.debit_date, plan.interval === 'yearly' ? 12 : 1);
  if (!periodEnd) throw new Error('Mercado Pago invoice has an invalid billing date');
  const paidThrough = current.current_period_end ? Date.parse(current.current_period_end) : 0;
  const periodEndTime = Date.parse(periodEnd);
  const paymentStatus = invoice.payment?.status;

  if (paymentStatus === 'approved') {
    if (!invoice.payment?.id || !['string', 'number'].includes(typeof invoice.payment.id)) {
      throw new Error('Mercado Pago invoice has no approved payment identifier');
    }
    // Repeated/older invoices never extend the paid period from delivery time.
    if (periodEndTime <= paidThrough || periodEndTime <= now.getTime()) return null;
    const canceled = ['paused', 'cancelled', 'canceled'].includes(preapproval.status.toLowerCase());
    return { status: canceled ? 'CANCELED' : 'ACTIVE', currentPeriodEnd: periodEnd, gracePeriodEnd: null };
  }
  if (paymentStatus === 'refunded' || paymentStatus === 'charged_back') {
    // A reversal of an older installment must not revoke a newer paid period.
    if (periodEndTime !== paidThrough) return null;
    return { status: 'PAST_DUE', currentPeriodEnd: now.toISOString(), gracePeriodEnd: null };
  }
  if (paymentStatus === 'rejected') {
    // No free grace on first payment; never restart the grace clock on retries.
    if (!['ACTIVE', 'GRACE_PERIOD'].includes(current.status) || !paidThrough ||
        paidThrough > now.getTime() || periodEndTime <= paidThrough) return null;
    const graceEnd = new Date(paidThrough + 7 * 24 * 60 * 60 * 1000).toISOString();
    return { status: Date.parse(graceEnd) > now.getTime() ? 'GRACE_PERIOD' : 'PAST_DUE', gracePeriodEnd: graceEnd };
  }
  return null;
}
