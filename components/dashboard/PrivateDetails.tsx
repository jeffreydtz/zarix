'use client';

import type { ReactNode } from 'react';
import { usePrivacy } from '@/lib/hooks/use-privacy';

/** Los informes detallados pueden incluir montos en texto, gráficos y diálogos. */
export default function PrivateDetails({ children, label }: { children: ReactNode; label: string }) {
  const { hidden, toggle } = usePrivacy();
  if (!hidden) return <>{children}</>;
  return (
    <div className="card space-y-2">
      <h3 className="font-semibold text-foreground">{label}</h3>
      <p className="text-sm text-muted-foreground">Los detalles están ocultos por tu modo privado.</p>
      <button type="button" onClick={toggle} className="btn btn-ghost min-h-11 text-primary">
        Mostrar montos
      </button>
    </div>
  );
}
