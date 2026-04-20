'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import {
  evaluateSimpleAmountExpression,
  formatAmountForInput,
} from '@/lib/evaluate-simple-amount-expression';

export interface MiniAmountCalculatorButtonProps {
  currentAmount: string;
  onApply: (value: string) => void;
  /** Etiqueta accesible / tooltip del botón */
  ariaLabel?: string;
  className?: string;
}

export default function MiniAmountCalculatorButton({
  currentAmount,
  onApply,
  ariaLabel = 'Mini calculadora de monto',
  className = '',
}: MiniAmountCalculatorButtonProps) {
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [expr, setExpr] = useState('');
  const [preview, setPreview] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const close = useCallback(() => {
    setOpen(false);
    setExpr('');
    setPreview(null);
    setError(null);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDocMouseDown = (e: MouseEvent) => {
      const el = rootRef.current;
      if (el && !el.contains(e.target as Node)) close();
    };
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, [open, close]);

  const runCalculate = () => {
    const n = evaluateSimpleAmountExpression(expr);
    if (n === null) {
      setPreview(null);
      setError('No se pudo calcular. Usá números y + − * / ( ).');
      return;
    }
    setPreview(n);
    setError(null);
  };

  const apply = () => {
    const n = preview ?? evaluateSimpleAmountExpression(expr);
    if (n === null) {
      setError('Calculá primero o corregí la expresión.');
      return;
    }
    onApply(formatAmountForInput(n));
    close();
  };

  const openPanel = () => {
    setOpen(true);
    setError(null);
    setPreview(null);
    const t = currentAmount.trim().replace(',', '.');
    const seed = t && Number.isFinite(parseFloat(t)) ? currentAmount.trim() : '';
    setExpr(seed);
  };

  return (
    <div ref={rootRef} className={`relative inline-flex ${className}`.trim()}>
      <button
        type="button"
        onClick={() => (open ? close() : openPanel())}
        className="shrink-0 flex items-center justify-center w-10 h-10 rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700/80 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-600 transition-colors"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        title={ariaLabel}
        aria-label={ariaLabel}
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
          <rect x="4" y="3" width="16" height="18" rx="2" />
          <path strokeLinecap="round" d="M8 7h8M8 11h2M12 11h2M16 11h2M8 15h2M12 15h2M16 15h2" />
        </svg>
      </button>

      {open && (
        <div
          id={panelId}
          className="absolute z-[80] top-full right-0 mt-1.5 w-[min(calc(100vw-2rem),16rem)] rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 shadow-lg p-3 space-y-2"
          role="dialog"
          aria-label="Calculadora de monto"
        >
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">
            Expresión
            <input
              type="text"
              inputMode="decimal"
              value={expr}
              onChange={(e) => {
                setExpr(e.target.value);
                setPreview(null);
                setError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  runCalculate();
                }
              }}
              placeholder="Ej: 1200+350 o (100+50)*1.21"
              className="mt-1 w-full px-2.5 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100"
              autoFocus
            />
          </label>
          {preview !== null && !error && (
            <p className="text-xs text-slate-600 dark:text-slate-400">
              Resultado:{' '}
              <span className="font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                {formatAmountForInput(preview)}
              </span>
            </p>
          )}
          {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={runCalculate}
              className="flex-1 py-2 text-xs font-medium rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-800 dark:text-slate-100 hover:bg-slate-200 dark:hover:bg-slate-600"
            >
              Calcular
            </button>
            <button
              type="button"
              onClick={apply}
              className="flex-1 py-2 text-xs font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700"
            >
              Usar monto
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
