'use client';

import { useState } from 'react';

export default function ReconcileBalanceButton({ accountId }: { accountId: string }) {
  const [loading, setLoading] = useState(false);

  const run = async () => {
    if (
      !confirm(
        'Recalcular el saldo desde todos los movimientos de esta cuenta.\n\n' +
          'Sirve si el saldo no coincide con el historial (por ejemplo tras borrar movimientos o ajustes).'
      )
    ) {
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/accounts/${accountId}/reconcile-balance`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'No se pudo recalcular');
      window.location.reload();
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
      className="text-sm text-amber-700 dark:text-amber-300 hover:underline disabled:opacity-50"
    >
      {loading ? 'Recalculando…' : 'Recalcular saldo desde movimientos'}
    </button>
  );
}
