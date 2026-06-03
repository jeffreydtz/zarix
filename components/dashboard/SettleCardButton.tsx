'use client';

import { useMemo, useState } from 'react';
import { useBodyScrollLock } from '@/lib/hooks/useBodyScrollLock';
import { useRouter } from 'next/navigation';
import { formatAccountSelectLabel } from '@/lib/format-account-select';
import MiniAmountCalculatorButton from '@/components/ui/MiniAmountCalculatorButton';
import type { AccountType } from '@/types/database';

type FundingAccount = {
  id: string;
  name: string;
  currency: string;
  balance: number;
  type?: AccountType;
  last_4_digits?: string | null;
};

interface SettleCardButtonProps {
  card: { id: string; name: string; currency: string };
  /** Deuda en la moneda principal de la tarjeta (positivo). */
  primaryDebt: number;
  /** Tarjeta bimoneda: muestra aviso de que la parte en USD se salda aparte. */
  isMulticurrency?: boolean;
  /** Cuentas de la misma moneda con saldo a favor para fondear el pago. */
  fundingAccounts: FundingAccount[];
}

/** Saldo disponible para debitar (no negativo, 2 decimales). */
function availableFromSource(balance: number): number {
  return Math.round(Math.max(0, Number(balance)) * 100) / 100;
}

function formatMoney(n: number): string {
  return n.toLocaleString('es-AR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export default function SettleCardButton({
  card,
  primaryDebt,
  isMulticurrency,
  fundingAccounts,
}: SettleCardButtonProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  useBodyScrollLock(isOpen);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [fundingId, setFundingId] = useState('');
  const [amount, setAmount] = useState('');

  const hasFunding = fundingAccounts.length > 0;

  const fundingAccount = useMemo(
    () => fundingAccounts.find((a) => a.id === fundingId),
    [fundingAccounts, fundingId]
  );

  const fundingAvailable = fundingAccount ? availableFromSource(fundingAccount.balance) : 0;
  /** Tope: ni más que la deuda ni más que el saldo de la cuenta origen. */
  const maxSettle = Math.min(primaryDebt, fundingAvailable);

  const amountNum = parseFloat(amount.replace(',', '.'));
  const amountValid = Number.isFinite(amountNum) && amountNum > 0 && amountNum <= maxSettle + 1e-9;

  if (primaryDebt <= 0) return null;

  const openModal = () => {
    setError('');
    const first = fundingAccounts[0];
    setFundingId(first?.id ?? '');
    const initialMax = first ? Math.min(primaryDebt, availableFromSource(first.balance)) : 0;
    setAmount(initialMax > 0 ? initialMax.toFixed(2) : '');
    setIsOpen(true);
  };

  const handleClose = () => {
    setIsOpen(false);
    setFundingId('');
    setAmount('');
    setLoading(false);
  };

  const selectFunding = (id: string) => {
    setFundingId(id);
    const acc = fundingAccounts.find((a) => a.id === id);
    const max = acc ? Math.min(primaryDebt, availableFromSource(acc.balance)) : 0;
    setAmount(max > 0 ? max.toFixed(2) : '');
  };

  const applyMax = () => {
    if (maxSettle > 0) setAmount(maxSettle.toFixed(2));
  };

  const handleSettle = async () => {
    if (!fundingId || !amountValid) return;
    setError('');
    setLoading(true);
    try {
      const response = await fetch('/api/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'transfer',
          accountId: fundingId,
          destinationAccountId: card.id,
          amount: amountNum,
          currency: card.currency,
          description: `Pago de tarjeta ${card.name}`,
        }),
      });
      if (!response.ok) throw new Error('settle failed');
      handleClose();
      router.refresh();
    } catch {
      setLoading(false);
      setError('No se pudo saldar la tarjeta');
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => hasFunding && openModal()}
        disabled={!hasFunding}
        title={
          hasFunding
            ? undefined
            : `No tenés saldo en ${card.currency} para saldar esta tarjeta.`
        }
        className={`btn btn-primary px-3 py-1.5 text-sm${
          hasFunding ? '' : ' opacity-50 cursor-not-allowed'
        }`}
      >
        Saldar
      </button>

      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center p-4 z-50"
          onClick={(e) => {
            if (e.target === e.currentTarget) handleClose();
          }}
        >
          <div className="bg-white dark:bg-gray-800 rounded-2xl max-w-md w-full p-6 max-h-[90dvh] overflow-y-auto overscroll-contain">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold">Saldar {card.name}</h2>
              <button
                onClick={handleClose}
                aria-label="Cerrar"
                className="p-2 -mr-2 min-w-[44px] min-h-[44px] inline-flex items-center justify-center text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              {error && (
                <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-400">
                  {error}
                </div>
              )}
              <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50/80 dark:bg-amber-900/15 px-3 py-2.5">
                <p className="text-sm text-slate-700 dark:text-slate-200">
                  Deuda actual:{' '}
                  <span className="font-bold tabular-nums text-amber-700 dark:text-amber-300">
                    ${formatMoney(primaryDebt)} {card.currency}
                  </span>
                </p>
                {isMulticurrency && (
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                    Esta tarjeta también tiene deuda en USD; por ahora se salda aparte.
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Fondear desde</label>
                <select
                  value={fundingId}
                  onChange={(e) => selectFunding(e.target.value)}
                  className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-700"
                >
                  {fundingAccounts.map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      {formatAccountSelectLabel(acc)}
                    </option>
                  ))}
                </select>
                {fundingAccount && (
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1.5">
                    Disponible ({fundingAccount.currency}):{' '}
                    <span className="tabular-nums font-medium text-slate-600 dark:text-slate-300">
                      {formatMoney(fundingAvailable)}
                    </span>
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Monto a saldar</label>
                <div className="flex flex-col gap-2">
                  <input
                    type="text"
                    inputMode="decimal"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.00"
                    className="w-full min-w-0 px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-700"
                  />
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={applyMax}
                      disabled={maxSettle <= 0}
                      title={`Completar con el máximo a saldar: ${formatMoney(maxSettle)} ${card.currency}`}
                      className="shrink-0 px-3 py-2 rounded-lg text-sm font-medium border border-emerald-200 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-200 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 disabled:opacity-40 disabled:pointer-events-none disabled:cursor-not-allowed"
                    >
                      Saldar todo
                    </button>
                    <MiniAmountCalculatorButton currentAmount={amount} onApply={setAmount} />
                  </div>
                </div>
                {amount !== '' && !amountValid && (
                  <p className="text-[11px] text-amber-700 dark:text-amber-300 mt-1.5">
                    El monto debe ser mayor a 0 y no superar ${formatMoney(maxSettle)}{' '}
                    {card.currency} (deuda o saldo disponible).
                  </p>
                )}
              </div>

              <button
                onClick={handleSettle}
                disabled={loading || !fundingId || !amountValid}
                className="w-full btn btn-primary py-3 disabled:opacity-50"
              >
                {loading ? 'Saldando...' : 'Saldar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
