'use client';

import type { InvestmentWithPnL } from '@/lib/services/investments';

interface InvestmentsListProps {
  investments: InvestmentWithPnL[];
}

const TYPE_ICONS: Record<string, string> = {
  stock_arg: '📊',
  cedear: '📈',
  stock_us: '🇺🇸',
  etf: '📦',
  crypto: '₿',
  plazo_fijo: '🏦',
  fci: '💼',
  bond: '📜',
  caucion: '🤝',
  real_estate: '🏠',
  other: '💰',
};

export default function InvestmentsList({ investments }: InvestmentsListProps) {
  if (investments.length === 0) {
    return (
      <div className="card text-center py-12">
        <p className="text-gray-500 mb-2">No tenés inversiones registradas</p>
        <p className="text-sm text-gray-400">
          Registrá tus acciones, crypto, plazos fijos, etc.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {investments.map((inv) => (
        <div key={inv.id} className="card hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="text-3xl">{TYPE_ICONS[inv.type] || '💰'}</div>

              <div>
                <div className="font-semibold text-lg">
                  {inv.ticker ? `${inv.ticker} - ${inv.name}` : inv.name}
                </div>
                <div className="text-sm text-gray-500">
                  {inv.quantity.toLocaleString('es-AR', { maximumFractionDigits: 8 })} unidades
                  • Compra: {inv.purchase_currency}{' '}
                  {inv.purchase_price.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </div>
                <div className="text-xs text-gray-400 mt-1">
                  {new Date(inv.purchase_date).toLocaleDateString('es-AR', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })}
                </div>
              </div>
            </div>

            <div className="text-right">
              <div className="text-xl font-bold">
                USD {inv.current_value.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </div>
              <div
                className={`text-sm font-medium ${
                  inv.profit_loss >= 0 ? 'text-green-600' : 'text-red-600'
                }`}
              >
                {inv.profit_loss >= 0 ? '+' : ''}
                USD {inv.profit_loss.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </div>
              <div
                className={`text-xs ${
                  inv.profit_loss_percent >= 0 ? 'text-green-600' : 'text-red-600'
                }`}
              >
                {inv.profit_loss_percent >= 0 ? '+' : ''}
                {inv.profit_loss_percent.toFixed(2)}%
              </div>
            </div>
          </div>

          {inv.current_price && (
            <div className="mt-3 text-xs text-gray-500 border-t border-gray-100 dark:border-gray-700 pt-3">
              Precio actual: {inv.purchase_currency}{' '}
              {inv.current_price.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              {inv.current_price_updated_at && (
                <span className="ml-2">
                  (actualizado{' '}
                  {new Date(inv.current_price_updated_at).toLocaleDateString('es-AR')})
                </span>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
