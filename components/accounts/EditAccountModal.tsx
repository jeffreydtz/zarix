'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import type { AccountWithBalance } from '@/lib/services/accounts';
import {
  ACCOUNT_FORM_CURRENCIES,
  ACCOUNT_FORM_ICONS,
  ACCOUNT_FORM_TYPES,
} from '@/components/accounts/account-form-constants';

interface EditAccountModalProps {
  account: AccountWithBalance;
  onClose: () => void;
}

function moneyNearlyEqual(a: number, b: number): boolean {
  return Math.abs(a - b) < 1e-6;
}

export default function EditAccountModal({ account, onClose }: EditAccountModalProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const [name, setName] = useState(account.name);
  const [type, setType] = useState<string>(account.type);
  const [currency, setCurrency] = useState(account.currency);
  const [icon, setIcon] = useState(account.icon || '💳');
  const [color, setColor] = useState(account.color);
  const [includeInTotal, setIncludeInTotal] = useState(account.include_in_total);
  const [includeInLiquid, setIncludeInLiquid] = useState(
    account.include_in_liquid !== false
  );
  const [isDebt, setIsDebt] = useState(account.is_debt && account.type !== 'credit_card');
  const [minBalance, setMinBalance] = useState(
    account.min_balance != null ? String(account.min_balance) : ''
  );
  const [creditLimit, setCreditLimit] = useState(
    account.credit_limit != null ? String(account.credit_limit) : ''
  );
  const [closingDay, setClosingDay] = useState(
    account.closing_day != null ? String(account.closing_day) : ''
  );
  const [dueDay, setDueDay] = useState(account.due_day != null ? String(account.due_day) : '');
  const [last4Digits, setLast4Digits] = useState(account.last_4_digits || '');
  const [isMulticurrency, setIsMulticurrency] = useState(account.is_multicurrency);
  const [secondaryCurrency, setSecondaryCurrency] = useState(
    account.secondary_currency || 'USD'
  );
  const [targetBalance, setTargetBalance] = useState(
    String(Number(account.balance).toFixed(2))
  );

  useEffect(() => {
    setName(account.name);
    setType(account.type);
    setCurrency(account.currency);
    setIcon(account.icon || '💳');
    setColor(account.color);
    setIncludeInTotal(account.include_in_total);
    setIncludeInLiquid(account.include_in_liquid !== false);
    setIsDebt(account.is_debt && account.type !== 'credit_card');
    setMinBalance(account.min_balance != null ? String(account.min_balance) : '');
    setCreditLimit(account.credit_limit != null ? String(account.credit_limit) : '');
    setClosingDay(account.closing_day != null ? String(account.closing_day) : '');
    setDueDay(account.due_day != null ? String(account.due_day) : '');
    setLast4Digits(account.last_4_digits || '');
    setIsMulticurrency(account.is_multicurrency);
    setSecondaryCurrency(account.secondary_currency || 'USD');
    setTargetBalance(String(Number(account.balance).toFixed(2)));
  }, [account]);

  const isCreditCard = type === 'credit_card';
  const isInvestment = type === 'investment';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      alert('El nombre es requerido');
      return;
    }
    if (isCreditCard) {
      const lim = parseFloat(creditLimit.replace(',', '.'));
      if (!Number.isFinite(lim) || lim <= 0) {
        alert('Ingresá un límite de crédito válido para la tarjeta');
        return;
      }
    }
    if (last4Digits && !/^\d{4}$/.test(last4Digits)) {
      alert('Los últimos 4 dígitos deben ser exactamente 4 números o vacío');
      return;
    }

    const target = parseFloat(targetBalance.replace(',', '.'));
    if (!Number.isFinite(target)) {
      alert('Ingresá un saldo válido');
      return;
    }

    let minBal: number | null = null;
    if (minBalance.trim() !== '') {
      const m = parseFloat(minBalance.replace(',', '.'));
      if (Number.isFinite(m)) minBal = m;
    }

    const payload: Record<string, unknown> = {
      name: name.trim(),
      type,
      currency,
      icon: icon || null,
      color,
      is_debt: isCreditCard || isDebt,
      include_in_total: includeInTotal,
      include_in_liquid: isInvestment ? true : includeInLiquid,
      min_balance: minBal,
    };

    if (isCreditCard) {
      payload.credit_limit = parseFloat(creditLimit.replace(',', '.'));
      payload.closing_day = closingDay.trim() ? parseInt(closingDay, 10) : null;
      payload.due_day = dueDay.trim() ? parseInt(dueDay, 10) : null;
      payload.last_4_digits = last4Digits.trim() || null;
      payload.is_multicurrency = isMulticurrency;
      payload.secondary_currency = isMulticurrency ? secondaryCurrency : null;
    } else {
      payload.credit_limit = null;
      payload.closing_day = null;
      payload.due_day = null;
      payload.last_4_digits = null;
      payload.is_multicurrency = false;
      payload.secondary_currency = null;
    }

    setLoading(true);
    try {
      const res = await fetch(`/api/accounts/${account.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error || 'Error al guardar');
      }

      if (!moneyNearlyEqual(target, Number(account.balance))) {
        const adj = await fetch(`/api/accounts/${account.id}/adjust-balance`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ targetBalance: target }),
        });
        if (!adj.ok) {
          const data = await adj.json().catch(() => ({}));
          throw new Error(
            (data as { error?: string }).error || 'Error al ajustar el saldo'
          );
        }
      }

      onClose();
      router.refresh();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Error al guardar');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <motion.div
          initial={{ scale: 0.96, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.96, opacity: 0 }}
          className="bg-white dark:bg-slate-800 rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto shadow-xl border border-slate-200 dark:border-slate-700"
          onClick={(ev) => ev.stopPropagation()}
        >
          <div className="sticky top-0 z-10 flex items-center justify-between gap-2 px-5 py-4 border-b border-slate-200 dark:border-slate-700 bg-white/95 dark:bg-slate-800/95 backdrop-blur-sm rounded-t-2xl">
            <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
              Editar cuenta
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500"
              aria-label="Cerrar"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>

          <form onSubmit={handleSubmit} className="p-5 space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Nombre
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="input w-full"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Tipo
              </label>
              <select
                value={type}
                onChange={(e) => {
                  const v = e.target.value;
                  setType(v);
                  const t = ACCOUNT_FORM_TYPES.find((x) => x.value === v);
                  if (t) setColor(t.color);
                }}
                className="input w-full"
              >
                {ACCOUNT_FORM_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.icon} {t.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Moneda
              </label>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="input w-full"
              >
                {ACCOUNT_FORM_CURRENCIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.flag} {c.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Color
              </label>
              <input
                type="color"
                value={color?.startsWith('#') ? color : '#3B82F6'}
                onChange={(e) => setColor(e.target.value)}
                className="h-10 w-full rounded-xl border border-slate-200 dark:border-slate-600 cursor-pointer bg-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Ícono
              </label>
              <div className="grid grid-cols-6 gap-1.5 max-h-28 overflow-y-auto">
                {ACCOUNT_FORM_ICONS.map((ic) => (
                  <button
                    key={ic}
                    type="button"
                    onClick={() => setIcon(ic)}
                    className={`p-2 text-xl rounded-lg border-2 transition-all ${
                      icon === ic
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                        : 'border-slate-200 dark:border-slate-600 hover:border-slate-300'
                    }`}
                  >
                    {ic}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Saldo en Zarix ({currency})
              </label>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">
                Si cambiás este valor, se crea un movimiento de ajuste por la diferencia.
              </p>
              <input
                type="text"
                inputMode="decimal"
                value={targetBalance}
                onChange={(e) => setTargetBalance(e.target.value)}
                className="input w-full font-mono"
              />
            </div>

            <div className="flex items-start gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-700/40">
              <input
                type="checkbox"
                id="edit-include-total"
                checked={includeInTotal}
                onChange={(e) => setIncludeInTotal(e.target.checked)}
                className="mt-1 w-4 h-4 rounded"
              />
              <div>
                <label htmlFor="edit-include-total" className="text-sm text-slate-700 dark:text-slate-300">
                  Incluir en totales generales de la app
                </label>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Desmarcar saca la cuenta del patrimonio del panel; la cuenta sigue activa y visible
                  acá. Para ocultarla de la lista usá archivar.
                </p>
              </div>
            </div>

            {!isInvestment && (
              <div className="flex items-start gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-700/40">
                <input
                  type="checkbox"
                  id="edit-include-liquid"
                  checked={includeInLiquid}
                  onChange={(e) => setIncludeInLiquid(e.target.checked)}
                  className="mt-1 w-4 h-4 rounded"
                />
                <div>
                  <label htmlFor="edit-include-liquid" className="text-sm text-slate-700 dark:text-slate-300">
                    Contar en patrimonio líquido
                  </label>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Desmarcá si el dinero no es “disponible” pero querés verlo en el total.
                  </p>
                </div>
              </div>
            )}

            {!isCreditCard && (
              <div className="flex items-start gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-700/40">
                <input
                  type="checkbox"
                  id="edit-is-debt"
                  checked={isDebt}
                  onChange={(e) => setIsDebt(e.target.checked)}
                  className="mt-1 w-4 h-4 rounded"
                />
                <label htmlFor="edit-is-debt" className="text-sm text-slate-700 dark:text-slate-300">
                  Es una deuda (saldo como obligación)
                </label>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Saldo mínimo alerta (opcional)
              </label>
              <input
                type="text"
                inputMode="decimal"
                value={minBalance}
                onChange={(e) => setMinBalance(e.target.value)}
                className="input w-full"
                placeholder="Vacío = sin alerta"
              />
            </div>

            {isCreditCard && (
              <div className="space-y-3 p-3 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50/80 dark:bg-amber-900/15">
                <p className="text-sm font-medium text-amber-900 dark:text-amber-200">Tarjeta de crédito</p>
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                    Límite *
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={creditLimit}
                    onChange={(e) => setCreditLimit(e.target.value)}
                    className="input w-full"
                    required
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                      Día cierre
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={31}
                      value={closingDay}
                      onChange={(e) => setClosingDay(e.target.value)}
                      className="input w-full"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                      Día vencimiento
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={31}
                      value={dueDay}
                      onChange={(e) => setDueDay(e.target.value)}
                      className="input w-full"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                    Últimos 4 dígitos
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={4}
                    value={last4Digits}
                    onChange={(e) => setLast4Digits(e.target.value.replace(/\D/g, '').slice(0, 4))}
                    className="input w-full font-mono"
                    placeholder="1234"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="edit-mc"
                    checked={isMulticurrency}
                    onChange={(e) => setIsMulticurrency(e.target.checked)}
                    className="w-4 h-4 rounded"
                  />
                  <label htmlFor="edit-mc" className="text-sm text-slate-700 dark:text-slate-300">
                    Tarjeta bi-moneda
                  </label>
                </div>
                {isMulticurrency && (
                  <select
                    value={secondaryCurrency}
                    onChange={(e) => setSecondaryCurrency(e.target.value)}
                    className="input w-full"
                  >
                    {ACCOUNT_FORM_CURRENCIES.filter((c) => c.value !== currency).map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.flag} {c.value}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            )}

            <div className="flex flex-col-reverse sm:flex-row gap-2 pt-2">
              <button
                type="button"
                onClick={onClose}
                disabled={loading}
                className="btn btn-secondary flex-1 py-2.5 rounded-xl"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={loading}
                className="btn btn-primary flex-1 py-2.5 rounded-xl"
              >
                {loading ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          </form>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
