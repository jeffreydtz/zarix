'use client';

import { motion } from 'framer-motion';
import { useReducedMotion } from 'framer-motion';
import { maybeReduceTransition, motionTransition } from '@/lib/motion';

interface Transaction {
  id: string;
  amount: number;
  amount_in_account_currency: number;
  currency: string;
  description: string;
  transaction_date: string;
  category: { name: string; icon: string } | null;
  account: { name: string } | null;
}

interface Props {
  transactions: Transaction[];
  title?: string;
}

export default function TopExpenses({ transactions, title = 'Gastos más grandes del mes' }: Props) {
  const shouldReduceMotion = useReducedMotion();

  if (transactions.length === 0) {
    return (
      <div className="card p-6">
        <h3 className="text-lg font-semibold mb-4">{title}</h3>
        <div className="h-32 flex items-center justify-center text-slate-500">
          No hay gastos registrados
        </div>
      </div>
    );
  }

  const total = transactions.reduce((sum, t) => sum + Number(t.amount_in_account_currency), 0);
  const firstImpact = Number(transactions[0]?.amount_in_account_currency ?? 0);
  const concentration = total > 0 ? (firstImpact / total) * 100 : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: shouldReduceMotion ? 0 : 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={maybeReduceTransition(shouldReduceMotion, { ...motionTransition.smooth, delay: 0.2 })}
      className="card card-spotlight p-6"
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">{title}</h3>
        <span className="text-sm text-muted-foreground">
          Top {transactions.length} = ${total.toLocaleString('es-AR', { maximumFractionDigits: 0 })}
        </span>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <span className="story-chip">Concentración del gasto #1: {concentration.toFixed(1)}%</span>
        <span className="story-chip">Narrativa: foco en tickets altos repetidos</span>
      </div>

      <div className="space-y-3">
        {transactions.map((tx, index) => {
          const amount = Number(tx.amount_in_account_currency);
          const percent = (amount / total) * 100;
          const date = new Date(tx.transaction_date);
          
          return (
            <motion.div
              key={tx.id}
              initial={{ opacity: 0, x: shouldReduceMotion ? 0 : -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={maybeReduceTransition(shouldReduceMotion, {
                ...motionTransition.smooth,
                delay: index * 0.04,
                duration: 0.26,
              })}
              className="relative"
            >
              <div 
                className="absolute inset-0 bg-red-100/70 dark:bg-red-900/22 rounded-control"
                style={{ width: `${percent}%` }}
              />
              <div className="relative flex items-center justify-between p-3 rounded-control hover:bg-surface-soft/70 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-700 text-lg">
                    {tx.category?.icon || '💸'}
                  </div>
                  <div>
                    <div className="font-medium text-sm">
                      {tx.description || tx.category?.name || 'Sin descripción'}
                    </div>
                    <div className="text-xs text-slate-500">
                      {tx.account?.name} • {date.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-semibold text-red-600 dark:text-red-400">
                    ${amount.toLocaleString('es-AR', { maximumFractionDigits: 0 })}
                  </div>
                  <div className="text-xs text-slate-500">
                    {percent.toFixed(1)}%
                  </div>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>

      <div className="mt-4 p-3 bg-amber-50/85 dark:bg-amber-900/20 rounded-control border border-amber-200 dark:border-amber-800">
        <p className="text-sm text-amber-700 dark:text-amber-300">
          <strong>Insight:</strong> Estos {transactions.length} gastos concentran una parte alta del mes. Si recortás solo los dos primeros, el impacto en caja es inmediato.
        </p>
      </div>
    </motion.div>
  );
}
