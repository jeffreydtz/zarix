'use client';

import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import type { TransactionWithCategory } from '@/lib/services/transactions';

interface RecentTransactionsProps {
  transactions: TransactionWithCategory[];
}

export default function RecentTransactions({ transactions }: RecentTransactionsProps) {
  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">Últimos Movimientos</h3>
        <a href="/expenses" className="text-sm text-blue-500 hover:underline">
          Ver todo
        </a>
      </div>

      {transactions.length === 0 ? (
        <p className="text-center text-gray-500 py-8">
          No tenés movimientos todavía. Usá el bot de Telegram para registrar gastos.
        </p>
      ) : (
        <div className="space-y-3">
          {transactions.map((tx) => (
            <div
              key={tx.id}
              className="flex items-center justify-between py-3 border-b border-gray-100 dark:border-gray-700 last:border-0"
            >
              <div className="flex items-center gap-3">
                <div className="text-2xl">
                  {tx.category?.icon || (tx.type === 'income' ? '💰' : '💸')}
                </div>
                <div>
                  <div className="font-medium">
                    {tx.description || tx.category?.name || 'Sin descripción'}
                  </div>
                  <div className="text-xs text-gray-500">
                    {tx.account?.name} •{' '}
                    {formatDistanceToNow(new Date(tx.transaction_date), {
                      addSuffix: true,
                      locale: es,
                    })}
                  </div>
                </div>
              </div>

              <div
                className={`font-semibold ${
                  tx.type === 'income'
                    ? 'text-green-600'
                    : tx.type === 'expense'
                    ? 'text-red-600'
                    : 'text-gray-600'
                }`}
              >
                {tx.type === 'income' ? '+' : tx.type === 'expense' ? '-' : ''}
                ${tx.amount.toLocaleString('es-AR', { minimumFractionDigits: 2 })}{' '}
                {tx.currency}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
