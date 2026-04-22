'use client';

import { useState } from 'react';
import type { InvestmentWithPnL } from '@/lib/services/investments';

interface InvestmentsListProps {
  investments: InvestmentWithPnL[];
  onArchived?: () => void;
  onEdit?: (inv: InvestmentWithPnL) => void;
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

export default function InvestmentsList({ investments, onArchived, onEdit }: InvestmentsListProps) {
  const [archivingId, setArchivingId] = useState<string | null>(null);

  const archive = async (id: string) => {
    if (!confirm('¿Archivar esta posición? Podés volver a cargarla después si hace falta.')) return;
    setArchivingId(id);
    try {
      const r = await fetch(`/api/investments/${id}`, { method: 'DELETE' });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error || 'Error al archivar');
      }
      onArchived?.();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'No se pudo archivar');
    } finally {
      setArchivingId(null);
    }
  };
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
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-4 min-w-0">
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

            <div className="text-right shrink-0 flex flex-col items-end gap-2">
              <div className="flex gap-2">
                {onEdit && (
                  <button
                    type="button"
                    onClick={() => onEdit(inv)}
                    className="text-xs font-medium text-emerald-600 dark:text-emerald-400 hover:underline"
                  >
                    Editar
                  </button>
                )}
                {onArchived && (
                  <button
                    type="button"
                    onClick={() => void archive(inv.id)}
                    disabled={archivingId === inv.id}
                    className="text-xs font-medium text-slate-400 hover:text-red-600 dark:hover:text-red-400 disabled:opacity-50"
                  >
                    {archivingId === inv.id ? '…' : 'Archivar'}
                  </button>
                )}
              </div>
              <div className="text-xl font-bold text-slate-900 dark:text-slate-50 tabular-nums">
                USD {inv.market_value_usd.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                ≈ ARS{' '}
                {inv.market_value_ars_blue.toLocaleString('es-AR', { maximumFractionDigits: 0 })} blue
              </div>
              <div
                className={`text-sm font-medium tabular-nums ${
                  inv.profit_loss_usd >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
                }`}
              >
                {inv.profit_loss_usd >= 0 ? '+' : ''}
                USD {inv.profit_loss_usd.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </div>
              <div
                className={`text-xs tabular-nums ${
                  inv.profit_loss_percent_usd >= 0
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-red-600 dark:text-red-400'
                }`}
              >
                {inv.profit_loss_percent_usd >= 0 ? '+' : ''}
                {inv.profit_loss_percent_usd.toFixed(2)}%
              </div>
            </div>
          </div>

          {inv.current_price && (
            <div className="mt-3 text-xs text-slate-500 dark:text-slate-400 border-t border-slate-100 dark:border-slate-700 pt-3">
              Precio actual ({inv.market_price_currency}):{' '}
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
