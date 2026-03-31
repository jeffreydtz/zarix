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
        {accounts.map((account) => {
          const isCreditCard = account.type === 'credit_card';
          const creditUsed = isCreditCard ? Math.abs(account.balance) : 0;
          const creditLimit = account.credit_limit || 0;
          const creditUtilization = creditLimit > 0 ? (creditUsed / creditLimit) * 100 : 0;

          return (
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

              {isCreditCard && creditLimit > 0 && (
                <div className="mt-3 pt-3 border-t border-white/20">
                  <div className="flex justify-between text-xs mb-1">
                    <span>Usado</span>
                    <span>{creditUtilization.toFixed(0)}%</span>
                  </div>
                  <div className="w-full bg-white/20 rounded-full h-1.5">
                    <div
                      className="bg-white h-1.5 rounded-full transition-all"
                      style={{ width: `${Math.min(creditUtilization, 100)}%` }}
                    />
                  </div>
                  <div className="text-xs mt-1 opacity-75">
                    Límite: ${creditLimit.toLocaleString('es-AR')}
                  </div>
                </div>
              )}
            </div>
          );
        })}

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
