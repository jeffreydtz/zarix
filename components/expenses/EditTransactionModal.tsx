'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { TransactionWithCategory } from '@/lib/services/transactions';
import { formatAccountSelectLabel } from '@/lib/format-account-select';
import {
  calendarDateToUtcNoonIso,
  isoToLocalDateInputValue,
} from '@/lib/transaction-date';
import {
  TRANSACTION_CURRENCIES,
  coerceTransactionCurrency,
  type TransactionCurrency,
} from '@/lib/constants/transaction-currencies';
import MiniAmountCalculatorButton from '@/components/ui/MiniAmountCalculatorButton';

interface EditTransactionModalProps {
  transaction: TransactionWithCategory;
  accounts: Array<{ id: string; name: string; currency: string; balance: number }>;
  categories: Array<{ id: string; name: string; type: string; icon: string }>;
  onClose: () => void;
  onSave: () => void;
}

export default function EditTransactionModal({
  transaction,
  accounts,
  categories,
  onClose,
  onSave,
}: EditTransactionModalProps) {
  const [loading, setLoading] = useState(false);
  const [duplicating, setDuplicating] = useState(false);
  const [formData, setFormData] = useState<{
    type: typeof transaction.type;
    amount: string;
    currency: TransactionCurrency;
    account_id: string;
    category_id: string;
    description: string;
    transaction_date: string;
    notes: string;
  }>({
    type: transaction.type,
    amount: transaction.amount.toString(),
    currency: coerceTransactionCurrency(transaction.currency),
    account_id: transaction.account_id || '',
    category_id: transaction.category_id || '',
    description: transaction.description || '',
    transaction_date: isoToLocalDateInputValue(transaction.transaction_date),
    notes: transaction.notes || '',
  });

  const filteredCategories = categories.filter(
    (c) => c.type === formData.type || formData.type === 'transfer'
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await fetch(`/api/transactions/${transaction.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          amount: parseFloat(formData.amount),
          transaction_date: calendarDateToUtcNoonIso(formData.transaction_date),
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Error updating transaction');
      }

      onSave();
    } catch (error: any) {
      console.error('Error:', error);
      alert(error.message || 'Error al actualizar');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('¿Eliminar este movimiento?')) return;

    setLoading(true);
    try {
      const response = await fetch(`/api/transactions/${transaction.id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Error al eliminar el movimiento');
      }

      onSave();
    } catch (error: any) {
      console.error('Error:', error);
      alert(error.message || 'Error al eliminar el movimiento');
    } finally {
      setLoading(false);
    }
  };

  const handleDuplicate = async () => {
    setDuplicating(true);
    try {
      const payload: Record<string, unknown> = {
        type: formData.type,
        accountId: formData.account_id,
        amount: parseFloat(formData.amount),
        currency: formData.currency,
        categoryId: formData.category_id || undefined,
        description: formData.description || undefined,
        notes: formData.notes || undefined,
        tags: transaction.tags || undefined,
        transactionDate: calendarDateToUtcNoonIso(formData.transaction_date),
      };

      if (formData.type === 'transfer' && transaction.destination_account_id) {
        payload.destinationAccountId = transaction.destination_account_id;
        if (
          typeof transaction.exchange_rate === 'number' &&
          Number.isFinite(transaction.exchange_rate) &&
          transaction.exchange_rate > 0
        ) {
          payload.exchangeRateOverride = transaction.exchange_rate;
        }
      }

      const response = await fetch('/api/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Error al duplicar el movimiento');
      }

      onSave();
    } catch (error: any) {
      console.error('Error:', error);
      alert(error.message || 'Error al duplicar el movimiento');
    } finally {
      setDuplicating(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="bg-white dark:bg-slate-800 rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto shadow-2xl"
      >
        <div className="sticky top-0 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 px-6 py-4 flex items-center justify-between">
          <h2 className="text-xl font-bold text-slate-800 dark:text-slate-200">
            Editar Movimiento
          </h2>
          <button
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Tipo
            </label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { value: 'expense', label: 'Gasto', color: 'red' },
                { value: 'income', label: 'Ingreso', color: 'green' },
                { value: 'transfer', label: 'Transfer', color: 'blue' },
              ].map((type) => (
                <button
                  key={type.value}
                  type="button"
                  onClick={() => setFormData({ ...formData, type: type.value as any })}
                  className={`p-3 rounded-xl border-2 transition-all font-medium ${
                    formData.type === type.value
                      ? `border-${type.color}-500 bg-${type.color}-50 dark:bg-${type.color}-900/20 text-${type.color}-700 dark:text-${type.color}-300`
                      : 'border-slate-200 dark:border-slate-700 hover:border-slate-300'
                  }`}
                >
                  {type.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Monto
              </label>
              <div className="flex gap-2">
                <input
                  type="number"
                  step="0.01"
                  value={formData.amount}
                  onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                  className="input flex-1 min-w-0"
                  required
                />
                <MiniAmountCalculatorButton
                  currentAmount={formData.amount}
                  onApply={(v) => setFormData({ ...formData, amount: v })}
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Moneda
              </label>
              <select
                value={formData.currency}
                onChange={(e) =>
                  setFormData({ ...formData, currency: coerceTransactionCurrency(e.target.value) })
                }
                className="input"
              >
                {TRANSACTION_CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Cuenta
            </label>
            <select
              value={formData.account_id}
              onChange={(e) => setFormData({ ...formData, account_id: e.target.value })}
              className="input"
              required
            >
              {accounts.map((acc) => (
                <option key={acc.id} value={acc.id}>
                  {formatAccountSelectLabel(acc)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Categoria
            </label>
            <select
              value={formData.category_id}
              onChange={(e) => setFormData({ ...formData, category_id: e.target.value })}
              className="input"
            >
              <option value="">Sin categoria</option>
              {filteredCategories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.icon} {cat.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Descripcion
            </label>
            <input
              type="text"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="input"
              placeholder="Ej: Almuerzo, Netflix, Sueldo..."
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Fecha
            </label>
            <input
              type="date"
              value={formData.transaction_date}
              onChange={(e) => setFormData({ ...formData, transaction_date: e.target.value })}
              className="input"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Notas (opcional)
            </label>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              className="input min-h-[80px]"
              placeholder="Detalles adicionales..."
            />
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={handleDuplicate}
              disabled={loading || duplicating}
              className="btn flex-1 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700"
            >
              {duplicating ? 'Duplicando...' : 'Duplicar'}
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={loading || duplicating}
              className="btn btn-danger flex-1"
            >
              Eliminar
            </button>
            <button
              type="submit"
              disabled={loading || duplicating}
              className="btn btn-primary flex-[2]"
            >
              {loading ? 'Guardando...' : 'Guardar Cambios'}
            </button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
}
