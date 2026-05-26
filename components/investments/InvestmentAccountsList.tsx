'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Trash2 } from 'lucide-react';
import type { AccountWithBalance } from '@/lib/services/accounts';
import { getAccountDisplayName } from '@/lib/account-display-name';
import { PRIVACY_MASK, useInvestmentsPrivacy } from '@/lib/hooks/use-investments-privacy';

interface InvestmentAccountsListProps {
  accounts: AccountWithBalance[];
}

export default function InvestmentAccountsList({ accounts }: InvestmentAccountsListProps) {
  const router = useRouter();
  const { hidden } = useInvestmentsPrivacy();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleDelete = async (account: AccountWithBalance) => {
    const ok = window.confirm(
      `Archivar la cuenta de inversión "${getAccountDisplayName(account)}"?\n\nSe desactiva la cuenta y sus inversiones asociadas. Los movimientos no se borran; podés restaurar la cuenta desde Cuentas → Cuentas archivadas.`
    );
    if (!ok) return;

    setDeletingId(account.id);
    try {
      const response = await fetch(`/api/accounts/${account.id}`, { method: 'DELETE' });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'No se pudo eliminar la cuenta de inversión');
      }

      router.refresh();
    } catch (error: unknown) {
      alert(error instanceof Error ? error.message : 'Error al eliminar la cuenta de inversión');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="card">
      <h2 className="text-base font-semibold text-foreground mb-4">Cuentas de inversión</h2>
      <div className="space-y-2.5">
        {accounts.map((account) => {
          const balanceText = hidden
            ? `${PRIVACY_MASK}`
            : `$${account.balance.toLocaleString('es-AR', { minimumFractionDigits: 2 })}`;
          const showArsEquivalent =
            account.currency !== 'ARS' && Number(account.balance) !== 0;
          const arsEquivalentText = hidden
            ? `≈ ${PRIVACY_MASK} ARS`
            : account.balance_ars_blue != null && account.balance_ars_blue !== 0
              ? `≈ $${account.balance_ars_blue.toLocaleString('es-AR')} ARS`
              : 'Sin cotización a ARS';

          return (
            <div
              key={account.id}
              className="flex items-center justify-between gap-3 p-3 rounded-control bg-surface-soft border border-border/60"
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="text-2xl" aria-hidden>{account.icon || '📈'}</span>
                <div className="min-w-0">
                  <div className="font-semibold truncate text-foreground">
                    {getAccountDisplayName(account)}
                  </div>
                  <div className="text-xs text-muted-foreground">{account.currency}</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="text-right">
                  <div className="text-base sm:text-lg font-bold text-foreground tabular-nums">
                    {balanceText}
                  </div>
                  {showArsEquivalent && (
                    <div className="text-xs text-muted-foreground tabular-nums">
                      {arsEquivalentText}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => handleDelete(account)}
                  disabled={deletingId === account.id}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-control text-muted-foreground hover:text-red-500 hover:bg-red-500/10 disabled:opacity-50 transition-colors"
                  aria-label={`Archivar ${getAccountDisplayName(account)}`}
                  title="Archivar cuenta"
                >
                  <Trash2 size={14} aria-hidden />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
