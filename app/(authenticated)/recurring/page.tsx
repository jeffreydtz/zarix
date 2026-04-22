'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CategoryIcon, getOptionTextIcon } from '@/lib/category-icons';

interface RecurringRule {
  id: string;
  type: string;
  amount: number;
  currency: string;
  description: string;
  frequency: string;
  start_date: string;
  end_date: string | null;
  last_executed_date: string | null;
  is_active: boolean;
  is_subscription: boolean;
  subscription_name: string | null;
  subscription_plan: string | null;
  notification_enabled: boolean;
  category?: { name: string; icon: string } | null;
  account?: { name: string; currency: string } | null;
}

interface AccountOption {
  id: string;
  name: string;
  currency: string;
  icon: string | null;
}

interface CategoryOption {
  id: string;
  type: string;
  name: string;
  icon: string;
}

interface SubscriptionPlan {
  id: string;
  name: string;
  amount: number;
  currency: string;
  frequency: 'monthly' | 'yearly';
}

interface SubscriptionService {
  id: string;
  name: string;
  icon: string;
  plans: SubscriptionPlan[];
}

type RuleKind = 'subscription' | 'generic';

const FREQ_LABELS: Record<string, string> = {
  daily: 'Diaria',
  weekly: 'Semanal',
  monthly: 'Mensual',
  yearly: 'Anual',
};

const FREQ_ICONS: Record<string, string> = {
  daily: '📅',
  weekly: '📆',
  monthly: '🗓️',
  yearly: '📊',
};

const SUBSCRIPTION_SERVICES: SubscriptionService[] = [
  {
    id: 'netflix',
    name: 'Netflix',
    icon: '🎬',
    plans: [
      { id: 'netflix-standard', name: 'Estándar', amount: 9.99, currency: 'USD', frequency: 'monthly' },
      { id: 'netflix-premium', name: 'Premium', amount: 13.99, currency: 'USD', frequency: 'monthly' },
    ],
  },
  {
    id: 'youtube-premium',
    name: 'YouTube Premium',
    icon: '▶️',
    plans: [{ id: 'yt-premium-individual', name: 'Individual', amount: 8.49, currency: 'USD', frequency: 'monthly' }],
  },
  {
    id: 'spotify',
    name: 'Spotify',
    icon: '🎧',
    plans: [
      { id: 'spotify-individual', name: 'Individual', amount: 4.99, currency: 'USD', frequency: 'monthly' },
      { id: 'spotify-family', name: 'Familiar', amount: 7.99, currency: 'USD', frequency: 'monthly' },
    ],
  },
  {
    id: 'disney-plus',
    name: 'Disney+',
    icon: '🏰',
    plans: [{ id: 'disney-plus-standard', name: 'Estándar', amount: 10.99, currency: 'USD', frequency: 'monthly' }],
  },
  {
    id: 'chatgpt',
    name: 'ChatGPT',
    icon: '🤖',
    plans: [{ id: 'chatgpt-plus', name: 'Plus', amount: 20, currency: 'USD', frequency: 'monthly' }],
  },
  {
    id: 'cursor',
    name: 'Cursor',
    icon: '⌨️',
    plans: [{ id: 'cursor-pro', name: 'Pro', amount: 20, currency: 'USD', frequency: 'monthly' }],
  },
];

function formatMoney(value: number, currency: string): string {
  const locale = currency === 'ARS' ? 'es-AR' : 'en-US';
  return `${currency} ${value.toLocaleString(locale, { maximumFractionDigits: 2 })}`;
}

function getCurrencyTotalsRows(totals: Record<string, number>): Array<{ currency: string; amount: number }> {
  const preferredCurrencies = ['ARS', 'USD'];
  const remainingCurrencies = Object.keys(totals).filter((currency) => !preferredCurrencies.includes(currency));
  const orderedCurrencies = [...preferredCurrencies, ...remainingCurrencies];

  return orderedCurrencies.map((currency) => ({
    currency,
    amount: totals[currency] ?? 0,
  }));
}

function monthlyEquivalent(amount: number, frequency: string): number {
  if (frequency === 'yearly') return amount / 12;
  if (frequency === 'weekly') return amount * 4.345;
  if (frequency === 'daily') return amount * 30;
  return amount;
}

function yearlyEquivalent(amount: number, frequency: string): number {
  if (frequency === 'monthly') return amount * 12;
  if (frequency === 'weekly') return amount * 52;
  if (frequency === 'daily') return amount * 365;
  return amount;
}

function getNextRenewalDate(rule: RecurringRule): Date | null {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const startDate = new Date(`${rule.start_date}T00:00:00`);
  if (Number.isNaN(startDate.getTime())) return null;

  let next = new Date(startDate);

  if (rule.frequency === 'daily') {
    const dayMs = 24 * 60 * 60 * 1000;
    const diffDays = Math.floor((today.getTime() - next.getTime()) / dayMs);
    if (diffDays > 0) next = new Date(next.getTime() + diffDays * dayMs);
  }

  while (next < today) {
    if (rule.frequency === 'daily') {
      next.setDate(next.getDate() + 1);
    } else if (rule.frequency === 'weekly') {
      next.setDate(next.getDate() + 7);
    } else if (rule.frequency === 'yearly') {
      next.setFullYear(next.getFullYear() + 1);
    } else {
      next.setMonth(next.getMonth() + 1);
    }
  }

  if (rule.end_date) {
    const endDate = new Date(`${rule.end_date}T00:00:00`);
    if (!Number.isNaN(endDate.getTime()) && next > endDate) return null;
  }

  return next;
}

function getStatusTag(rule: RecurringRule): string {
  if (!rule.is_active) return 'Pausada';
  const next = getNextRenewalDate(rule);
  if (!next) return 'Finalizada';
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.ceil((next.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
  if (diffDays <= 0) return 'Se renueva hoy';
  if (diffDays <= 3) return `Renueva en ${diffDays}d`;
  return `Próxima: ${next.toLocaleDateString('es-AR')}`;
}

export default function RecurringPage() {
  const [rules, setRules] = useState<RecurringRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [accounts, setAccounts] = useState<AccountOption[]>([]);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [form, setForm] = useState({
    kind: 'subscription' as RuleKind,
    serviceId: '',
    planId: '',
    type: 'expense',
    accountId: '',
    amount: '',
    currency: 'USD',
    categoryId: '',
    description: '',
    frequency: 'monthly',
    startDate: new Date().toISOString().split('T')[0],
    endDate: '',
    notificationEnabled: true,
  });
  const [saving, setSaving] = useState(false);

  const selectedService = useMemo(
    () => SUBSCRIPTION_SERVICES.find((service) => service.id === form.serviceId),
    [form.serviceId]
  );
  const selectedPlan = useMemo(
    () => selectedService?.plans.find((plan) => plan.id === form.planId) ?? null,
    [selectedService, form.planId]
  );

  const fetchRules = async () => {
    setLoading(true);
    try {
      const [rulesRes, accountsRes, categoriesRes] = await Promise.all([
        fetch('/api/recurring'),
        fetch('/api/accounts'),
        fetch('/api/categories'),
      ]);
      const [rulesData, accountsData, categoriesData] = await Promise.all([
        rulesRes.json(),
        accountsRes.json(),
        categoriesRes.json(),
      ]);
      setRules(Array.isArray(rulesData) ? rulesData : []);
      setAccounts(Array.isArray(accountsData) ? accountsData : []);
      setCategories(Array.isArray(categoriesData) ? categoriesData : []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRules();
  }, []);

  useEffect(() => {
    if (!selectedPlan) return;
    setForm((prev) => ({
      ...prev,
      amount: String(selectedPlan.amount),
      currency: selectedPlan.currency,
      frequency: selectedPlan.frequency,
      description: `${selectedService?.name ?? ''} ${selectedPlan.name}`.trim(),
      type: 'expense',
    }));
  }, [selectedPlan, selectedService]);

  const toggleActive = async (rule: RecurringRule) => {
    try {
      await fetch(`/api/recurring/${rule.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !rule.is_active }),
      });
      setRules((prev) => prev.map((r) => (r.id === rule.id ? { ...r, is_active: !r.is_active } : r)));
    } catch (e) {
      console.error(e);
    }
  };

  const toggleNotification = async (rule: RecurringRule) => {
    try {
      await fetch(`/api/recurring/${rule.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notificationEnabled: !rule.notification_enabled }),
      });
      setRules((prev) =>
        prev.map((r) => (r.id === rule.id ? { ...r, notification_enabled: !r.notification_enabled } : r))
      );
    } catch (e) {
      console.error(e);
    }
  };

  const deleteRule = async (id: string) => {
    if (!confirm('¿Eliminar esta regla recurrente?')) return;
    await fetch(`/api/recurring/${id}`, { method: 'DELETE' });
    setRules((prev) => prev.filter((r) => r.id !== id));
  };

  const resetForm = () => {
    setForm({
      kind: 'subscription',
      serviceId: '',
      planId: '',
      type: 'expense',
      accountId: '',
      amount: '',
      currency: 'USD',
      categoryId: '',
      description: '',
      frequency: 'monthly',
      startDate: new Date().toISOString().split('T')[0],
      endDate: '',
      notificationEnabled: true,
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        type: form.kind === 'subscription' ? 'expense' : form.type,
        accountId: form.accountId,
        amount: form.amount,
        currency: form.currency,
        categoryId: form.categoryId,
        description: form.description,
        frequency: form.frequency,
        startDate: form.startDate,
        endDate: form.endDate,
        isSubscription: form.kind === 'subscription',
        subscriptionName: form.kind === 'subscription' ? selectedService?.name ?? null : null,
        subscriptionPlan: form.kind === 'subscription' ? selectedPlan?.name ?? null : null,
        notificationEnabled: form.notificationEnabled,
      };
      const res = await fetch('/api/recurring', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        setShowForm(false);
        resetForm();
        fetchRules();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  const activeRules = rules.filter((rule) => rule.is_active);
  const pausedRules = rules.filter((rule) => !rule.is_active);
  const activeSubscriptions = activeRules.filter((rule) => rule.is_subscription);

  const monthlyByCurrency = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const rule of activeSubscriptions) {
      totals[rule.currency] = (totals[rule.currency] || 0) + monthlyEquivalent(Number(rule.amount), rule.frequency);
    }
    return totals;
  }, [activeSubscriptions]);

  const yearlyByCurrency = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const rule of activeSubscriptions) {
      totals[rule.currency] = (totals[rule.currency] || 0) + yearlyEquivalent(Number(rule.amount), rule.frequency);
    }
    return totals;
  }, [activeSubscriptions]);

  const upcomingRenewals = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return activeSubscriptions
      .map((rule) => {
        const nextDate = getNextRenewalDate(rule);
        if (!nextDate) return null;
        const diffDays = Math.ceil((nextDate.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
        return { rule, nextDate, diffDays };
      })
      .filter((item): item is { rule: RecurringRule; nextDate: Date; diffDays: number } => Boolean(item))
      .filter((item) => item.diffDays <= 14)
      .sort((a, b) => a.nextDate.getTime() - b.nextDate.getTime());
  }, [activeSubscriptions]);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 transition-colors">
      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-800 dark:text-slate-100">Suscripciones y recurrentes</h1>
            <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
              Elegí servicio, plan, renovación y notificaciones en un solo lugar.
            </p>
          </div>
          <motion.button
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setShowForm(!showForm)}
            className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-purple-500 to-indigo-500 hover:from-purple-600 hover:to-indigo-600 text-white rounded-xl font-semibold text-sm shadow-lg shadow-purple-500/20 transition-colors"
          >
            <span>{showForm ? '✕' : '+'}</span> {showForm ? 'Cerrar' : 'Nueva regla'}
          </motion.button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <StatCard
            title="Suscripciones activas"
            value={String(activeSubscriptions.length)}
            caption={`${activeSubscriptions.filter((rule) => rule.notification_enabled).length} con notificación`}
            gradient="from-fuchsia-500/10 to-purple-500/10"
          />
          <StatCard
            title="Costo mensual estimado"
            value={<CurrencyBreakdown totals={monthlyByCurrency} />}
            caption="Gastos estimados separados por moneda"
            gradient="from-sky-500/10 to-indigo-500/10"
          />
          <StatCard
            title="Costo anual estimado"
            value={<CurrencyBreakdown totals={yearlyByCurrency} />}
            caption={`${upcomingRenewals.length} renovaciones en 14 días`}
            gradient="from-emerald-500/10 to-teal-500/10"
          />
        </div>

        <AnimatePresence>
          {showForm && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 border border-slate-200 dark:border-slate-700 shadow-sm">
                <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-4">✨ Nueva regla</h2>

                <div className="inline-flex p-1 rounded-xl bg-slate-100 dark:bg-slate-700 mb-5">
                  <button
                    type="button"
                    onClick={() => setForm((prev) => ({ ...prev, kind: 'subscription', type: 'expense' }))}
                    className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${form.kind === 'subscription' ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-sm' : 'text-slate-500 dark:text-slate-300'}`}
                  >
                    📺 Suscripción
                  </button>
                  <button
                    type="button"
                    onClick={() => setForm((prev) => ({ ...prev, kind: 'generic' }))}
                    className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${form.kind === 'generic' ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-sm' : 'text-slate-500 dark:text-slate-300'}`}
                  >
                    🔁 Recurrente general
                  </button>
                </div>

                <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {form.kind === 'subscription' && (
                    <>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Servicio</label>
                        <select
                          required
                          value={form.serviceId}
                          onChange={(e) => setForm((prev) => ({ ...prev, serviceId: e.target.value, planId: '' }))}
                          className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-purple-500 outline-none"
                        >
                          <option value="">Elegí una plataforma</option>
                          {SUBSCRIPTION_SERVICES.map((service) => (
                            <option key={service.id} value={service.id}>
                              {service.icon} {service.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Plan</label>
                        <select
                          required
                          value={form.planId}
                          onChange={(e) => setForm((prev) => ({ ...prev, planId: e.target.value }))}
                          disabled={!selectedService}
                          className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 disabled:opacity-60 focus:ring-2 focus:ring-purple-500 outline-none"
                        >
                          <option value="">Elegí un plan</option>
                          {(selectedService?.plans || []).map((plan) => (
                            <option key={plan.id} value={plan.id}>
                              {plan.name} - {formatMoney(plan.amount, plan.currency)} / {FREQ_LABELS[plan.frequency]}
                            </option>
                          ))}
                        </select>
                      </div>
                    </>
                  )}

                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Descripción</label>
                    <input
                      required
                      value={form.description}
                      onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                      placeholder={form.kind === 'subscription' ? 'ej: Netflix Premium' : 'ej: Alquiler, Sueldo'}
                      className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-purple-500 outline-none"
                    />
                  </div>

                  <div className="flex gap-2">
                    <div className="flex-1">
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Monto</label>
                      <input
                        required
                        type="number"
                        step="0.01"
                        min="0.01"
                        value={form.amount}
                        onChange={(e) => setForm((prev) => ({ ...prev, amount: e.target.value }))}
                        className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-purple-500 outline-none"
                      />
                    </div>
                    <div className="w-28">
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Moneda</label>
                      <select
                        value={form.currency}
                        onChange={(e) => setForm((prev) => ({ ...prev, currency: e.target.value }))}
                        className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-purple-500 outline-none"
                      >
                        <option value="ARS">ARS</option>
                        <option value="USD">USD</option>
                      </select>
                    </div>
                  </div>

                  {form.kind === 'generic' && (
                    <>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Tipo</label>
                        <select
                          value={form.type}
                          onChange={(e) => setForm((prev) => ({ ...prev, type: e.target.value }))}
                          className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-purple-500 outline-none"
                        >
                          <option value="expense">💸 Gasto</option>
                          <option value="income">💰 Ingreso</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Categoría</label>
                        <select
                          value={form.categoryId}
                          onChange={(e) => setForm((prev) => ({ ...prev, categoryId: e.target.value }))}
                          className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-purple-500 outline-none"
                        >
                          <option value="">Sin categoría</option>
                          {categories
                            .filter((category) => category.type === form.type)
                            .map((category) => (
                              <option key={category.id} value={category.id}>
                                {getOptionTextIcon(category.icon)} {category.name}
                              </option>
                            ))}
                        </select>
                      </div>
                    </>
                  )}

                  {form.kind === 'subscription' && (
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Categoría</label>
                      <select
                        value={form.categoryId}
                        onChange={(e) => setForm((prev) => ({ ...prev, categoryId: e.target.value }))}
                        className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-purple-500 outline-none"
                      >
                        <option value="">Sin categoría</option>
                        {categories
                          .filter((category) => category.type === 'expense')
                          .map((category) => (
                            <option key={category.id} value={category.id}>
                              {getOptionTextIcon(category.icon)} {category.name}
                            </option>
                          ))}
                      </select>
                    </div>
                  )}

                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Cuenta</label>
                    <select
                      required
                      value={form.accountId}
                      onChange={(e) => setForm((prev) => ({ ...prev, accountId: e.target.value }))}
                      className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-purple-500 outline-none"
                    >
                      <option value="">Seleccionar cuenta</option>
                      {accounts.map((account) => (
                        <option key={account.id} value={account.id}>
                          {account.icon} {account.name} ({account.currency})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Frecuencia</label>
                    <select
                      value={form.frequency}
                      onChange={(e) => setForm((prev) => ({ ...prev, frequency: e.target.value }))}
                      className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-purple-500 outline-none"
                    >
                      <option value="daily">📅 Diaria</option>
                      <option value="weekly">📆 Semanal</option>
                      <option value="monthly">🗓️ Mensual</option>
                      <option value="yearly">📊 Anual</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                      {form.kind === 'subscription' ? 'Fecha de renovación' : 'Fecha de inicio'}
                    </label>
                    <input
                      type="date"
                      value={form.startDate}
                      onChange={(e) => setForm((prev) => ({ ...prev, startDate: e.target.value }))}
                      className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-purple-500 outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Fecha de fin (opcional)</label>
                    <input
                      type="date"
                      value={form.endDate}
                      onChange={(e) => setForm((prev) => ({ ...prev, endDate: e.target.value }))}
                      className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-purple-500 outline-none"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <button
                      type="button"
                      onClick={() => setForm((prev) => ({ ...prev, notificationEnabled: !prev.notificationEnabled }))}
                      className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl border transition-colors ${form.notificationEnabled ? 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-200' : 'border-slate-300 text-slate-600 dark:border-slate-600 dark:text-slate-300'}`}
                    >
                      <span className="font-medium">🔔 Notificar cuando se ejecute la renovación</span>
                      <span>{form.notificationEnabled ? 'Activo' : 'Desactivado'}</span>
                    </button>
                  </div>

                  <div className="md:col-span-2">
                    <button
                      type="submit"
                      disabled={saving}
                      className="w-full py-3 bg-gradient-to-r from-purple-500 to-indigo-500 hover:from-purple-600 hover:to-indigo-600 text-white rounded-xl font-semibold transition-colors disabled:opacity-60"
                    >
                      {saving ? 'Guardando...' : 'Guardar regla'}
                    </button>
                  </div>
                </form>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {upcomingRenewals.length > 0 && (
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-4">
            <h3 className="font-semibold text-slate-800 dark:text-slate-100 mb-2">📅 Próximas renovaciones (14 días)</h3>
            <div className="flex flex-wrap gap-2">
              {upcomingRenewals.map(({ rule, nextDate, diffDays }) => (
                <span
                  key={rule.id}
                  className="text-xs px-3 py-1.5 rounded-full bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-200 border border-indigo-100 dark:border-indigo-700/40"
                >
                  {(rule.subscription_name || rule.description)} · {nextDate.toLocaleDateString('es-AR')} {diffDays <= 0 ? '(hoy)' : `(en ${diffDays}d)`}
                </span>
              ))}
            </div>
          </div>
        )}

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((index) => (
              <div key={index} className="h-24 rounded-2xl bg-slate-200 dark:bg-slate-700 animate-pulse" />
            ))}
          </div>
        ) : rules.length === 0 ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-20">
            <div className="text-6xl mb-4">✨</div>
            <h3 className="text-xl font-bold text-slate-700 dark:text-slate-300 mb-2">Sin reglas todavía</h3>
            <p className="text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
              Cargá tus suscripciones (Netflix, YouTube Premium y más) y también cualquier gasto o ingreso recurrente.
            </p>
          </motion.div>
        ) : (
          <div className="space-y-4">
            {activeRules.length > 0 && (
              <RuleSection
                title={`✅ Activas (${activeRules.length})`}
                rules={activeRules}
                onToggle={toggleActive}
                onToggleNotification={toggleNotification}
                onDelete={deleteRule}
              />
            )}
            {pausedRules.length > 0 && (
              <RuleSection
                title={`⏸️ Pausadas (${pausedRules.length})`}
                rules={pausedRules}
                onToggle={toggleActive}
                onToggleNotification={toggleNotification}
                onDelete={deleteRule}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({
  title,
  value,
  caption,
  gradient,
}: {
  title: string;
  value: ReactNode;
  caption: string;
  gradient: string;
}) {
  return (
    <div className={`rounded-2xl border border-slate-200 dark:border-slate-700 p-4 bg-gradient-to-br ${gradient} bg-white dark:bg-slate-800`}>
      <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">{title}</p>
      <div className="text-lg font-bold text-slate-800 dark:text-slate-100 mt-1">{value}</div>
      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{caption}</p>
    </div>
  );
}

function CurrencyBreakdown({ totals }: { totals: Record<string, number> }) {
  const rows = getCurrencyTotalsRows(totals);
  const hasAnyValue = Object.keys(totals).length > 0;

  if (!hasAnyValue) {
    return <p className="text-base font-semibold">ARS 0 · USD 0</p>;
  }

  return (
    <div className="space-y-0.5">
      {rows.map(({ currency, amount }) => (
        <p key={currency} className="text-base font-semibold leading-snug">
          {formatMoney(amount, currency)}
        </p>
      ))}
    </div>
  );
}

function RuleSection({
  title,
  rules,
  onToggle,
  onToggleNotification,
  onDelete,
}: {
  title: string;
  rules: RecurringRule[];
  onToggle: (rule: RecurringRule) => void;
  onToggleNotification: (rule: RecurringRule) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div>
      <h2 className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">{title}</h2>
      <div className="space-y-3">
        {rules.map((rule) => (
          <RuleCard
            key={rule.id}
            rule={rule}
            onToggle={onToggle}
            onToggleNotification={onToggleNotification}
            onDelete={onDelete}
          />
        ))}
      </div>
    </div>
  );
}

function RuleCard({
  rule,
  onToggle,
  onToggleNotification,
  onDelete,
}: {
  rule: RecurringRule;
  onToggle: (rule: RecurringRule) => void;
  onToggleNotification: (rule: RecurringRule) => void;
  onDelete: (id: string) => void;
}) {
  const typeEmoji = rule.type === 'expense' ? '💸' : '💰';
  const freqIcon = FREQ_ICONS[rule.frequency] || '🔄';
  const freqLabel = FREQ_LABELS[rule.frequency] || rule.frequency;
  const status = getStatusTag(rule);
  const title = rule.is_subscription ? `${rule.subscription_name || rule.description}` : rule.description;
  const subtitle = rule.is_subscription && rule.subscription_plan ? `${rule.subscription_plan}` : freqLabel;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={`p-4 rounded-2xl border transition-colors ${
        rule.is_active
          ? 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700'
          : 'bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 opacity-65'
      }`}
    >
      <div className="flex items-center gap-4">
        <div className={`w-11 h-11 rounded-xl flex items-center justify-center text-xl shrink-0 ${rule.is_subscription ? 'bg-fuchsia-100 dark:bg-fuchsia-900/30' : 'bg-purple-100 dark:bg-purple-900/30'}`}>
          {rule.is_subscription ? '📺' : freqIcon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-slate-800 dark:text-slate-100 truncate">
              {typeEmoji} {title}
            </span>
            <span className="text-xs bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-300 px-2 py-0.5 rounded-full">
              {subtitle}
            </span>
            {rule.category && (
              <span className="text-xs bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-300 px-2 py-0.5 rounded-full">
                <span className="inline-flex items-center gap-1">
                  <CategoryIcon icon={rule.category.icon} className="w-3 h-3" />
                  {rule.category.name}
                </span>
              </span>
            )}
          </div>
          <div className="text-sm text-slate-500 dark:text-slate-400 flex items-center gap-2 flex-wrap mt-0.5">
            <span className="font-medium text-slate-700 dark:text-slate-300">{formatMoney(Number(rule.amount), rule.currency)}</span>
            <span>·</span>
            <span>{freqLabel}</span>
            {rule.account && (
              <>
                <span>·</span>
                <span>{rule.account.name}</span>
              </>
            )}
            <span>·</span>
            <span>{status}</span>
          </div>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between gap-2">
        <button
          onClick={() => onToggleNotification(rule)}
          className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${rule.notification_enabled ? 'border-emerald-200 text-emerald-700 bg-emerald-50 dark:border-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-200' : 'border-slate-300 text-slate-500 dark:border-slate-600 dark:text-slate-300'}`}
        >
          {rule.notification_enabled ? '🔔 Notificación activa' : '🔕 Sin notificación'}
        </button>
        <div className="flex items-center gap-2">
          <button
            onClick={() => onToggle(rule)}
            className={`relative w-11 h-6 rounded-full transition-colors ${rule.is_active ? 'bg-purple-500' : 'bg-slate-300 dark:bg-slate-600'}`}
            title={rule.is_active ? 'Pausar' : 'Activar'}
          >
            <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform shadow ${rule.is_active ? 'translate-x-5' : ''}`} />
          </button>
          <button
            onClick={() => onDelete(rule.id)}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors text-sm"
          >
            🗑️
          </button>
        </div>
      </div>
    </motion.div>
  );
}
