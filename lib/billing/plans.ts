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

function normalizePlan(value: unknown): BillingPlan | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as RawBillingPlan;
  const id = typeof raw.id === 'string' ? raw.id.trim() : '';
  const name = typeof raw.name === 'string' ? raw.name.trim() : '';
  const description = typeof raw.description === 'string' ? raw.description.trim() : '';
  const amount = typeof raw.amount === 'number' || typeof raw.amount === 'string' ? Number(raw.amount) : NaN;
  const currency = typeof raw.currency === 'string' ? raw.currency.trim().toUpperCase() : '';
  const interval = raw.interval === 'yearly' ? 'yearly' : raw.interval === 'monthly' ? 'monthly' : null;
  const reason = typeof raw.reason === 'string' ? raw.reason.trim() : '';

  if (!id || !name || !description || !Number.isFinite(amount) || amount <= 0 || !/^[A-Z]{3}$/.test(currency) || !interval) {
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

function fallbackPlan(): BillingPlan | null {
  const amount = Number(process.env.MP_SUBSCRIPTION_AMOUNT);
  // A missing or invalid price must never become an accidental live checkout.
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const currency = (process.env.MP_SUBSCRIPTION_CURRENCY || 'ARS').trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) return null;
  const reason = process.env.MP_SUBSCRIPTION_REASON || 'Zarix SaaS';

  return {
    id: 'zarix-monthly',
    name: 'Zarix Mensual',
    description: 'Acceso al orquestador IA, integraciones y soporte base.',
    amount,
    currency,
    interval: 'monthly',
    reason,
  };
}

export function getBillingPlans(): BillingPlan[] {
  const fromJson = process.env.MP_SUBSCRIPTION_PLANS_JSON;
  if (!fromJson) {
    const plan = fallbackPlan();
    return plan ? [plan] : [];
  }

  try {
    const parsed = JSON.parse(fromJson) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    const plans = parsed
      .map(normalizePlan)
      .filter((plan): plan is BillingPlan => Boolean(plan));

    if (plans.length === 0 || new Set(plans.map(plan => plan.id)).size !== plans.length) {
      return [];
    }

    return plans;
  } catch {
    return [];
  }
}

export function getBillingPlanById(planId: string): BillingPlan | null {
  const plan = getBillingPlans().find((entry) => entry.id === planId);
  return plan || null;
}
