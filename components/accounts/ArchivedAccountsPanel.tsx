'use client';

import { useState } from 'react';
import type { Account } from '@/types/database';

interface ArchivedAccountsPanelProps {
  accounts: Account[];
}

export default function ArchivedAccountsPanel({ accounts }: ArchivedAccountsPanelProps) {
  const [loadingId, setLoadingId] = useState<string | null>(null);

  if (accounts.length === 0) return null;

  const restore = async (id: string) => {
    setLoadingId(id);
    try {
      const res = await fetch(`/api/accounts/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: true }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error || 'No se pudo restaurar');
      }
      window.location.reload();
    } catch (error: unknown) {
      alert(error instanceof Error ? error.message : 'Error al restaurar');
    } finally {
      setLoadingId(null);
    }
  };

  return (
    <div className="card border border-slate-200 dark:border-slate-600 bg-slate-50/50 dark:bg-slate-800/40">
      <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-1">
        Cuentas archivadas
      </h2>
      <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
        No aparecen en listados ni en totales del panel. Los movimientos siguen guardados; al restaurar
        volvés a verlos en gastos y análisis.
      </p>
      <ul className="divide-y divide-slate-200 dark:divide-slate-600">
        {accounts.map((a) => (
          <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-3 first:pt-0">
            <span className="text-slate-700 dark:text-slate-200">
              <span className="mr-1">{a.icon || '💳'}</span>
              {a.name}
              <span className="text-slate-500 dark:text-slate-400 text-sm ml-2">{a.currency}</span>
            </span>
            <button
              type="button"
              onClick={() => restore(a.id)}
              disabled={loadingId === a.id}
              className="btn btn-secondary text-sm disabled:opacity-50"
            >
              {loadingId === a.id ? 'Restaurando…' : 'Restaurar'}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
