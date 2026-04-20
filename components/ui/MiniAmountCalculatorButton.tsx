'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { formatAmountForInput } from '@/lib/evaluate-simple-amount-expression';

type Op = '+' | '-' | '*' | '/';

function calculate(left: number, op: Op, right: number): number {
  switch (op) {
    case '+':
      return left + right;
    case '-':
      return left - right;
    case '*':
      return left * right;
    case '/':
      return right === 0 ? NaN : left / right;
    default:
      return NaN;
  }
}

/** Muestra en pantalla (hasta ~8 decimales, sin notación científica para montos normales). */
function formatDisplay(n: number): string {
  if (!Number.isFinite(n)) return 'Error';
  if (Number.isInteger(n) && Math.abs(n) < 1e12) return String(n);
  const s = n.toPrecision(12);
  return parseFloat(s).toString();
}

export interface MiniAmountCalculatorButtonProps {
  currentAmount: string;
  onApply: (value: string) => void;
  /** Etiqueta accesible / tooltip del botón */
  ariaLabel?: string;
  className?: string;
}

type CalcSnapshot = {
  display: string;
  previousValue: number | null;
  operation: Op | null;
  overwrite: boolean;
};

const INITIAL: CalcSnapshot = {
  display: '0',
  previousValue: null,
  operation: null,
  overwrite: false,
};

export default function MiniAmountCalculatorButton({
  currentAmount,
  onApply,
  ariaLabel = 'Mini calculadora de monto',
  className = '',
}: MiniAmountCalculatorButtonProps) {
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [calc, setCalc] = useState<CalcSnapshot>(INITIAL);

  const close = useCallback(() => {
    setOpen(false);
    setCalc(INITIAL);
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

  const inputDigit = (d: string) => {
    setCalc((s) => {
      if (s.display === 'Error') return { ...INITIAL, display: d };
      if (s.overwrite) return { ...s, display: d, overwrite: false };
      if (s.display === '0') return { ...s, display: d };
      return { ...s, display: s.display + d };
    });
  };

  const inputDot = () => {
    setCalc((s) => {
      if (s.display === 'Error') return { ...INITIAL, display: '0.' };
      if (s.overwrite) return { ...s, display: '0.', overwrite: false };
      if (s.display.includes('.')) return s;
      return { ...s, display: s.display + '.' };
    });
  };

  const chooseOperation = (nextOp: Op) => {
    setCalc((s) => {
      if (s.display === 'Error') return s;
      const inputValue = parseFloat(s.display);
      if (!Number.isFinite(inputValue)) return { ...s, display: 'Error' };

      let next: CalcSnapshot = { ...s };

      if (s.previousValue == null) {
        next.previousValue = inputValue;
      } else if (s.operation) {
        if (!s.overwrite) {
          const result = calculate(s.previousValue, s.operation, inputValue);
          if (!Number.isFinite(result)) {
            return { ...INITIAL, display: 'Error' };
          }
          next.display = formatDisplay(result);
          next.previousValue = result;
        }
      }

      next.operation = nextOp;
      next.overwrite = true;
      return next;
    });
  };

  const equals = () => {
    setCalc((s) => {
      if (s.display === 'Error' || s.operation == null || s.previousValue == null) return s;
      const inputValue = parseFloat(s.display);
      if (!Number.isFinite(inputValue)) return { ...s, display: 'Error' };
      const result = calculate(s.previousValue, s.operation, inputValue);
      if (!Number.isFinite(result)) return { ...INITIAL, display: 'Error' };
      return {
        display: formatDisplay(result),
        previousValue: null,
        operation: null,
        overwrite: true,
      };
    });
  };

  const clearAll = () => setCalc(INITIAL);

  const backspace = () => {
    setCalc((s) => {
      if (s.display === 'Error') return INITIAL;
      if (s.overwrite) return s;
      if (s.display.length <= 1) return { ...s, display: '0' };
      return { ...s, display: s.display.slice(0, -1) };
    });
  };

  const apply = () => {
    if (calc.display === 'Error') return;
    const n = parseFloat(calc.display);
    if (!Number.isFinite(n)) return;
    onApply(formatAmountForInput(n));
    close();
  };

  const openPanel = () => {
    setOpen(true);
    const t = currentAmount.trim().replace(',', '.');
    const parsed = parseFloat(t);
    if (t !== '' && Number.isFinite(parsed)) {
      setCalc({
        display: formatDisplay(parsed),
        previousValue: null,
        operation: null,
        overwrite: true,
      });
    } else {
      setCalc(INITIAL);
    }
  };

  const keyClass =
    'min-h-[2.5rem] rounded-lg text-sm font-semibold transition-colors active:scale-[0.98] ' +
    'border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700/90 ' +
    'text-slate-800 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-600';

  const keyOpClass =
    'min-h-[2.5rem] rounded-lg text-sm font-semibold transition-colors active:scale-[0.98] ' +
    'border border-amber-200/80 dark:border-amber-800/60 bg-amber-50 dark:bg-amber-950/40 ' +
    'text-amber-900 dark:text-amber-100 hover:bg-amber-100 dark:hover:bg-amber-900/50';

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
          className="absolute z-[80] top-full right-0 mt-1.5 w-[min(calc(100vw-1.5rem),13.5rem)] rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 shadow-lg p-2.5"
          role="dialog"
          aria-label="Calculadora de monto"
        >
          <div
            className="mb-2 px-2 py-2 rounded-lg bg-slate-900 dark:bg-slate-950 text-right text-lg font-mono tabular-nums text-emerald-400 min-h-[2.75rem] flex items-center justify-end tracking-tight overflow-x-auto"
            aria-live="polite"
          >
            {calc.display}
          </div>

          <div className="grid grid-cols-4 gap-1.5">
            <button type="button" className={keyClass} onClick={clearAll}>
              C
            </button>
            <button type="button" className={keyClass} onClick={backspace} aria-label="Borrar último dígito">
              ⌫
            </button>
            <button type="button" className={keyOpClass} onClick={() => chooseOperation('/')}>
              ÷
            </button>
            <button type="button" className={keyOpClass} onClick={() => chooseOperation('*')}>
              ×
            </button>

            <button type="button" className={keyClass} onClick={() => inputDigit('7')}>
              7
            </button>
            <button type="button" className={keyClass} onClick={() => inputDigit('8')}>
              8
            </button>
            <button type="button" className={keyClass} onClick={() => inputDigit('9')}>
              9
            </button>
            <button type="button" className={keyOpClass} onClick={() => chooseOperation('-')}>
              −
            </button>

            <button type="button" className={keyClass} onClick={() => inputDigit('4')}>
              4
            </button>
            <button type="button" className={keyClass} onClick={() => inputDigit('5')}>
              5
            </button>
            <button type="button" className={keyClass} onClick={() => inputDigit('6')}>
              6
            </button>
            <button type="button" className={keyOpClass} onClick={() => chooseOperation('+')}>
              +
            </button>

            <button type="button" className={keyClass} onClick={() => inputDigit('1')}>
              1
            </button>
            <button type="button" className={keyClass} onClick={() => inputDigit('2')}>
              2
            </button>
            <button type="button" className={keyClass} onClick={() => inputDigit('3')}>
              3
            </button>
            <button
              type="button"
              className={`${keyOpClass} row-span-2 min-h-[5.35rem] flex items-center justify-center`}
              onClick={equals}
            >
              =
            </button>

            <button type="button" className={`${keyClass} col-span-2`} onClick={() => inputDigit('0')}>
              0
            </button>
            <button type="button" className={keyClass} onClick={inputDot}>
              .
            </button>
          </div>

          <button
            type="button"
            onClick={apply}
            className="mt-2 w-full py-2 text-xs font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700"
          >
            Usar monto
          </button>
        </div>
      )}
    </div>
  );
}
