'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useConfirm } from '@/components/ui/ConfirmDialog';

export default function ReconcileBalanceButton({ accountId }: { accountId: string }) {
  const router = useRouter();
  const confirm = useConfirm();
  const [loading, setLoading] = useState(false);

  const run = async () => {
    const ok = await confirm({
      title: '¿Recalcular el saldo?',
      description:
        'Se arma de nuevo desde todos los movimientos de esta cuenta. Sirve si el saldo no coincide con el historial.',
      confirmLabel: 'Recalcular',
    });
    if (!ok) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/accounts/${accountId}/reconcile-balance`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'No se pudo recalcular');
      router.refresh();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Error');
      setLoading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={() => void run()}
      disabled={loading}
      className="text-sm text-warning hover:underline disabled:opacity-50"
    >
      {loading ? 'Recalculando…' : 'Recalcular saldo desde movimientos'}
    </button>
  );
}
