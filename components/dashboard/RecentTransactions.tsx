'use client';

import { memo, useMemo } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import type { TransactionWithCategory } from '@/lib/services/transactions';
import Link from 'next/link';
import { motionVariants, maybeReduceTransition, motionTransition } from '@/lib/motion';

interface RecentTransactionsProps {
  transactions: TransactionWithCategory[];
}

function RecentTransactions({ transactions }: RecentTransactionsProps) {
  const shouldReduceMotion = useReducedMotion();
  /** Más reciente primero; desempate por id para orden estable. */
  const sorted = useMemo(
    () =>
      [...transactions].sort((a, b) => {
        const ta = new Date(a.transaction_date).getTime();
        const tb = new Date(b.transaction_date).getTime();
        if (tb !== ta) return tb - ta;
        return b.id.localeCompare(a.id);
      }),
    [transactions]
  );

  return (
    <motion.div 
      initial="hidden"
      variants={motionVariants.sectionEnter}
      animate="visible"
      transition={maybeReduceTransition(shouldReduceMotion, { ...motionTransition.smooth, delay: 0.25 })}
      className="card"
    >
      <div className="flex items-center justify-between mb-5">
        <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-200">
          Ultimos Movimientos
        </h3>
        <Link 
          href="/expenses" 
          className="text-sm text-primary hover:opacity-85 font-medium"
        >
          Ver todo
        </Link>
      </div>

      {sorted.length === 0 ? (
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center py-12"
        >
          <motion.div
            animate={shouldReduceMotion ? undefined : { y: [0, -6, 0] }}
            transition={shouldReduceMotion ? undefined : { duration: 2.2, repeat: Infinity }}
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
          {sorted.map((tx, index) => (
            <motion.div
              key={tx.id}
              initial={{ opacity: 0, x: shouldReduceMotion ? 0 : -16 }}
              animate={{ opacity: 1, x: 0 }}
              transition={maybeReduceTransition(shouldReduceMotion, {
                ...motionTransition.smooth,
                delay: index * 0.05 + 0.2,
                duration: 0.35,
              })}
              whileHover={shouldReduceMotion ? undefined : { x: 3 }}
              className="flex items-center justify-between py-3 px-3 -mx-3 rounded-control hover:bg-surface-soft/80 transition-colors"
            >
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <motion.div 
                  className="text-2xl w-10 h-10 flex items-center justify-center rounded-control bg-surface-soft"
                  whileHover={shouldReduceMotion ? undefined : { scale: 1.06 }}
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
