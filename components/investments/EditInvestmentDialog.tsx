'use client';

import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, TriangleAlert, X } from 'lucide-react';
import type { Account, InvestmentType } from '@/types/database';
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

const NEEDS_TICKER = new Set<InvestmentType>(['stock_arg', 'cedear', 'stock_us', 'etf', 'crypto']);

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

  const accountChoices = useMemo(() => accounts.filter((a) => a.type === 'investment'), [accounts]);

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
      body.ticker = needsTicker ? ticker.trim().toUpperCase() : null;

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
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/50 backdrop-blur-sm"
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-inv-title"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          onClick={(e) => e.stopPropagation()}
          className="zx-panel w-full max-w-lg max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-card"
        >
          <div className="sticky top-0 z-10 flex items-center justify-between gap-2 px-5 py-3 border-b border-border bg-surface-elevated/95 backdrop-blur">
            <h2 id="edit-inv-title" className="text-base font-semibold text-foreground">
              Editar posición
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-8 w-8 items-center justify-center rounded-control text-muted-foreground hover:text-foreground hover:bg-surface-soft transition-colors"
              aria-label="Cerrar"
            >
              <X size={16} aria-hidden />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="p-5 space-y-4">
            <label className="block text-sm">
              <span className="text-muted-foreground font-medium">Cuenta</span>
              <div className="relative mt-1">
                <select
                  className="input pr-9 appearance-none"
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
                <ChevronDown
                  size={16}
                  aria-hidden
                  className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                />
              </div>
            </label>

            <label className="block text-sm">
              <span className="text-muted-foreground font-medium">Tipo</span>
              <div className="relative mt-1">
                <select
                  className="input pr-9 appearance-none"
                  value={type}
                  onChange={(e) => setType(e.target.value as InvestmentType)}
                >
                  {TYPE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
                <ChevronDown
                  size={16}
                  aria-hidden
                  className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                />
              </div>
            </label>

            {needsTicker && (
              <label className="block text-sm">
                <span className="text-muted-foreground font-medium">Ticker</span>
                <input
                  className="input mt-1 font-mono uppercase tracking-tight"
                  value={ticker}
                  onChange={(e) => setTicker(e.target.value.toUpperCase())}
                />
              </label>
            )}

            <label className="block text-sm">
              <span className="text-muted-foreground font-medium">Nombre</span>
              <input
                className="input mt-1"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm">
                <span className="text-muted-foreground font-medium">Cantidad</span>
                <input
                  className="input mt-1 tabular-nums"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                />
              </label>
              <label className="block text-sm">
                <span className="text-muted-foreground font-medium">Precio compra</span>
                <input
                  className="input mt-1 tabular-nums"
                  value={purchasePrice}
                  onChange={(e) => setPurchasePrice(e.target.value)}
                />
              </label>
            </div>

            <label className="block text-sm">
              <span className="text-muted-foreground font-medium">Moneda compra</span>
              <div className="relative mt-1">
                <select
                  className="input pr-9 appearance-none"
                  value={purchaseCurrency}
                  onChange={(e) => setPurchaseCurrency(e.target.value)}
                >
                  <option value="USD">USD</option>
                  <option value="ARS">ARS</option>
                </select>
                <ChevronDown
                  size={16}
                  aria-hidden
                  className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                />
              </div>
            </label>

            <label className="block text-sm">
              <span className="text-muted-foreground font-medium">Fecha compra</span>
              <input
                type="date"
                className="input mt-1"
                value={purchaseDate}
                onChange={(e) => setPurchaseDate(e.target.value)}
                required
              />
            </label>

            {(type === 'plazo_fijo' || type === 'caucion' || type === 'bond') && (
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-sm">
                  <span className="text-muted-foreground font-medium">Vencimiento</span>
                  <input
                    type="date"
                    className="input mt-1"
                    value={maturityDate}
                    onChange={(e) => setMaturityDate(e.target.value)}
                  />
                </label>
                <label className="block text-sm">
                  <span className="text-muted-foreground font-medium">TNA %</span>
                  <input
                    className="input mt-1 tabular-nums"
                    value={interestRate}
                    onChange={(e) => setInterestRate(e.target.value)}
                  />
                </label>
              </div>
            )}

            {error && (
              <p className="text-sm text-red-500 dark:text-red-400 inline-flex items-center gap-1.5">
                <TriangleAlert size={14} aria-hidden />
                {error}
              </p>
            )}

            <div className="flex gap-2 pt-2">
              <button type="submit" disabled={submitting} className="btn btn-primary flex-1 text-sm">
                {submitting ? 'Guardando…' : 'Guardar cambios'}
              </button>
              <button type="button" onClick={onClose} className="btn btn-ghost text-sm">
                Cancelar
              </button>
            </div>
          </form>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
