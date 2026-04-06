'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

interface CorrectDebtBalanceSignProps {
  accountId: string;
  balance: number;
  isDebt: boolean;
  accountType: string;
}

/**
 * Aviso cuando la deuda quedó guardada en positivo: la UI muestra -$X con abs(),
 * pero los pagos suman al saldo en BD y parece que sube la deuda.
 */
export default function CorrectDebtBalanceSign({
  accountId,
  balance,
  isDebt,
  accountType,
}: CorrectDebtBalanceSignProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const debtLike = isDebt || accountType === 'credit_card';
  const needsFix = debtLike && Number(balance) > 0;

  if (!needsFix) return null;

  const run = async () => {
    if (
      !confirm(
        'Vamos a guardar la deuda de la tarjeta como saldo negativo interno (el número en pantalla no cambia). Así los pagos desde otra cuenta van a bajar la deuda de verdad. ¿Seguimos?'
      )
    ) {
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/accounts/${accountId}/correct-debt-sign`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Error');
      router.refresh();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 px-4 py-3 text-sm text-amber-900 dark:text-amber-100">
      <p className="font-medium mb-1">Saldo de tarjeta con signo inconsistente</p>
      <p className="text-xs opacity-90 mb-3 leading-relaxed">
        El saldo interno está en positivo pero se muestra como deuda con el signo menos. Por eso un pago
        transferido a esta tarjeta puede <strong>sumar</strong> deuda en lugar de restar. Corregí el signo
        una vez; después los movimientos nuevos van a cuadrar.
      </p>
      <button
        type="button"
        onClick={run}
        disabled={loading}
        className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white disabled:opacity-50"
      >
        {loading ? 'Corrigiendo…' : 'Corregir signo del saldo ahora'}
      </button>
    </div>
  );
}
