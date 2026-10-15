'use client';

import { useEffect, useState } from 'react';
import Amount from '@/components/ui/Amount';
import type { PresentationCurrency } from '@/lib/presentation-preferences';

interface StickyNetWorthBarProps {
  totalARSBlue: number;
  totalUSD: number;
  /** id del sentinel colocado al final del hero; la barra aparece cuando sale de vista. */
  sentinelId: string;
  baseCurrency?: PresentationCurrency;
}

/**
 * Header condensado que aparece al scrollear más allá del hero: mantiene el
 * patrimonio a la vista durante el drill-down (las sesiones ansiosas pierden
 * contexto si el total desaparece).
 */
export default function StickyNetWorthBar({
  totalARSBlue,
  totalUSD,
  sentinelId,
  baseCurrency = 'ARS',
}: StickyNetWorthBarProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const sentinel = document.getElementById(sentinelId);
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      ([entry]) => setVisible(!entry.isIntersecting),
      { rootMargin: '-8px 0px 0px 0px' }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [sentinelId]);

  if (!visible) return null;

  return (
    <div className="fixed inset-x-0 top-[calc(3.5rem+env(safe-area-inset-top,0px))] md:top-14 z-30 border-b border-border bg-background/85 backdrop-blur-md">
      <div className="mx-auto flex max-w-shell items-baseline justify-between gap-4 px-4 py-2">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Patrimonio
        </span>
        <div className="flex items-baseline gap-3">
          <Amount value={baseCurrency === 'USD' ? totalUSD : totalARSBlue} currency={baseCurrency}
            decimals={baseCurrency === 'USD' && !Number.isInteger(totalUSD) ? 2 : 0} className="text-sm font-semibold" />
          <Amount
            value={baseCurrency === 'USD' ? totalARSBlue : totalUSD}
            currency={baseCurrency === 'USD' ? 'ARS' : 'USD'}
            decimals={baseCurrency === 'ARS' && !Number.isInteger(totalUSD) ? 2 : 0}
            prefix="≈ "
            className="text-xs text-muted-foreground"
          />
        </div>
      </div>
    </div>
  );
}
