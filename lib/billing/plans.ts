export interface BillingPlan {
  id: string;
  name: string;
  description: string;
  amount: number;
  currency: string;
  interval: 'monthly' | 'yearly';
  reason: string;
}

interface RawBillingPlan {
  id?: unknown;
  name?: unknown;
  description?: unknown;
  amount?: unknown;
  currency?: unknown;
  interval?: unknown;
  reason?: unknown;
}

function normalizePlan(raw: RawBillingPlan): BillingPlan | null {
  const id = typeof raw.id === 'string' ? raw.id.trim() : '';
  const name = typeof raw.name === 'string' ? raw.name.trim() : '';
  const description = typeof raw.description === 'string' ? raw.description.trim() : '';
  const amount = Number(raw.amount);
  const currency = typeof raw.currency === 'string' ? raw.currency.trim().toUpperCase() : '';
  const interval = raw.interval === 'yearly' ? 'yearly' : raw.interval === 'monthly' ? 'monthly' : null;
  const reason = typeof raw.reason === 'string' ? raw.reason.trim() : '';

  if (!id || !name || !description || !Number.isFinite(amount) || amount <= 0 || !currency || !interval) {
    return null;
  }

  return {
    id,
    name,
    description,
    amount,
    currency,
    interval,
    reason: reason || `${name} - Zarix`,
  };
}

function fallbackPlan(): BillingPlan {
  const amount = Number(process.env.MP_SUBSCRIPTION_AMOUNT ?? 0);
  const safeAmount = Number.isFinite(amount) && amount > 0 ? amount : 9.99;
  const currency = (process.env.MP_SUBSCRIPTION_CURRENCY || 'ARS').toUpperCase();
  const reason = process.env.MP_SUBSCRIPTION_REASON || 'Zarix SaaS';

  return {
    id: 'zarix-monthly',
    name: 'Zarix Mensual',
    description: 'Acceso al orquestador IA, integraciones y soporte base.',
    amount: safeAmount,
    currency,
    interval: 'monthly',
    reason,
  };
}

export function getBillingPlans(): BillingPlan[] {
  const fromJson = process.env.MP_SUBSCRIPTION_PLANS_JSON;
  if (!fromJson) {
    return [fallbackPlan()];
  }

  try {
    const parsed = JSON.parse(fromJson) as unknown;
    if (!Array.isArray(parsed)) {
      return [fallbackPlan()];
    }

    const plans = parsed
      .map((entry) => normalizePlan(entry as RawBillingPlan))
      .filter((plan): plan is BillingPlan => Boolean(plan));

    if (plans.length === 0) {
      return [fallbackPlan()];
    }

    return plans;
  } catch {
    return [fallbackPlan()];
  }
}

export function getBillingPlanById(planId: string): BillingPlan | null {
  const plan = getBillingPlans().find((entry) => entry.id === planId);
  return plan || null;
}
