'use client';

import { useEffect, useState } from 'react';
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
  category?: { name: string; icon: string } | null;
  account?: { name: string; currency: string } | null;
}

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

export default function RecurringPage() {
  const [rules, setRules] = useState<RecurringRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [form, setForm] = useState({
    type: 'expense',
    accountId: '',
    amount: '',
    currency: 'ARS',
    categoryId: '',
    description: '',
    frequency: 'monthly',
    startDate: new Date().toISOString().split('T')[0],
    endDate: '',
  });
  const [saving, setSaving] = useState(false);

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

  useEffect(() => { fetchRules(); }, []);

  const toggleActive = async (rule: RecurringRule) => {
    try {
      await fetch(`/api/recurring/${rule.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !rule.is_active }),
      });
      setRules((prev) => prev.map((r) => r.id === rule.id ? { ...r, is_active: !r.is_active } : r));
    } catch (e) {
      console.error(e);
    }
  };

  const deleteRule = async (id: string) => {
    if (!confirm('¿Eliminar esta regla recurrente?')) return;
    await fetch(`/api/recurring/${id}`, { method: 'DELETE' });
    setRules((prev) => prev.filter((r) => r.id !== id));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch('/api/recurring', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        setShowForm(false);
        setForm({ type: 'expense', accountId: '', amount: '', currency: 'ARS', categoryId: '', description: '', frequency: 'monthly', startDate: new Date().toISOString().split('T')[0], endDate: '' });
        fetchRules();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  const activeRules = rules.filter((r) => r.is_active);
  const pausedRules = rules.filter((r) => !r.is_active);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 transition-colors">
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">

        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-800 dark:text-slate-100">Recurrentes</h1>
            <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
              Transacciones automáticas periódicas
            </p>
          </div>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setShowForm(!showForm)}
            className="flex items-center gap-2 px-4 py-2.5 bg-purple-500 hover:bg-purple-600 text-white rounded-xl font-semibold text-sm shadow-lg shadow-purple-500/20 transition-colors"
          >
            <span>{showForm ? '✕' : '+'}</span> {showForm ? 'Cancelar' : 'Nueva regla'}
          </motion.button>
        </div>

        {/* Create form */}
        <AnimatePresence>
          {showForm && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 border border-slate-200 dark:border-slate-700 shadow-sm">
                <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-4">
                  🔄 Nueva Regla Recurrente
                </h2>
                <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Descripción</label>
                    <input
                      required
                      value={form.description}
                      onChange={(e) => setForm({ ...form, description: e.target.value })}
                      placeholder="ej: Alquiler, Netflix, Sueldo..."
                      className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-purple-500 outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Tipo</label>
                    <select
                      value={form.type}
                      onChange={(e) => setForm({ ...form, type: e.target.value })}
                      className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-purple-500 outline-none"
                    >
                      <option value="expense">💸 Gasto</option>
                      <option value="income">💰 Ingreso</option>
                    </select>
                  </div>

                  <div className="flex gap-2">
                    <div className="flex-1">
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Monto</label>
                      <input
                        required
                        type="number"
                        value={form.amount}
                        onChange={(e) => setForm({ ...form, amount: e.target.value })}
                        placeholder="50000"
                        className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-purple-500 outline-none"
                      />
                    </div>
                    <div className="w-24">
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Moneda</label>
                      <select
                        value={form.currency}
                        onChange={(e) => setForm({ ...form, currency: e.target.value })}
                        className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-purple-500 outline-none"
                      >
                        <option value="ARS">ARS</option>
                        <option value="USD">USD</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Cuenta</label>
                    <select
                      required
                      value={form.accountId}
                      onChange={(e) => setForm({ ...form, accountId: e.target.value })}
                      className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-purple-500 outline-none"
                    >
                      <option value="">Seleccionar cuenta</option>
                      {accounts.map((a: any) => (
                        <option key={a.id} value={a.id}>{a.icon} {a.name} ({a.currency})</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Frecuencia</label>
                    <select
                      value={form.frequency}
                      onChange={(e) => setForm({ ...form, frequency: e.target.value })}
                      className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-purple-500 outline-none"
                    >
                      <option value="daily">📅 Diaria</option>
                      <option value="weekly">📆 Semanal</option>
                      <option value="monthly">🗓️ Mensual</option>
                      <option value="yearly">📊 Anual</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Categoría</label>
                    <select
                      value={form.categoryId}
                      onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
                      className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-purple-500 outline-none"
                    >
                      <option value="">Sin categoría</option>
                      {categories.filter((c: any) => c.type === form.type).map((c: any) => (
                        <option key={c.id} value={c.id}>{getOptionTextIcon(c.icon)} {c.name}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Fecha de inicio</label>
                    <input
                      type="date"
                      value={form.startDate}
                      onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                      className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-purple-500 outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Fecha de fin (opcional)</label>
                    <input
                      type="date"
                      value={form.endDate}
                      onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                      className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-purple-500 outline-none"
                    />
                  </div>

                  <div className="md:col-span-2 flex gap-3 pt-2">
                    <button
                      type="submit"
                      disabled={saving}
                      className="flex-1 py-3 bg-purple-500 hover:bg-purple-600 text-white rounded-xl font-semibold transition-colors disabled:opacity-50"
                    >
                      {saving ? 'Guardando...' : 'Crear Regla'}
                    </button>
                  </div>
                </form>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Rules list */}
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-20 rounded-2xl bg-slate-200 dark:bg-slate-700 animate-pulse" />
            ))}
          </div>
        ) : rules.length === 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center py-20"
          >
            <div className="text-6xl mb-4">🔄</div>
            <h3 className="text-xl font-bold text-slate-700 dark:text-slate-300 mb-2">Sin reglas recurrentes</h3>
            <p className="text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
              Creá reglas para registrar automáticamente gastos e ingresos que se repiten cada mes, semana o año.
            </p>
          </motion.div>
        ) : (
          <div className="space-y-4">
            {activeRules.length > 0 && (
              <div>
                <h2 className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">
                  ✅ Activas ({activeRules.length})
                </h2>
                <div className="space-y-3">
                  {activeRules.map((rule) => (
                    <RuleCard key={rule.id} rule={rule} onToggle={toggleActive} onDelete={deleteRule} />
                  ))}
                </div>
              </div>
            )}
            {pausedRules.length > 0 && (
              <div>
                <h2 className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">
                  ⏸️ Pausadas ({pausedRules.length})
                </h2>
                <div className="space-y-3">
                  {pausedRules.map((rule) => (
                    <RuleCard key={rule.id} rule={rule} onToggle={toggleActive} onDelete={deleteRule} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function RuleCard({
  rule,
  onToggle,
  onDelete,
}: {
  rule: RecurringRule;
  onToggle: (r: RecurringRule) => void;
  onDelete: (id: string) => void;
}) {
  const typeEmoji = rule.type === 'expense' ? '💸' : '💰';
  const freqIcon = FREQ_ICONS[rule.frequency] || '🔄';
  const freqLabel = FREQ_LABELS[rule.frequency] || rule.frequency;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: -16 }}
      animate={{ opacity: 1, x: 0 }}
      className={`flex items-center gap-4 p-4 rounded-2xl border transition-colors ${
        rule.is_active
          ? 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700'
          : 'bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 opacity-60'
      }`}
    >
      <div className="w-10 h-10 rounded-xl bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center text-xl shrink-0">
        {freqIcon}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-slate-800 dark:text-slate-100 truncate">
            {typeEmoji} {rule.description}
          </span>
          {rule.category && (
            <span className="text-xs bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 px-2 py-0.5 rounded-full shrink-0">
              <span className="inline-flex items-center gap-1">
                <CategoryIcon icon={rule.category.icon} className="w-3 h-3" />
                {rule.category.name}
              </span>
            </span>
          )}
        </div>
        <div className="text-sm text-slate-500 dark:text-slate-400 flex items-center gap-2 flex-wrap mt-0.5">
          <span className="font-medium text-slate-700 dark:text-slate-300">
            ${Number(rule.amount).toLocaleString('es-AR')} {rule.currency}
          </span>
          <span>·</span>
          <span>{freqLabel}</span>
          {rule.account && (
            <>
              <span>·</span>
              <span>{rule.account.name}</span>
            </>
          )}
          {rule.last_executed_date && (
            <>
              <span>·</span>
              <span>Última ejecución: {new Date(rule.last_executed_date).toLocaleDateString('es-AR')}</span>
            </>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={() => onToggle(rule)}
          className={`relative w-11 h-6 rounded-full transition-colors ${
            rule.is_active ? 'bg-purple-500' : 'bg-slate-300 dark:bg-slate-600'
          }`}
          title={rule.is_active ? 'Pausar' : 'Activar'}
        >
          <span
            className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform shadow ${
              rule.is_active ? 'translate-x-5' : ''
            }`}
          />
        </button>
        <button
          onClick={() => onDelete(rule.id)}
          className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors text-sm"
        >
          🗑️
        </button>
      </div>
    </motion.div>
  );
}
