'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { formatAccountSelectLabel } from '@/lib/format-account-select';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { dateToLocalYmd } from '@/lib/transaction-date';

interface TransactionsFiltersProps {
  accounts: Array<{ id: string; name: string; currency: string; balance: number }>;
  categories: Array<{ id: string; name: string; icon: string; type: string }>;
}

function getPresetDates(preset: string): { startDate: string; endDate: string } | null {
  const now = new Date();
  const fmt = (d: Date) => dateToLocalYmd(d);

  switch (preset) {
    case 'today': {
      const s = fmt(now);
      return { startDate: s, endDate: s };
    }
    case 'week': {
      const start = new Date(now);
      start.setDate(now.getDate() - 7);
      return { startDate: fmt(start), endDate: fmt(now) };
    }
    case 'month': {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      return { startDate: fmt(start), endDate: fmt(end) };
    }
    case 'last_month': {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const end = new Date(now.getFullYear(), now.getMonth(), 0);
      return { startDate: fmt(start), endDate: fmt(end) };
    }
    case 'year': {
      const start = new Date(now.getFullYear(), 0, 1);
      return { startDate: fmt(start), endDate: fmt(now) };
    }
    default:
      return null;
  }
}

export default function TransactionsFilters({ accounts, categories }: TransactionsFiltersProps) {
  const router = useRouter();
  const confirm = useConfirm();
  const searchParams = useSearchParams();
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [deletingAll, setDeletingAll] = useState(false);

  const updateParams = (updates: Record<string, string>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (value) {
        params.set(key, value);
      } else {
        params.delete(key);
      }
    }
    router.push(`/expenses?${params.toString()}`);
  };

  const handlePreset = (preset: string) => {
    if (!preset) {
      updateParams({ startDate: '', endDate: '' });
      return;
    }
    const dates = getPresetDates(preset);
    if (dates) {
      updateParams(dates);
    }
  };

  const handleReset = () => {
    router.push('/expenses');
  };

  const handleDeleteAll = async () => {
    const first = await confirm({
      title: '¿Eliminar todos los movimientos?',
      description:
        'Se borran gastos, ingresos y transferencias. Esta acción no se puede deshacer.',
      confirmLabel: 'Continuar',
      danger: true,
    });
    if (!first) return;
    const second = await confirm({
      title: 'Confirmá de nuevo',
      description: 'Se va a borrar todo el historial de movimientos.',
      confirmLabel: 'Eliminar todo',
      danger: true,
    });
    if (!second) return;

    setDeletingAll(true);
    try {
      const response = await fetch('/api/transactions', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: 'DELETE_ALL' }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'No se pudieron eliminar los movimientos');
      }
      router.push('/expenses');
      router.refresh();
      alert('Se eliminaron todos tus movimientos.');
    } catch (error: any) {
      console.error(error);
      alert(error.message || 'Error al eliminar movimientos');
    } finally {
      setDeletingAll(false);
    }
  };

  const hasActiveFilters =
    searchParams.get('type') ||
    searchParams.get('accountId') ||
    searchParams.get('categoryId') ||
    searchParams.get('startDate') ||
    searchParams.get('endDate') ||
    searchParams.get('search') ||
    searchParams.get('minAmount') ||
    searchParams.get('maxAmount');

  return (
    <div className="bg-card rounded-2xl border border-border overflow-hidden">
      {/* Basic filters row */}
      <div className="p-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
        {/* Search */}
        <div className="sm:col-span-2 md:col-span-1 relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">🔍</span>
          <input
            type="text"
            placeholder="Buscar descripción..."
            value={searchParams.get('search') || ''}
            onChange={(e) => updateParams({ search: e.target.value })}
            className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-border bg-secondary text-foreground text-sm focus:ring-2 focus:ring-ring outline-none"
          />
        </div>

        {/* Type */}
        <div>
          <select
            value={searchParams.get('type') || ''}
            onChange={(e) => updateParams({ type: e.target.value })}
            className="w-full px-3 py-2.5 rounded-xl border border-border bg-secondary text-foreground text-sm focus:ring-2 focus:ring-ring outline-none"
          >
            <option value="">Todos los tipos</option>
            <option value="expense">💸 Gastos</option>
            <option value="income">💰 Ingresos</option>
            <option value="transfer">🔄 Transferencias</option>
          </select>
        </div>

        {/* Account */}
        <div>
          <select
            value={searchParams.get('accountId') || ''}
            onChange={(e) => updateParams({ accountId: e.target.value })}
            className="w-full px-3 py-2.5 rounded-xl border border-border bg-secondary text-foreground text-sm focus:ring-2 focus:ring-ring outline-none"
          >
            <option value="">Todas las cuentas</option>
            {accounts.map((acc) => (
              <option key={acc.id} value={acc.id}>
                {formatAccountSelectLabel(acc)}
              </option>
            ))}
          </select>
        </div>

        {/* Period presets */}
        <div>
          <select
            value=""
            onChange={(e) => handlePreset(e.target.value)}
            className="w-full px-3 py-2.5 rounded-xl border border-border bg-secondary text-foreground text-sm focus:ring-2 focus:ring-ring outline-none"
          >
            <option value="">Período rápido</option>
            <option value="today">Hoy</option>
            <option value="week">Última semana</option>
            <option value="month">Este mes</option>
            <option value="last_month">Mes anterior</option>
            <option value="year">Este año</option>
          </select>
        </div>
      </div>

      {/* Toggle advanced */}
      <div className="px-4 pb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="text-xs text-primary hover:text-primary/80 font-medium flex items-center gap-1"
          >
            {showAdvanced ? '▲' : '▼'} Filtros avanzados
          </button>
        </div>
        <div>
          {hasActiveFilters && (
            <button
              onClick={handleReset}
              className="text-xs text-muted-foreground hover:text-destructive font-medium flex items-center gap-1 transition-colors"
            >
              ✕ Limpiar filtros
            </button>
          )}
        </div>
      </div>

      {/* Advanced filters */}
      <AnimatePresence>
        {showAdvanced && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-t border-border"
          >
            <div className="p-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
              {/* Category */}
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Categoría</label>
                <select
                  value={searchParams.get('categoryId') || ''}
                  onChange={(e) => updateParams({ categoryId: e.target.value })}
                  className="w-full px-3 py-2.5 rounded-xl border border-border bg-secondary text-foreground text-sm focus:ring-2 focus:ring-ring outline-none"
                >
                  <option value="">Todas las categorías</option>
                  <option value="uncategorized">Sin categoría</option>
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.id}>{cat.icon} {cat.name}</option>
                  ))}
                </select>
              </div>

              {/* Date from */}
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Desde</label>
                <input
                  type="date"
                  value={searchParams.get('startDate') || ''}
                  onChange={(e) => updateParams({ startDate: e.target.value })}
                  className="w-full px-3 py-2.5 rounded-xl border border-border bg-secondary text-foreground text-sm focus:ring-2 focus:ring-ring outline-none"
                />
              </div>

              {/* Date to */}
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Hasta</label>
                <input
                  type="date"
                  value={searchParams.get('endDate') || ''}
                  onChange={(e) => updateParams({ endDate: e.target.value })}
                  className="w-full px-3 py-2.5 rounded-xl border border-border bg-secondary text-foreground text-sm focus:ring-2 focus:ring-ring outline-none"
                />
              </div>

              {/* Amount range */}
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Monto</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder="Min"
                    value={searchParams.get('minAmount') || ''}
                    onChange={(e) => updateParams({ minAmount: e.target.value.replace(',', '.') })}
                    className="w-1/2 px-2 py-2.5 rounded-xl border border-border bg-secondary text-foreground text-sm focus:ring-2 focus:ring-ring outline-none"
                  />
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder="Max"
                    value={searchParams.get('maxAmount') || ''}
                    onChange={(e) => updateParams({ maxAmount: e.target.value.replace(',', '.') })}
                    className="w-1/2 px-2 py-2.5 rounded-xl border border-border bg-secondary text-foreground text-sm focus:ring-2 focus:ring-ring outline-none"
                  />
                </div>
              </div>

              <details className="sm:col-span-2 md:col-span-4 mt-1 rounded-xl border border-border bg-secondary/50 px-3 py-2">
                <summary className="text-xs text-muted-foreground cursor-pointer select-none list-none flex items-center gap-2 [&::-webkit-details-marker]:hidden">
                  <span className="text-muted-foreground">▸</span>
                  Mantenimiento del historial (avanzado)
                </summary>
                <div className="pt-3 pb-1 border-t border-border mt-2">
                  <p className="text-xs text-muted-foreground mb-2 leading-relaxed">
                    Borra <strong>todos</strong> los movimientos de todas las cuentas. No se puede
                    deshacer.
                  </p>
                  <button
                    type="button"
                    onClick={handleDeleteAll}
                    disabled={deletingAll}
                    className="text-xs text-destructive hover:text-destructive/80 font-medium py-1.5 px-2 rounded-lg border border-destructive/30 bg-destructive/10 transition-colors disabled:opacity-50"
                  >
                    {deletingAll ? 'Eliminando…' : 'Eliminar todos los movimientos'}
                  </button>
                </div>
              </details>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Active filter badges */}
      {hasActiveFilters && (
        <div className="px-4 pb-3 flex flex-wrap gap-2">
          {searchParams.get('search') && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-primary/10 text-primary text-xs rounded-full">
              🔍 &quot;{searchParams.get('search')}&quot;
              <button onClick={() => updateParams({ search: '' })} className="hover:text-primary/80 ml-0.5">✕</button>
            </span>
          )}
          {searchParams.get('startDate') && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-secondary text-muted-foreground text-xs rounded-full">
              📅 Desde {searchParams.get('startDate')}
              <button onClick={() => updateParams({ startDate: '' })} className="hover:text-destructive ml-0.5">✕</button>
            </span>
          )}
          {searchParams.get('endDate') && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-secondary text-muted-foreground text-xs rounded-full">
              📅 Hasta {searchParams.get('endDate')}
              <button onClick={() => updateParams({ endDate: '' })} className="hover:text-destructive ml-0.5">✕</button>
            </span>
          )}
          {searchParams.get('minAmount') && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-secondary text-muted-foreground text-xs rounded-full">
              💰 Min ${searchParams.get('minAmount')}
              <button onClick={() => updateParams({ minAmount: '' })} className="hover:text-destructive ml-0.5">✕</button>
            </span>
          )}
          {searchParams.get('maxAmount') && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-secondary text-muted-foreground text-xs rounded-full">
              💰 Max ${searchParams.get('maxAmount')}
              <button onClick={() => updateParams({ maxAmount: '' })} className="hover:text-destructive ml-0.5">✕</button>
            </span>
          )}
          {searchParams.get('categoryId') === 'uncategorized' && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-secondary text-muted-foreground text-xs rounded-full">
              🏷️ Sin categoría
              <button onClick={() => updateParams({ categoryId: '' })} className="hover:text-destructive ml-0.5">✕</button>
            </span>
          )}
        </div>
      )}
    </div>
  );
}
