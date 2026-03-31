'use client';

import type { AccountWithBalance } from '@/lib/services/accounts';

interface CreditCardsWidgetProps {
  accounts: AccountWithBalance[];
}

export default function CreditCardsWidget({ accounts }: CreditCardsWidgetProps) {
  const creditCards = accounts.filter(acc => acc.type === 'credit_card' && acc.credit_limit);

  if (creditCards.length === 0) return null;

  return (
    <div className="card">
      <h3 className="text-lg font-semibold mb-4">💳 Resumen de Tarjetas</h3>
      <div className="space-y-3">
        {creditCards.map((card) => {
          const used = Math.abs(card.balance);
          const limit = card.credit_limit || 0;
          const utilization = limit > 0 ? (used / limit) * 100 : 0;
          const available = limit - used;

          return (
            <div key={card.id} className="p-4 rounded-lg bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-700">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">{card.icon || '💳'}</span>
                  <div>
                    <div className="font-semibold">{card.name}</div>
                    {card.last_4_digits && (
                      <div className="text-xs text-gray-500">•••• {card.last_4_digits}</div>
                    )}
                  </div>
                </div>
                <span className={`text-xs font-medium px-2 py-1 rounded-full ${
                  utilization > 80 
                    ? 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300'
                    : utilization > 50 
                    ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300'
                    : 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
                }`}>
                  {utilization.toFixed(0)}%
                </span>
              </div>

              <div className="space-y-1 mb-3">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600 dark:text-gray-400">Usado:</span>
                  <span className="font-semibold">${used.toLocaleString('es-AR')}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600 dark:text-gray-400">Disponible:</span>
                  <span className="font-semibold text-green-600 dark:text-green-400">
                    ${available.toLocaleString('es-AR')}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600 dark:text-gray-400">Límite:</span>
                  <span className="font-semibold">${limit.toLocaleString('es-AR')}</span>
                </div>
              </div>

              <div className="w-full bg-gray-200 dark:bg-gray-600 rounded-full h-2">
                <div
                  className={`h-2 rounded-full transition-all ${
                    utilization > 80 
                      ? 'bg-gradient-to-r from-red-500 to-red-600'
                      : utilization > 50 
                      ? 'bg-gradient-to-r from-yellow-500 to-orange-500'
                      : 'bg-gradient-to-r from-green-500 to-emerald-500'
                  }`}
                  style={{ width: `${Math.min(utilization, 100)}%` }}
                />
              </div>

              {(card.closing_day || card.due_day) && (
                <div className="flex gap-3 mt-3 pt-3 border-t border-gray-200 dark:border-gray-600 text-xs">
                  {card.closing_day && (
                    <div>
                      <span className="text-gray-500">Cierre:</span>
                      <span className="ml-1 font-semibold">Día {card.closing_day}</span>
                    </div>
                  )}
                  {card.due_day && (
                    <div>
                      <span className="text-gray-500">Venc.:</span>
                      <span className="ml-1 font-semibold">Día {card.due_day}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
