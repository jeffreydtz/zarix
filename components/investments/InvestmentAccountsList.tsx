'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { AccountWithBalance } from '@/lib/services/accounts';
import { getAccountDisplayName } from '@/lib/account-display-name';

interface InvestmentAccountsListProps {
  accounts: AccountWithBalance[];
}

export default function InvestmentAccountsList({ accounts }: InvestmentAccountsListProps) {
  const router = useRouter();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleDelete = async (account: AccountWithBalance) => {
    const ok = window.confirm(
      `Archivar la cuenta de inversión "${getAccountDisplayName(account)}"?\n\nSe desactiva la cuenta y sus inversiones asociadas. Los movimientos no se borran; podés restaurar la cuenta desde Cuentas → Cuentas archivadas.`
    );
    if (!ok) return;

    setDeletingId(account.id);
    try {
      const response = await fetch(`/api/accounts/${account.id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'No se pudo eliminar la cuenta de inversión');
      }

      router.refresh();
    } catch (error: any) {
      alert(error?.message || 'Error al eliminar la cuenta de inversión');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-5 shadow-sm">
      <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-4">Cuentas de inversión</h2>
      <div className="space-y-3">
        {accounts.map((account) => (
          <div
            key={account.id}
            className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-700/40 border border-slate-100 dark:border-slate-600/50"
          >
            <div className="flex items-center gap-3 min-w-0">
              <span className="text-2xl">{account.icon || '📈'}</span>
              <div className="min-w-0">
                <div className="font-semibold truncate text-slate-900 dark:text-slate-50">
                  {getAccountDisplayName(account)}
                </div>
                <div className="text-sm text-slate-500 dark:text-slate-400">{account.currency}</div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-right">
                <div className="text-lg font-bold text-slate-900 dark:text-slate-50 tabular-nums">
                  ${account.balance.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                </div>
                {account.currency !== 'ARS' && Number(account.balance) !== 0 && (
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    {account.balance_ars_blue != null && account.balance_ars_blue !== 0 ? (
                      <>≈ ${account.balance_ars_blue.toLocaleString('es-AR')} ARS</>
                    ) : (
                      <>Sin cotización a ARS</>
                    )}
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() => handleDelete(account)}
                disabled={deletingId === account.id}
                className="px-3 py-1.5 rounded-lg text-sm font-medium bg-red-100 text-red-700 hover:bg-red-200 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-red-900/30 dark:text-red-300 dark:hover:bg-red-900/50"
              >
                {deletingId === account.id ? 'Eliminando...' : 'Eliminar'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
