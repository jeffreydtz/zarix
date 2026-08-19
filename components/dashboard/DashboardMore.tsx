'use client';

import { useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';

/** En mobile pliega el bloque inferior del dashboard; en desktop siempre visible. */
export default function DashboardMore({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <div className="lg:hidden">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center justify-between rounded-2xl border border-border bg-card px-4 py-3 text-sm font-medium text-foreground"
        >
          Cuentas, tarjetas y movimientos
          <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
      </div>
      <div
        className={`col-span-1 space-y-4 lg:col-span-12 lg:grid lg:grid-cols-12 lg:gap-4 ${
          open ? '' : 'max-lg:hidden'
        }`}
      >
        {children}
      </div>
    </>
  );
}
