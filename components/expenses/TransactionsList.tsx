'use client';

import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import type { TransactionWithCategory } from '@/lib/services/transactions';

interface TransactionsListProps {
  transactions: TransactionWithCategory[];
}

export default function TransactionsList({ transactions }: TransactionsListProps) {
  if (transactions.length === 0) {
    return (
      <div className="card text-center py-12">
        <p className="text-gray-500 mb-2">No hay movimientos</p>
        <p className="text-sm text-gray-400">
          Usá el bot de Telegram para registrar gastos e ingresos
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {transactions.map((tx) => (
        <div key={tx.id} className="card hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="text-3xl">
                {tx.category?.icon || (tx.type === 'income' ? '💰' : '💸')}
              </div>

              <div>
                <div className="font-medium">
                  {tx.description || tx.category?.name || 'Sin descripción'}
                </div>
                <div className="text-sm text-gray-500">
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
                  <div className="text-xs text-gray-400 mt-1">{tx.notes}</div>
                )}
                {tx.tags && tx.tags.length > 0 && (
                  <div className="flex gap-1 mt-2">
                    {tx.tags.map((tag) => (
                      <span
                        key={tag}
                        className="text-xs bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="text-right">
              <div
                className={`text-xl font-bold ${
                  tx.type === 'income'
                    ? 'text-green-600'
                    : tx.type === 'expense'
                    ? 'text-red-600'
                    : 'text-gray-600'
                }`}
              >
                {tx.type === 'income' ? '+' : tx.type === 'expense' ? '-' : ''}
                ${tx.amount.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
              </div>
              <div className="text-sm text-gray-500">{tx.currency}</div>
              {tx.installment_number && tx.installment_total && (
                <div className="text-xs text-gray-400 mt-1">
                  Cuota {tx.installment_number}/{tx.installment_total}
                </div>
              )}
            </div>
          </div>

          {tx.type === 'transfer' && tx.destination_account_id && (
            <div className="mt-3 text-sm text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 p-2 rounded">
              → Transferencia a otra cuenta
              {tx.exchange_rate && tx.exchange_rate !== 1 && (
                <span className="ml-2 text-xs">
                  (tipo cambio: {tx.exchange_rate.toFixed(4)})
                </span>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
