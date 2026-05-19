'use client';

/**
 * Tour de primeros pasos. Se muestra una sola vez, en el primer ingreso al
 * dashboard. El "ya lo vio" se guarda en localStorage (sin tocar la DB).
 * Se puede volver a ver desde Configuración (ver ReplayTourButton).
 */

import { useCallback, useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';

export const TOUR_DONE_KEY = 'zarix-first-steps-done';

interface Step {
  selector: string;
  title: string;
  body: string;
}

const STEPS: Step[] = [
  {
    selector: '[data-tour="balance"]',
    title: 'Tu patrimonio, en tiempo real',
    body: 'Acá ves cuánta plata líquida tenés para gastar hoy, en pesos y en dólares al valor blue.',
  },
  {
    selector: '[data-tour="add"]',
    title: 'Cargá un movimiento',
    body: 'Tocá este botón para registrar un gasto o ingreso. También podés cargarlo escribiéndole al bot de Telegram.',
  },
  {
    selector: '[data-tour="nav"]',
    title: 'Explorá el resto',
    body: 'Desde acá llegás a Movimientos, Cuentas, Inversiones, Análisis y más.',
  },
];

function findVisible(selector: string): HTMLElement | null {
  const nodes = Array.from(document.querySelectorAll<HTMLElement>(selector));
  return (
    nodes.find((n) => {
      const r = n.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    }) ?? null
  );
}

export default function FirstStepsTour() {
  const pathname = usePathname();
  const [active, setActive] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);

  // Solo arranca en el dashboard y si nunca se vio.
  useEffect(() => {
    if (pathname !== '/dashboard') return;
    let done = false;
    try {
      done = localStorage.getItem(TOUR_DONE_KEY) === 'true';
    } catch {
      /* ignore */
    }
    if (!done) {
      // Pequeño delay para que el dashboard termine de montar.
      const t = setTimeout(() => setActive(true), 700);
      return () => clearTimeout(t);
    }
  }, [pathname]);

  const measure = useCallback(() => {
    const step = STEPS[stepIndex];
    if (!step) return;
    const el = findVisible(step.selector);
    if (!el) {
      setRect(null);
      return;
    }
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    setRect(el.getBoundingClientRect());
  }, [stepIndex]);

  useEffect(() => {
    if (!active) return;
    measure();
    const onChange = () => measure();
    window.addEventListener('resize', onChange);
    window.addEventListener('scroll', onChange, true);
    return () => {
      window.removeEventListener('resize', onChange);
      window.removeEventListener('scroll', onChange, true);
    };
  }, [active, measure]);

  function finish() {
    try {
      localStorage.setItem(TOUR_DONE_KEY, 'true');
    } catch {
      /* ignore */
    }
    setActive(false);
  }

  function next() {
    if (stepIndex >= STEPS.length - 1) {
      finish();
    } else {
      setStepIndex((i) => i + 1);
    }
  }

  if (!active) return null;

  const step = STEPS[stepIndex];
  const pad = 8;
  const hole = rect
    ? {
        top: Math.max(rect.top - pad, 0),
        left: Math.max(rect.left - pad, 0),
        width: rect.width + pad * 2,
        height: rect.height + pad * 2,
      }
    : null;

  // El tooltip se ubica debajo del target salvo que no haya espacio.
  const tooltipTop =
    hole && hole.top + hole.height + 180 < window.innerHeight
      ? hole.top + hole.height + 12
      : hole
      ? Math.max(hole.top - 188, 12)
      : window.innerHeight / 2 - 90;

  return (
    <div className="fixed inset-0 z-[100]" aria-modal="true" role="dialog">
      {/* Backdrop con recorte sobre el elemento destacado */}
      {hole ? (
        <div
          className="absolute rounded-xl ring-2 ring-blue-400 transition-all duration-300"
          style={{
            top: hole.top,
            left: hole.left,
            width: hole.width,
            height: hole.height,
            boxShadow: '0 0 0 9999px rgba(0,0,0,0.62)',
          }}
        />
      ) : (
        <div className="absolute inset-0 bg-black/60" />
      )}

      {/* Tooltip */}
      <div
        className="absolute left-1/2 w-[min(92vw,360px)] -translate-x-1/2 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-2xl p-5"
        style={{ top: tooltipTop }}
      >
        <p className="text-xs font-medium text-blue-500 mb-1">
          Paso {stepIndex + 1} de {STEPS.length}
        </p>
        <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">{step.title}</h3>
        <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-300">{step.body}</p>
        <div className="mt-4 flex items-center justify-between">
          <button
            type="button"
            onClick={finish}
            className="text-sm text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
          >
            Saltar
          </button>
          <button
            type="button"
            onClick={next}
            className="px-4 py-2 rounded-xl text-sm font-semibold text-white bg-blue-500 hover:bg-blue-600 transition-colors"
          >
            {stepIndex >= STEPS.length - 1 ? 'Listo' : 'Siguiente'}
          </button>
        </div>
      </div>
    </div>
  );
}
