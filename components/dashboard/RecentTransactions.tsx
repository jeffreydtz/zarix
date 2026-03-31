'use client';

import { memo } from 'react';
import { motion } from 'framer-motion';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import type { TransactionWithCategory } from '@/lib/services/transactions';
import Link from 'next/link';

interface RecentTransactionsProps {
  transactions: TransactionWithCategory[];
}

function RecentTransactions({ transactions }: RecentTransactionsProps) {
  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.6 }}
      className="card"
    >
      <div className="flex items-center justify-between mb-5">
        <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-200">
          Ultimos Movimientos
        </h3>
        <Link 
          href="/expenses" 
          className="text-sm text-blue-500 hover:text-blue-600 dark:text-blue-400 font-medium"
        >
          Ver todo
        </Link>
      </div>

      {transactions.length === 0 ? (
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center py-12"
        >
          <motion.div
            animate={{ y: [0, -8, 0] }}
            transition={{ duration: 2, repeat: Infinity }}
            className="text-5xl mb-4"
          >
            💸
          </motion.div>
          <p className="text-slate-500 dark:text-slate-400 mb-2">
            No tenes movimientos todavia
          </p>
          <p className="text-sm text-slate-400 dark:text-slate-500">
            Usa el bot de Telegram para registrar gastos
          </p>
        </motion.div>
      ) : (
        <div className="space-y-2">
          {transactions.map((tx, index) => (
            <motion.div
              key={tx.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.08 + 0.6 }}
              whileHover={{ x: 4 }}
              className="flex items-center justify-between py-3 px-3 -mx-3 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
            >
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <motion.div 
                  className="text-2xl w-10 h-10 flex items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-700"
                  whileHover={{ scale: 1.1 }}
                >
                  {tx.category?.icon || (tx.type === 'income' ? '💰' : '💸')}
                </motion.div>
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-slate-800 dark:text-slate-200 truncate">
                    {tx.description || tx.category?.name || 'Sin descripcion'}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1">
                    <span className="truncate">{tx.account?.name}</span>
                    <span className="text-slate-300">•</span>
                    <span>
                      {formatDistanceToNow(new Date(tx.transaction_date), {
                        addSuffix: true,
                        locale: es,
                      })}
                    </span>
                  </div>
                </div>
              </div>

              <div
                className={`font-bold text-right whitespace-nowrap ml-3 ${
                  tx.type === 'income'
                    ? 'text-green-600 dark:text-green-400'
                    : tx.type === 'expense'
                    ? 'text-red-500 dark:text-red-400'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                {tx.type === 'income' ? '+' : tx.type === 'expense' ? '-' : ''}
                ${tx.amount.toLocaleString('es-AR', { minimumFractionDigits: 2 })}{' '}
                <span className="text-xs font-normal">{tx.currency}</span>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </motion.div>
  );
}

export default memo(RecentTransactions);
