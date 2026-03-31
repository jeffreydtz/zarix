'use client';

import type { AccountWithBalance } from '@/lib/services/accounts';

interface AccountsListProps {
  accounts: AccountWithBalance[];
}

export default function AccountsList({ accounts }: AccountsListProps) {
  if (accounts.length === 0) {
    return (
      <div className="card text-center py-12">
        <p className="text-gray-500 mb-4">No tenés cuentas todavía</p>
        <p className="text-sm text-gray-400">Creá tu primera cuenta para empezar a trackear tus finanzas</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {accounts.map((account) => (
        <div key={account.id} className="card hover:shadow-md transition-shadow cursor-pointer">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div
                className="w-12 h-12 rounded-full flex items-center justify-center text-2xl"
                style={{ backgroundColor: account.color }}
              >
                {account.icon || '💳'}
              </div>

              <div>
                <div className="font-semibold text-lg">{account.name}</div>
                <div className="text-sm text-gray-500">
                  {account.type.replace('_', ' ')} • {account.currency}
                </div>
              </div>
            </div>

            <div className="text-right">
              <div className="text-xl font-bold">
                {account.is_debt && '-'}
                ${account.balance.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
              </div>
              <div className="text-sm text-gray-500">{account.currency}</div>
              {account.currency !== 'ARS' && (
                <div className="text-xs text-gray-400 mt-1">
                  ≈ ${account.balance_ars_blue?.toLocaleString('es-AR') || 0} ARS
                </div>
              )}
            </div>
          </div>

          {account.min_balance && account.balance < account.min_balance && (
            <div className="mt-3 text-sm text-yellow-600 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-900/20 p-2 rounded">
              ⚠️ Saldo por debajo del mínimo (${account.min_balance.toFixed(2)})
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
