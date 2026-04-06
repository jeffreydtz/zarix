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
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 text-center py-12 px-4 shadow-sm">
        <p className="text-slate-600 dark:text-slate-300 mb-2">No tenés inversiones registradas</p>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Registrá acciones, crypto, plazos fijos y más para ver el valor y la ganancia aquí.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {investments.map((inv) => (
        <div
          key={inv.id}
          className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-4 shadow-sm hover:shadow-md transition-shadow"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="text-3xl">{TYPE_ICONS[inv.type] || '💰'}</div>

              <div>
                <div className="font-semibold text-lg text-slate-900 dark:text-slate-50">
                  {inv.ticker ? `${inv.ticker} — ${inv.name}` : inv.name}
                </div>
                <div className="text-sm text-slate-500 dark:text-slate-400">
                  {inv.quantity.toLocaleString('es-AR', { maximumFractionDigits: 8 })} unidades
                  • Compra: {inv.purchase_currency}{' '}
                  {inv.purchase_price.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </div>
                <div className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                  {new Date(inv.purchase_date).toLocaleDateString('es-AR', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })}
                </div>
              </div>
            </div>

            <div className="text-right">
              <div className="text-xl font-bold text-slate-900 dark:text-slate-50 tabular-nums">
                USD {inv.current_value.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </div>
              <div
                className={`text-sm font-medium tabular-nums ${
                  inv.profit_loss >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
                }`}
              >
                {inv.profit_loss >= 0 ? '+' : ''}
                USD {inv.profit_loss.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </div>
              <div
                className={`text-xs tabular-nums ${
                  inv.profit_loss_percent >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
                }`}
              >
                {inv.profit_loss_percent >= 0 ? '+' : ''}
                {inv.profit_loss_percent.toFixed(2)}%
              </div>
            </div>
          </div>

          {inv.current_price && (
            <div className="mt-3 text-xs text-slate-500 dark:text-slate-400 border-t border-slate-100 dark:border-slate-700 pt-3">
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
