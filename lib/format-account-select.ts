import type { AccountType } from '@/types/database';
import { getAccountDisplayName } from '@/lib/account-display-name';

/** Texto para opciones de <select> de cuentas (nombre + moneda + saldo actual). */
export function formatAccountSelectLabel(acc: {
  name: string;
  currency: string;
  balance?: number;
  type?: AccountType;
  last_4_digits?: string | null;
}): string {
  const display = getAccountDisplayName({
    name: acc.name,
    type: acc.type ?? 'other',
    last_4_digits: acc.last_4_digits ?? null,
  });
  const formatted = Number(acc.balance ?? 0).toLocaleString('es-AR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${display} (${acc.currency}) — saldo $${formatted}`;
}
