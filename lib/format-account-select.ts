/** Texto para opciones de <select> de cuentas (nombre + moneda + saldo actual). */
export function formatAccountSelectLabel(acc: {
  name: string;
  currency: string;
  balance?: number;
}): string {
  const formatted = Number(acc.balance ?? 0).toLocaleString('es-AR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${acc.name} (${acc.currency}) — saldo $${formatted}`;
}
