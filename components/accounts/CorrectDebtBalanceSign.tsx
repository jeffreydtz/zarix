'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useConfirm } from '@/components/ui/ConfirmDialog';

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
  const confirm = useConfirm();
  const [loading, setLoading] = useState(false);
  const debtLike = isDebt || accountType === 'credit_card';
  const needsFix = debtLike && Number(balance) > 0;

  const run = async () => {
    const ok = await confirm({
      title: '¿Corregir el signo de la deuda?',
      description:
        'La deuda se guarda como saldo negativo interno (el número en pantalla no cambia). Así los pagos desde otra cuenta bajan la deuda de verdad.',
      confirmLabel: 'Corregir',
    });
    if (!ok) return;
    if (!needsFix) return;
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

  if (!needsFix) return null;

  return (
    <div className="rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning">
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
        className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-warning hover:brightness-90 text-white disabled:opacity-50"
      >
        {loading ? 'Corrigiendo…' : 'Corregir signo del saldo ahora'}
      </button>
    </div>
  );
}
