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

  const handleSave = () => {
    setEditingTx(null);
    window.location.reload();
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
            onClick={() => setEditingTx(tx)}
            className="card hover:shadow-lg transition-all cursor-pointer group"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
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
