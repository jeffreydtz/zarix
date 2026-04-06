'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';

function defaultEndYmd() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

function defaultStartYmd() {
  const d = new Date();
  d.setMonth(d.getMonth() - 1);
  return d.toISOString().slice(0, 10);
}

interface RepairCurrencyRangePanelProps {
  accountId: string;
}

export default function RepairCurrencyRangePanel({ accountId }: RepairCurrencyRangePanelProps) {
  const router = useRouter();
  const [startDate, setStartDate] = useState(defaultStartYmd);
  const [endDate, setEndDate] = useState(defaultEndYmd);
  const [onlyUsd, setOnlyUsd] = useState(true);
  const [force, setForce] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<{
    updated: number;
    sameCurrency: number;
    filteredOut: number;
    alreadyAligned: number;
  } | null>(null);

  const canSubmit = useMemo(() => Boolean(startDate && endDate && startDate <= endDate), [
    startDate,
    endDate,
  ]);

  const run = async () => {
    if (!canSubmit) return;
    setLoading(true);
    setError(null);
    setLastResult(null);
    try {
      const res = await fetch(`/api/accounts/${accountId}/repair-currency-range`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          startDate,
          endDate,
          onlyUsd,
          force,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'No se pudo aplicar');
      }
      setLastResult(data);
      setTimeout(() => router.refresh(), 400);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card border border-amber-200 dark:border-amber-900/50 bg-amber-50/40 dark:bg-amber-950/20">
      <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100 mb-1">
        Recalcular conversiones y saldo
      </h3>
      <p className="text-xs text-slate-600 dark:text-slate-400 mb-3 leading-relaxed">
        Vuelve a aplicar la cotización actual del sistema a los gastos e ingresos en otra moneda (p. ej. USD
        en cuenta en ARS) entre las fechas que elijas. El saldo de la cuenta se actualiza con la diferencia.
      </p>
      <div className="flex flex-wrap items-end gap-3 mb-3">
        <div>
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Desde</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="input text-sm py-1.5"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Hasta</label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="input text-sm py-1.5"
          />
        </div>
        <button
          type="button"
          disabled={!canSubmit || loading}
          onClick={run}
          className="btn bg-amber-600 hover:bg-amber-700 text-white border-0 disabled:opacity-50 text-sm py-2"
        >
          {loading ? 'Aplicando…' : 'Aplicar recálculo'}
        </button>
      </div>
      <div className="flex flex-wrap gap-4 text-xs text-slate-600 dark:text-slate-400 mb-2">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={onlyUsd}
            onChange={(e) => setOnlyUsd(e.target.checked)}
            className="rounded border-slate-300"
          />
          Solo comprobantes en USD
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={force}
            onChange={(e) => setForce(e.target.checked)}
            className="rounded border-slate-300"
          />
          Forzar todo (incluso si el importe ya coincide)
        </label>
      </div>
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
      {lastResult && (
        <p className="text-xs text-emerald-700 dark:text-emerald-300">
          Actualizados: {lastResult.updated}. Misma moneda que la cuenta: {lastResult.sameCurrency}.
          {lastResult.filteredOut > 0 && ` Filtrados: ${lastResult.filteredOut}.`}
          {lastResult.alreadyAligned > 0 && ` Sin cambios necesarios: ${lastResult.alreadyAligned}.`}
        </p>
      )}
    </div>
  );
}
