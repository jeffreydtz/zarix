'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import type { TransactionWithCategory } from '@/lib/services/transactions';
import EditTransactionModal from './EditTransactionModal';

interface TransactionsListProps {
  transactions: TransactionWithCategory[];
  accounts?: Array<{ id: string; name: string; currency: string }>;
  categories?: Array<{ id: string; name: string; type: string; icon: string }>;
}

export default function TransactionsList({ 
  transactions, 
  accounts = [], 
  categories = [] 
}: TransactionsListProps) {
  const [editingTx, setEditingTx] = useState<TransactionWithCategory | null>(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkCategoryId, setBulkCategoryId] = useState('');
  const [bulkAccountId, setBulkAccountId] = useState('');
  const [applyingBulk, setApplyingBulk] = useState(false);

  const handleSave = () => {
    setEditingTx(null);
    window.location.reload();
  };

  const toggleSelection = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const toggleSelectAll = () => {
    setSelectedIds((prev) => (prev.length === transactions.length ? [] : transactions.map((t) => t.id)));
  };

  const applyBulk = async () => {
    if (selectedIds.length === 0) {
      alert('Seleccioná al menos un movimiento');
      return;
    }

    const payload: {
      transactionIds: string[];
      categoryId?: string | null;
      accountId?: string;
    } = { transactionIds: selectedIds };

    if (bulkCategoryId) {
      payload.categoryId = bulkCategoryId === 'uncategorized' ? null : bulkCategoryId;
    }
    if (bulkAccountId) {
      payload.accountId = bulkAccountId;
    }

    if (!payload.categoryId && !payload.accountId && payload.categoryId !== null) {
      alert('Elegí una categoría y/o cuenta para aplicar');
      return;
    }

    setApplyingBulk(true);
    try {
      const response = await fetch('/api/transactions/bulk', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'No se pudo aplicar el cambio masivo');
      }

      window.location.reload();
    } catch (error: any) {
      console.error(error);
      alert(error.message || 'Error en edición masiva');
    } finally {
      setApplyingBulk(false);
    }
  };

  if (transactions.length === 0) {
    return (
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="card text-center py-16"
      >
        <motion.div
          animate={{ y: [0, -8, 0] }}
          transition={{ duration: 2, repeat: Infinity }}
          className="text-5xl mb-4"
        >
          💸
        </motion.div>
        <p className="text-slate-500 dark:text-slate-400 mb-2">No hay movimientos</p>
        <p className="text-sm text-slate-400 dark:text-slate-500">
          Usa el bot de Telegram para registrar gastos e ingresos
        </p>
      </motion.div>
    );
  }

  return (
    <>
      <div className="card mb-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setSelectionMode((v) => !v);
              setSelectedIds([]);
            }}
            className={`px-3 py-1.5 rounded-lg text-sm border ${
              selectionMode
                ? 'bg-blue-50 border-blue-400 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300'
                : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
            }`}
          >
            {selectionMode ? 'Salir selección masiva' : 'Edición masiva'}
          </button>

          {selectionMode && (
            <>
              <button
                type="button"
                onClick={toggleSelectAll}
                className="px-3 py-1.5 rounded-lg text-sm border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300"
              >
                {selectedIds.length === transactions.length ? 'Deseleccionar todo' : 'Seleccionar todo'}
              </button>
              <span className="text-xs text-slate-500">Seleccionados: {selectedIds.length}</span>
            </>
          )}
        </div>

        {selectionMode && (
          <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-2">
            <select
              value={bulkCategoryId}
              onChange={(e) => setBulkCategoryId(e.target.value)}
              className="input"
            >
              <option value="">Asignar categoría (opcional)</option>
              <option value="uncategorized">Sin categoría</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.icon} {cat.name}
                </option>
              ))}
            </select>

            <select value={bulkAccountId} onChange={(e) => setBulkAccountId(e.target.value)} className="input">
              <option value="">Asignar cuenta (opcional)</option>
              {accounts.map((acc) => (
                <option key={acc.id} value={acc.id}>
                  {acc.name} ({acc.currency})
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={applyBulk}
              disabled={applyingBulk || selectedIds.length === 0}
              className="btn btn-primary disabled:opacity-50"
            >
              {applyingBulk ? 'Aplicando...' : 'Aplicar cambios masivos'}
            </button>
          </div>
        )}
      </div>

      <motion.div 
        initial="hidden"
        animate="show"
        variants={{
          hidden: { opacity: 0 },
          show: { opacity: 1, transition: { staggerChildren: 0.05 } }
        }}
        className="space-y-3"
      >
        {transactions.map((tx, index) => (
          <motion.div 
            key={tx.id} 
            variants={{
              hidden: { opacity: 0, y: 20 },
              show: { opacity: 1, y: 0 }
            }}
            whileHover={{ scale: 1.01 }}
            onClick={() => {
              if (selectionMode) return;
              setEditingTx(tx);
            }}
            className={`card hover:shadow-lg transition-all group ${selectionMode ? '' : 'cursor-pointer'}`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                {selectionMode && (
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(tx.id)}
                    onChange={() => toggleSelection(tx.id)}
                    onClick={(e) => e.stopPropagation()}
                    className="w-4 h-4"
                  />
                )}
                <motion.div 
                  className="text-3xl w-12 h-12 flex items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-700"
                  whileHover={{ scale: 1.1 }}
                >
                  {tx.category?.icon || (tx.type === 'income' ? '💰' : '💸')}
                </motion.div>

                <div>
                  <div className="font-medium text-slate-800 dark:text-slate-200 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                    {tx.description || tx.category?.name || 'Sin descripcion'}
                  </div>
                  <div className="text-sm text-slate-500 dark:text-slate-400">
                    {tx.account?.name} •{' '}
                    {new Date(tx.transaction_date).toLocaleDateString('es-AR', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}{' '}
                    •{' '}
                    {formatDistanceToNow(new Date(tx.transaction_date), {
                      addSuffix: true,
                      locale: es,
                    })}
                  </div>
                  {tx.notes && (
                    <div className="text-xs text-slate-400 dark:text-slate-500 mt-1">{tx.notes}</div>
                  )}
                  {tx.tags && tx.tags.length > 0 && (
                    <div className="flex gap-1 mt-2">
                      {tx.tags.map((tag) => (
                        <span
                          key={tag}
                          className="text-xs bg-slate-100 dark:bg-slate-700 px-2 py-1 rounded-full"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="text-right flex items-center gap-3">
                <div>
                  <div
                    className={`text-xl font-bold ${
                      tx.type === 'income'
                        ? 'text-green-600 dark:text-green-400'
                        : tx.type === 'expense'
                        ? 'text-red-500 dark:text-red-400'
                        : 'text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    {tx.type === 'income' ? '+' : tx.type === 'expense' ? '-' : ''}
                    ${tx.amount.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                  </div>
                  <div className="text-sm text-slate-500">{tx.currency}</div>
                  {tx.installment_number && tx.installment_total && (
                    <div className="text-xs text-slate-400 mt-1">
                      Cuota {tx.installment_number}/{tx.installment_total}
                    </div>
                  )}
                </div>
                <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                  <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </div>
            </div>

            {tx.type === 'transfer' && tx.destination_account_id && (
              <div className="mt-3 text-sm text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 p-2 rounded-xl">
                → Transferencia a otra cuenta
                {tx.exchange_rate && tx.exchange_rate !== 1 && (
                  <span className="ml-2 text-xs">
                    (tipo cambio: {tx.exchange_rate.toFixed(4)})
                  </span>
                )}
              </div>
            )}
          </motion.div>
        ))}
      </motion.div>

      <AnimatePresence>
        {editingTx && (
          <EditTransactionModal
            transaction={editingTx}
            accounts={accounts}
            categories={categories}
            onClose={() => setEditingTx(null)}
            onSave={handleSave}
          />
        )}
      </AnimatePresence>
    </>
  );
}
