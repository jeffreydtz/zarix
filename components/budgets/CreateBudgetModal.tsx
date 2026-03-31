'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface Category {
  id: string;
  name: string;
  icon: string;
  type: string;
}

interface CreateBudgetModalProps {
  categories: Category[];
  month: string;
  onClose: () => void;
  onCreated: () => void;
}

export default function CreateBudgetModal({
  categories,
  month,
  onClose,
  onCreated,
}: CreateBudgetModalProps) {
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    categoryId: '',
    amount: '',
    currency: 'ARS',
    alertAtPercent: 80,
    rolloverEnabled: false,
  });

  const expenseCategories = categories.filter((c) => c.type === 'expense');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const res = await fetch('/api/budgets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          categoryId: form.categoryId || null,
          month,
          amount: Number(form.amount),
          currency: form.currency,
          alertAtPercent: form.alertAtPercent,
          rolloverEnabled: form.rolloverEnabled,
        }),
      });

      if (!res.ok) throw new Error('Error creando presupuesto');

      onCreated();
      onClose();
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.9, opacity: 0, y: 20 }}
          transition={{ type: 'spring', stiffness: 400, damping: 30 }}
          className="bg-white dark:bg-slate-800 rounded-2xl p-6 w-full max-w-md shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100 mb-6">
            🎯 Nuevo Presupuesto
          </h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Categoría */}
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Categoría
              </label>
              <select
                value={form.categoryId}
                onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 outline-none"
              >
                <option value="">General (sin categoría)</option>
                {expenseCategories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.icon} {cat.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Monto + Moneda */}
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Monto límite
                </label>
                <input
                  type="number"
                  required
                  value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                  placeholder="80.000"
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
              <div className="w-28">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Moneda
                </label>
                <select
                  value={form.currency}
                  onChange={(e) => setForm({ ...form, currency: e.target.value })}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 outline-none"
                >
                  <option value="ARS">ARS</option>
                  <option value="USD">USD</option>
                </select>
              </div>
            </div>

            {/* Alert percent */}
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Alerta al {form.alertAtPercent}% del presupuesto
              </label>
              <input
                type="range"
                min={50}
                max={100}
                step={5}
                value={form.alertAtPercent}
                onChange={(e) => setForm({ ...form, alertAtPercent: Number(e.target.value) })}
                className="w-full accent-blue-500"
              />
              <div className="flex justify-between text-xs text-slate-400 mt-1">
                <span>50%</span>
                <span className="font-semibold text-blue-500">{form.alertAtPercent}%</span>
                <span>100%</span>
              </div>
            </div>

            {/* Rollover */}
            <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-700/50">
              <div>
                <div className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  Rollover mensual
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  El sobrante pasa al mes siguiente
                </div>
              </div>
              <button
                type="button"
                onClick={() => setForm({ ...form, rolloverEnabled: !form.rolloverEnabled })}
                className={`relative w-12 h-6 rounded-full transition-colors ${
                  form.rolloverEnabled ? 'bg-blue-500' : 'bg-slate-300 dark:bg-slate-600'
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform shadow ${
                    form.rolloverEnabled ? 'translate-x-6' : ''
                  }`}
                />
              </button>
            </div>

            {/* Buttons */}
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-3 rounded-xl border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={loading || !form.amount}
                className="flex-1 py-3 rounded-xl bg-blue-500 hover:bg-blue-600 text-white font-semibold transition-colors disabled:opacity-50"
              >
                {loading ? 'Guardando...' : 'Crear Presupuesto'}
              </button>
            </div>
          </form>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
