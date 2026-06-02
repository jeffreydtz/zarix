'use client';

import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useBodyScrollLock } from '@/lib/hooks/useBodyScrollLock';
import { ChevronDown, Loader2, TriangleAlert, X } from 'lucide-react';
import type { InvestmentWithPnL } from '@/lib/services/investments';

interface SellPositionDialogProps {
  investment: InvestmentWithPnL | null;
  onClose: () => void;
  onSold: () => void;
}

function todayIso(): string {
  return new Date().toISOString().split('T')[0];
}

export default function SellPositionDialog({ investment, onClose, onSold }: SellPositionDialogProps) {
  useBodyScrollLock(Boolean(investment));
  const [quantity, setQuantity] = useState('');
  const [price, setPrice] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [soldAt, setSoldAt] = useState(todayIso);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!investment) return;
    setQuantity(String(investment.quantity));
    setPrice(
      investment.current_price
        ? String(Number(investment.current_price).toFixed(4))
        : String(investment.purchase_price)
    );
    setCurrency(investment.market_price_currency || investment.purchase_currency || 'USD');
    setSoldAt(todayIso());
    setNotes('');
    setError(null);
  }, [investment]);

  const previewRealizedNative = useMemo(() => {
    if (!investment) return null;
    const qty = Number(quantity);
    const p = Number(price);
    if (!Number.isFinite(qty) || qty <= 0) return null;
    if (!Number.isFinite(p) || p <= 0) return null;
    const factor = investment.type === 'bond' ? 100 : 1;
    return ((p - Number(investment.purchase_price)) * qty) / factor;
  }, [quantity, price, investment]);

  const maxQty = investment?.quantity ?? 0;

  if (!investment) return null;

  const setMax = () => setQuantity(String(maxQty));
  const setHalf = () => setQuantity(String(maxQty / 2));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const qty = Number(quantity);
    const p = Number(price);

    if (!Number.isFinite(qty) || qty <= 0) {
      setError('Cantidad inválida.');
      return;
    }
    if (qty > maxQty + 1e-9) {
      setError(`No podés vender más de ${maxQty}.`);
      return;
    }
    if (!Number.isFinite(p) || p <= 0) {
      setError('Precio inválido.');
      return;
    }

    setSubmitting(true);
    try {
      const r = await fetch(`/api/investments/${investment.id}/sell`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quantity: qty,
          price: p,
          currency,
          soldAt,
          notes: notes.trim() || undefined,
        }),
      });
      const data = await r.json();
      if (!r.ok) {
        throw new Error(data.error || 'No se pudo registrar la venta');
      }
      onSold();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al vender');
    } finally {
      setSubmitting(false);
    }
  };

  const previewClass =
    previewRealizedNative === null
      ? 'text-muted-foreground'
      : previewRealizedNative >= 0
        ? 'text-emerald-500 dark:text-emerald-400'
        : 'text-red-500 dark:text-red-400';

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/50 backdrop-blur-sm"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sell-inv-title"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          onClick={(e) => e.stopPropagation()}
          className="zx-panel w-full max-w-md max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-card"
        >
          <div className="sticky top-0 z-10 flex items-center justify-between gap-2 px-5 py-3 border-b border-border bg-surface-elevated/95 backdrop-blur">
            <div>
              <h2 id="sell-inv-title" className="text-base font-semibold text-foreground">
                Vender {investment.ticker || investment.name}
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Disponibles: {maxQty.toLocaleString('es-AR', { maximumFractionDigits: 8 })} unidades
              </p>
            </div>
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
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="text-muted-foreground font-medium">
                  {investment.type === 'bond' ? 'Cantidad a vender (VN)' : 'Cantidad a vender'}
                </span>
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={setHalf}
                    className="text-[11px] text-primary hover:underline tabular-nums"
                  >
                    50%
                  </button>
                  <button
                    type="button"
                    onClick={setMax}
                    className="text-[11px] text-primary hover:underline tabular-nums"
                  >
                    Todo
                  </button>
                </div>
              </div>
              <input
                type="text"
                inputMode="decimal"
                className="input tabular-nums"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                placeholder="0"
                required
              />
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm">
                <span className="text-muted-foreground font-medium">
                  {investment.type === 'bond' ? 'Precio venta (por VN 100)' : 'Precio por unidad'}
                </span>
                <input
                  type="text"
                  inputMode="decimal"
                  className="input mt-1 tabular-nums"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  required
                />
                <span className="block text-[11px] text-muted-foreground mt-1">
                  Precio promedio: {Number(investment.purchase_price).toLocaleString('en-US', { maximumFractionDigits: 4 })}
                  {investment.type === 'bond' ? ' / VN 100' : ''}
                </span>
              </label>

              <label className="block text-sm">
                <span className="text-muted-foreground font-medium">Moneda</span>
                <div className="relative mt-1">
                  <select
                    className="input pr-9 appearance-none"
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value)}
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
            </div>

            <label className="block text-sm">
              <span className="text-muted-foreground font-medium">Fecha de venta</span>
              <input
                type="date"
                className="input mt-1"
                value={soldAt}
                onChange={(e) => setSoldAt(e.target.value)}
                required
              />
            </label>

            <label className="block text-sm">
              <span className="text-muted-foreground font-medium">Notas (opcional)</span>
              <input
                type="text"
                className="input mt-1"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Ej. cierre parcial pre rebalanceo"
              />
            </label>

            <div className="zx-kpi">
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
                Ganancia realizada (preview)
              </div>
              <div className={`mt-1 text-lg font-semibold tabular-nums ${previewClass}`}>
                {previewRealizedNative === null
                  ? '—'
                  : `${previewRealizedNative >= 0 ? '+' : ''}${currency} ${Math.abs(previewRealizedNative).toLocaleString('en-US', { maximumFractionDigits: 2, minimumFractionDigits: 2 })}`}
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">
                Se convierte a USD con el dólar blue del día al guardar.
              </p>
            </div>

            {error && (
              <p className="text-sm text-red-500 dark:text-red-400 inline-flex items-center gap-1.5">
                <TriangleAlert size={14} aria-hidden />
                {error}
              </p>
            )}

            <div className="flex gap-2 pt-1">
              <button type="submit" disabled={submitting} className="btn btn-primary flex-1 text-sm inline-flex items-center justify-center gap-1.5">
                {submitting && <Loader2 size={14} aria-hidden className="animate-spin" />}
                {submitting ? 'Registrando…' : 'Confirmar venta'}
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
