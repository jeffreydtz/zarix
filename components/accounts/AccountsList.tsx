'use client';

import { motion, AnimatePresence } from 'framer-motion';
import type { AccountWithBalance } from '@/lib/services/accounts';
import { useState } from 'react';
import AnimatedNumber from '@/components/ui/AnimatedNumber';

interface AccountsListProps {
  accounts: AccountWithBalance[];
}

export default function AccountsList({ accounts }: AccountsListProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [loading, setLoading] = useState(false);

  const handleEdit = (account: AccountWithBalance) => {
    setEditingId(account.id);
    setEditName(account.name);
  };

  const handleSave = async (id: string) => {
    setLoading(true);
    try {
      const response = await fetch(`/api/accounts/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editName }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Error al actualizar la cuenta');
      }

      window.location.reload();
    } catch (error: any) {
      console.error('Error:', error);
      alert(error.message || 'Error al actualizar la cuenta');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Eliminar la cuenta "${name}"?`)) return;

    setLoading(true);
    try {
      const response = await fetch(`/api/accounts/${id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Error deleting account');
      }

      window.location.reload();
    } catch (error: any) {
      console.error('Error:', error);
      alert(error.message || 'Error al eliminar la cuenta');
    } finally {
      setLoading(false);
    }
  };

  if (accounts.length === 0) {
    return (
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="card text-center py-16"
      >
        <motion.div
          animate={{ y: [0, -10, 0] }}
          transition={{ duration: 2, repeat: Infinity }}
          className="text-6xl mb-4"
        >
          🏦
        </motion.div>
        <p className="text-slate-500 dark:text-slate-400 mb-2 text-lg">No tenes cuentas todavia</p>
        <p className="text-sm text-slate-400 dark:text-slate-500">Crea tu primera cuenta para empezar a trackear tus finanzas</p>
      </motion.div>
    );
  }

  return (
    <motion.div 
      initial="hidden"
      animate="show"
      variants={{
        hidden: { opacity: 0 },
        show: { opacity: 1, transition: { staggerChildren: 0.08 } }
      }}
      className="space-y-4"
    >
      <AnimatePresence mode="popLayout">
        {accounts.map((account, index) => (
          <motion.div 
            key={account.id}
            layout
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ delay: index * 0.05 }}
            whileHover={{ scale: 1.01 }}
            className="card hover:shadow-lg transition-shadow"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4 flex-1">
                <motion.div
                  whileHover={{ scale: 1.1, rotate: 5 }}
                  whileTap={{ scale: 0.95 }}
                  className="w-14 h-14 rounded-2xl flex items-center justify-center text-3xl shadow-sm"
                  style={{ backgroundColor: `${account.color}20` }}
                >
                  {account.icon || '💳'}
                </motion.div>

                <div className="flex-1 min-w-0">
                  {editingId === account.id ? (
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="input font-semibold text-lg"
                      autoFocus
                    />
                  ) : (
                    <div className="font-semibold text-lg text-slate-800 dark:text-slate-200 truncate">
                      {account.name}
                    </div>
                  )}
                  <div className="text-sm text-slate-500 dark:text-slate-400 flex items-center gap-2">
                    <span className="capitalize">{account.type.replace('_', ' ')}</span>
                    <span className="text-slate-300">•</span>
                    <span>{account.currency}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <div className="text-right">
                  <div className={`text-xl font-bold ${account.is_debt ? 'text-red-500' : 'text-slate-800 dark:text-slate-200'}`}>
                    <AnimatedNumber 
                      value={account.balance} 
                      prefix={account.is_debt ? '-$' : '$'} 
                      decimals={2} 
                    />
                  </div>
                  <div className="text-sm text-slate-500 dark:text-slate-400">{account.currency}</div>
                  {account.currency !== 'ARS' && account.balance_ars_blue && (
                    <div className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                      ≈ ${account.balance_ars_blue.toLocaleString('es-AR', { maximumFractionDigits: 0 })} ARS
                    </div>
                  )}
                </div>

                <div className="flex gap-1">
                  {editingId === account.id ? (
                    <>
                      <motion.button
                        whileTap={{ scale: 0.9 }}
                        onClick={() => handleSave(account.id)}
                        disabled={loading}
                        className="p-2 rounded-xl bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 hover:bg-green-200 dark:hover:bg-green-900/50 disabled:opacity-50"
                      >
                        ✓
                      </motion.button>
                      <motion.button
                        whileTap={{ scale: 0.9 }}
                        onClick={() => setEditingId(null)}
                        disabled={loading}
                        className="p-2 rounded-xl bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-600 disabled:opacity-50"
                      >
                        ✕
                      </motion.button>
                    </>
                  ) : (
                    <>
                      <motion.button
                        whileTap={{ scale: 0.9 }}
                        onClick={() => handleEdit(account)}
                        className="p-2 rounded-xl hover:bg-blue-100 dark:hover:bg-blue-900/30 text-blue-500"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </motion.button>
                      <motion.button
                        whileTap={{ scale: 0.9 }}
                        onClick={() => handleDelete(account.id, account.name)}
                        className="p-2 rounded-xl hover:bg-red-100 dark:hover:bg-red-900/30 text-red-500"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </motion.button>
                    </>
                  )}
                </div>
              </div>
            </div>

            {account.min_balance && account.balance < account.min_balance && (
              <motion.div 
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="mt-3 text-sm text-yellow-700 dark:text-yellow-300 bg-yellow-50 dark:bg-yellow-900/20 p-3 rounded-xl border border-yellow-200 dark:border-yellow-800"
              >
                Saldo por debajo del minimo (${account.min_balance.toFixed(2)})
              </motion.div>
            )}

            {account.type === 'credit_card' && account.credit_limit && (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700"
              >
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div>
                    <p className="text-slate-500 dark:text-slate-400 text-xs mb-0.5">Limite</p>
                    <p className="font-semibold text-slate-700 dark:text-slate-300">
                      ${account.credit_limit.toLocaleString('es-AR')}
                    </p>
                  </div>
                  {account.closing_day && (
                    <div>
                      <p className="text-slate-500 dark:text-slate-400 text-xs mb-0.5">Cierre</p>
                      <p className="font-semibold text-slate-700 dark:text-slate-300">Dia {account.closing_day}</p>
                    </div>
                  )}
                  {account.due_day && (
                    <div>
                      <p className="text-slate-500 dark:text-slate-400 text-xs mb-0.5">Vencimiento</p>
                      <p className="font-semibold text-slate-700 dark:text-slate-300">Dia {account.due_day}</p>
                    </div>
                  )}
                </div>
                {account.last_4_digits && (
                  <p className="text-xs text-slate-400 dark:text-slate-500 mt-2 font-mono">
                    •••• {account.last_4_digits}
                  </p>
                )}
              </motion.div>
            )}
          </motion.div>
        ))}
      </AnimatePresence>
    </motion.div>
  );
}
