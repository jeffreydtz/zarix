'use client';

import { useEffect, useMemo, useState } from 'react';
import type { Account } from '@/types/database';
import type { InvestmentType } from '@/types/database';
import type { InvestmentWithPnL } from '@/lib/services/investments';

const TYPE_OPTIONS: { value: InvestmentType; label: string }[] = [
  { value: 'stock_us', label: 'Acción USA' },
  { value: 'etf', label: 'ETF (USA)' },
  { value: 'cedear', label: 'CEDEAR' },
  { value: 'stock_arg', label: 'Acción Argentina (BYMA)' },
  { value: 'crypto', label: 'Cripto' },
  { value: 'plazo_fijo', label: 'Plazo fijo' },
  { value: 'fci', label: 'FCI' },
  { value: 'bond', label: 'Bono' },
  { value: 'caucion', label: 'Caución' },
  { value: 'real_estate', label: 'Inmueble' },
  { value: 'other', label: 'Otro' },
];

const NEEDS_TICKER = new Set<InvestmentType>([
  'stock_arg',
  'cedear',
  'stock_us',
  'etf',
  'crypto',
]);

interface EditInvestmentDialogProps {
  investment: InvestmentWithPnL | null;
  accounts: Account[];
  onClose: () => void;
  onSaved: () => void;
}

export default function EditInvestmentDialog({
  investment,
  accounts,
  onClose,
  onSaved,
}: EditInvestmentDialogProps) {
  const [accountId, setAccountId] = useState('');
  const [type, setType] = useState<InvestmentType>('stock_us');
  const [ticker, setTicker] = useState('');
  const [name, setName] = useState('');
  const [quantity, setQuantity] = useState('');
  const [purchasePrice, setPurchasePrice] = useState('');
  const [purchaseCurrency, setPurchaseCurrency] = useState('USD');
  const [purchaseDate, setPurchaseDate] = useState('');
  const [maturityDate, setMaturityDate] = useState('');
  const [interestRate, setInterestRate] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const needsTicker = NEEDS_TICKER.has(type);

  useEffect(() => {
    if (!investment) return;
    setAccountId(investment.account_id);
    setType(investment.type);
    setTicker(investment.ticker || '');
    setName(investment.name);
    setQuantity(String(investment.quantity));
    setPurchasePrice(String(investment.purchase_price));
    setPurchaseCurrency(investment.purchase_currency || 'USD');
    setPurchaseDate(investment.purchase_date?.split('T')[0] || investment.purchase_date);
    setMaturityDate(investment.maturity_date ? investment.maturity_date.split('T')[0] : '');
    setInterestRate(investment.interest_rate != null ? String(investment.interest_rate) : '');
    setError(null);
  }, [investment]);

  const accountChoices = useMemo(
    () => accounts.filter((a) => a.type === 'investment'),
    [accounts]
  );

  if (!investment) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!accountId) {
      setError('Elegí una cuenta.');
      return;
    }
    if (needsTicker && !ticker.trim()) {
      setError('Completá el ticker.');
      return;
    }
    const qty = Number(quantity);
    const price = Number(purchasePrice);
    if (!Number.isFinite(qty) || qty <= 0 || !Number.isFinite(price) || price <= 0) {
      setError('Cantidad y precio deben ser números válidos.');
      return;
    }

    setSubmitting(true);
    try {
      let interestPatch: number | null = null;
      if (interestRate.trim() !== '') {
        const ir = Number(interestRate.replace(',', '.'));
        interestPatch = Number.isFinite(ir) ? ir : null;
      }

      const body: Record<string, unknown> = {
        accountId,
        type,
        name: name.trim(),
        quantity: qty,
        purchasePrice: price,
        purchaseCurrency,
        purchaseDate,
      };
      if (type === 'plazo_fijo' || type === 'caucion' || type === 'bond') {
        body.maturityDate = maturityDate || null;
        body.interestRate = interestPatch;
      }
      if (needsTicker) body.ticker = ticker.trim().toUpperCase();
      else body.ticker = null;

      const r = await fetch(`/api/investments/${investment.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Error al guardar');
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/40"
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-inv-title"
    >
      <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 shadow-xl">
        <div className="sticky top-0 flex items-center justify-between gap-2 px-5 py-3 border-b border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800">
          <h2 id="edit-inv-title" className="text-lg font-bold text-slate-900 dark:text-slate-50">
            Editar posición
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700"
            aria-label="Cerrar"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <label className="block text-sm">
            <span className="text-slate-600 dark:text-slate-400 font-medium">Cuenta</span>
            <select
              className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              required
            >
              {accountChoices.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} ({a.currency})
                </option>
              ))}
            </select>
          </label>

          <label className="block text-sm">
            <span className="text-slate-600 dark:text-slate-400 font-medium">Tipo</span>
            <select
              className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
              value={type}
              onChange={(e) => setType(e.target.value as InvestmentType)}
            >
              {TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>

          {needsTicker && (
            <label className="block text-sm">
              <span className="text-slate-600 dark:text-slate-400 font-medium">Ticker</span>
              <input
                className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm font-mono uppercase"
                value={ticker}
                onChange={(e) => setTicker(e.target.value.toUpperCase())}
              />
            </label>
          )}

          <label className="block text-sm">
            <span className="text-slate-600 dark:text-slate-400 font-medium">Nombre</span>
            <input
              className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm">
              <span className="text-slate-600 dark:text-slate-400 font-medium">Cantidad</span>
              <input
                className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm tabular-nums"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
            </label>
            <label className="block text-sm">
              <span className="text-slate-600 dark:text-slate-400 font-medium">Precio compra</span>
              <input
                className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm tabular-nums"
                value={purchasePrice}
                onChange={(e) => setPurchasePrice(e.target.value)}
              />
            </label>
          </div>

          <label className="block text-sm">
            <span className="text-slate-600 dark:text-slate-400 font-medium">Moneda compra</span>
            <select
              className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
              value={purchaseCurrency}
              onChange={(e) => setPurchaseCurrency(e.target.value)}
            >
              <option value="USD">USD</option>
              <option value="ARS">ARS</option>
            </select>
          </label>

          <label className="block text-sm">
            <span className="text-slate-600 dark:text-slate-400 font-medium">Fecha compra</span>
            <input
              type="date"
              className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
              value={purchaseDate}
              onChange={(e) => setPurchaseDate(e.target.value)}
              required
            />
          </label>

          {(type === 'plazo_fijo' || type === 'caucion' || type === 'bond') && (
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm">
                <span className="text-slate-600 dark:text-slate-400 font-medium">Vencimiento</span>
                <input
                  type="date"
                  className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
                  value={maturityDate}
                  onChange={(e) => setMaturityDate(e.target.value)}
                />
              </label>
              <label className="block text-sm">
                <span className="text-slate-600 dark:text-slate-400 font-medium">TNA %</span>
                <input
                  className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
                  value={interestRate}
                  onChange={(e) => setInterestRate(e.target.value)}
                />
              </label>
            </div>
          )}

          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

          <div className="flex gap-2 pt-2">
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-semibold py-2.5"
            >
              {submitting ? 'Guardando…' : 'Guardar'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-200 dark:border-slate-600 text-sm font-medium px-4 py-2.5 text-slate-700 dark:text-slate-200"
            >
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
