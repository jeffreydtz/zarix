'use client';

import { motion } from 'framer-motion';

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

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3 }}
      className="card p-6"
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">{title}</h3>
        <span className="text-sm text-slate-500">
          Top {transactions.length} = ${total.toLocaleString('es-AR', { maximumFractionDigits: 0 })}
        </span>
      </div>

      <div className="space-y-3">
        {transactions.map((tx, index) => {
          const amount = Number(tx.amount_in_account_currency);
          const percent = (amount / total) * 100;
          const date = new Date(tx.transaction_date);
          
          return (
            <motion.div
              key={tx.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.05 }}
              className="relative"
            >
              <div 
                className="absolute inset-0 bg-red-100 dark:bg-red-900/20 rounded-lg"
                style={{ width: `${percent}%` }}
              />
              <div className="relative flex items-center justify-between p-3">
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

      <div className="mt-4 p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800">
        <p className="text-sm text-amber-700 dark:text-amber-300">
          💡 <strong>Tip:</strong> Estos {transactions.length} gastos representan una parte importante de tu mes. 
          Revisá si alguno fue impulsivo o evitable.
        </p>
      </div>
    </motion.div>
  );
}
