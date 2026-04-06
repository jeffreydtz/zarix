'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { AccountWithBalance } from '@/lib/services/accounts';

interface InvestmentAccountsListProps {
  accounts: AccountWithBalance[];
}

export default function InvestmentAccountsList({ accounts }: InvestmentAccountsListProps) {
  const router = useRouter();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleDelete = async (account: AccountWithBalance) => {
    const ok = window.confirm(
      `Eliminar la cuenta de inversión "${account.name}"?\n\nEsta acción la desactiva y también desactiva sus inversiones asociadas.`
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
    <div className="card">
      <h2 className="text-lg font-semibold mb-4">Cuentas de Inversión</h2>
      <div className="space-y-3">
        {accounts.map((account) => (
          <div key={account.id} className="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-gray-800">
            <div className="flex items-center gap-3 min-w-0">
              <span className="text-2xl">{account.icon || '📈'}</span>
              <div className="min-w-0">
                <div className="font-semibold truncate">{account.name}</div>
                <div className="text-sm text-gray-500">{account.currency}</div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-right">
                <div className="text-lg font-bold">
                  ${account.balance.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                </div>
                {account.currency !== 'ARS' && Number(account.balance) !== 0 && (
                  <div className="text-xs text-gray-400">
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
