'use client';

import { usePrivacy, PRIVACY_MASK } from '@/lib/hooks/use-privacy';

interface AmountProps {
  value: number;
  currency?: 'ARS' | 'USD' | 'EUR';
  /** Decimales a mostrar (default 0: montos grandes del dashboard). */
  decimals?: number;
  /** Prefijo visual, ej. "≈ ". */
  prefix?: string;
  className?: string;
  /** Si true ignora el modo privado (ej. porcentajes o montos ya públicos). */
  ignorePrivacy?: boolean;
}

/**
 * Único punto de render de montos del dashboard: formato es-AR, números
 * tabulares (no "saltan" al refrescar) y máscara de modo privado.
 */
export default function Amount({
  value,
  currency = 'ARS',
  decimals = 0,
  prefix = '',
  className = '',
  ignorePrivacy = false,
}: AmountProps) {
  const { hidden } = usePrivacy();

  const symbol = currency === 'USD' ? 'US$' : currency === 'EUR' ? '€' : '$';
  const formatted = value.toLocaleString('es-AR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

  return (
    <data
      value={hidden && !ignorePrivacy ? '' : value}
      className={`tabular-nums ${className}`}
    >
      {prefix}
      {symbol} {hidden && !ignorePrivacy ? PRIVACY_MASK : formatted}
    </data>
  );
}
