'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';

interface TransactionsFiltersProps {
  accounts: Array<{ id: string; name: string; currency: string }>;
  categories: Array<{ id: string; name: string; icon: string; type: string }>;
}

function getPresetDates(preset: string): { startDate: string; endDate: string } | null {
  const now = new Date();
  const fmt = (d: Date) => d.toISOString().split('T')[0];

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
    const firstConfirm = confirm(
      'Vas a eliminar TODOS tus movimientos (gastos, ingresos y transferencias). Esta acción no se puede deshacer. ¿Continuar?'
    );
    if (!firstConfirm) return;

    const secondConfirm = confirm('Confirmá nuevamente para eliminar todo el historial de movimientos.');
    if (!secondConfirm) return;

    setDeletingAll(true);
    try {
      const response = await fetch('/api/transactions', { method: 'DELETE' });
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
    <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
      {/* Basic filters row */}
      <div className="p-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
        {/* Search */}
        <div className="sm:col-span-2 md:col-span-1 relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">🔍</span>
          <input
            type="text"
            placeholder="Buscar descripción..."
            value={searchParams.get('search') || ''}
            onChange={(e) => updateParams({ search: e.target.value })}
            className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 text-slate-800 dark:text-slate-100 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
          />
        </div>

        {/* Type */}
        <div>
          <select
            value={searchParams.get('type') || ''}
            onChange={(e) => updateParams({ type: e.target.value })}
            className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 text-slate-800 dark:text-slate-100 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
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
            className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 text-slate-800 dark:text-slate-100 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
          >
            <option value="">Todas las cuentas</option>
            {accounts.map((acc) => (
              <option key={acc.id} value={acc.id}>{acc.name}</option>
            ))}
          </select>
        </div>

        {/* Period presets */}
        <div>
          <select
            value=""
            onChange={(e) => handlePreset(e.target.value)}
            className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 text-slate-800 dark:text-slate-100 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
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
            className="text-xs text-blue-500 hover:text-blue-600 font-medium flex items-center gap-1"
          >
            {showAdvanced ? '▲' : '▼'} Filtros avanzados
          </button>
          <button
            onClick={handleDeleteAll}
            disabled={deletingAll}
            className="text-xs text-red-600 hover:text-red-700 font-medium flex items-center gap-1 transition-colors disabled:opacity-50"
            title="Eliminar todos los movimientos"
          >
            🗑️ {deletingAll ? 'Eliminando...' : 'Eliminar todos'}
          </button>
        </div>
        <div>
          {hasActiveFilters && (
            <button
              onClick={handleReset}
              className="text-xs text-slate-500 hover:text-red-500 font-medium flex items-center gap-1 transition-colors"
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
            className="overflow-hidden border-t border-slate-100 dark:border-slate-700"
          >
            <div className="p-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
              {/* Category */}
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Categoría</label>
                <select
                  value={searchParams.get('categoryId') || ''}
                  onChange={(e) => updateParams({ categoryId: e.target.value })}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 text-slate-800 dark:text-slate-100 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                >
                  <option value="">Todas las categorías</option>
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.id}>{cat.icon} {cat.name}</option>
                  ))}
                </select>
              </div>

              {/* Date from */}
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Desde</label>
                <input
                  type="date"
                  value={searchParams.get('startDate') || ''}
                  onChange={(e) => updateParams({ startDate: e.target.value })}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 text-slate-800 dark:text-slate-100 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>

              {/* Date to */}
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Hasta</label>
                <input
                  type="date"
                  value={searchParams.get('endDate') || ''}
                  onChange={(e) => updateParams({ endDate: e.target.value })}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 text-slate-800 dark:text-slate-100 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>

              {/* Amount range */}
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Monto</label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    placeholder="Min"
                    value={searchParams.get('minAmount') || ''}
                    onChange={(e) => updateParams({ minAmount: e.target.value })}
                    className="w-1/2 px-2 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 text-slate-800 dark:text-slate-100 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                  <input
                    type="number"
                    placeholder="Max"
                    value={searchParams.get('maxAmount') || ''}
                    onChange={(e) => updateParams({ maxAmount: e.target.value })}
                    className="w-1/2 px-2 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 text-slate-800 dark:text-slate-100 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Active filter badges */}
      {hasActiveFilters && (
        <div className="px-4 pb-3 flex flex-wrap gap-2">
          {searchParams.get('search') && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-xs rounded-full">
              🔍 &quot;{searchParams.get('search')}&quot;
              <button onClick={() => updateParams({ search: '' })} className="hover:text-blue-900 ml-0.5">✕</button>
            </span>
          )}
          {searchParams.get('startDate') && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-xs rounded-full">
              📅 Desde {searchParams.get('startDate')}
              <button onClick={() => updateParams({ startDate: '' })} className="hover:text-red-500 ml-0.5">✕</button>
            </span>
          )}
          {searchParams.get('endDate') && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-xs rounded-full">
              📅 Hasta {searchParams.get('endDate')}
              <button onClick={() => updateParams({ endDate: '' })} className="hover:text-red-500 ml-0.5">✕</button>
            </span>
          )}
          {searchParams.get('minAmount') && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-xs rounded-full">
              💰 Min ${searchParams.get('minAmount')}
              <button onClick={() => updateParams({ minAmount: '' })} className="hover:text-red-500 ml-0.5">✕</button>
            </span>
          )}
          {searchParams.get('maxAmount') && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-xs rounded-full">
              💰 Max ${searchParams.get('maxAmount')}
              <button onClick={() => updateParams({ maxAmount: '' })} className="hover:text-red-500 ml-0.5">✕</button>
            </span>
          )}
        </div>
      )}
    </div>
  );
}
