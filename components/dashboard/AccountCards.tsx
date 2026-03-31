'use client';

import type { AccountWithBalance } from '@/lib/services/accounts';

interface AccountCardsProps {
  accounts: AccountWithBalance[];
}

export default function AccountCards({ accounts }: AccountCardsProps) {
  return (
    <div>
      <h3 className="text-lg font-semibold mb-3">Tus Cuentas</h3>
      <div className="flex overflow-x-auto gap-4 pb-4 snap-x snap-mandatory">
        {accounts.map((account) => (
          <div
            key={account.id}
            className="flex-shrink-0 w-64 rounded-xl p-5 text-white snap-start"
            style={{ backgroundColor: account.color }}
          >
            <div className="flex items-center justify-between mb-4">
              <span className="text-3xl">{account.icon || '💳'}</span>
              <span className="text-xs bg-white/20 px-2 py-1 rounded">
                {account.currency}
              </span>
            </div>

            <div className="mb-2">
              <div className="text-sm opacity-90">{account.name}</div>
              <div className="text-2xl font-bold">
                {account.is_debt && '-'}
                ${account.balance.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
              </div>
            </div>

            {account.currency !== 'ARS' && (
              <div className="text-xs opacity-75">
                ≈ ${account.balance_ars_blue?.toLocaleString('es-AR') || 0} ARS
              </div>
            )}
          </div>
        ))}

        {accounts.length === 0 && (
          <div className="card w-64 flex-shrink-0 text-center py-8">
            <p className="text-gray-500 mb-4">No tenés cuentas todavía</p>
            <button className="btn btn-primary">Crear cuenta</button>
          </div>
        )}
      </div>
    </div>
  );
}
