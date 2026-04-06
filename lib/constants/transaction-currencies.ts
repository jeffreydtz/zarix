/** Monedas permitidas al registrar o editar el monto de un movimiento (no incluye otras cotizaciones). */
export const TRANSACTION_CURRENCIES = ['ARS', 'USD', 'EUR'] as const;

export type TransactionCurrency = (typeof TRANSACTION_CURRENCIES)[number];

const SET = new Set<string>(TRANSACTION_CURRENCIES);

export function isTransactionCurrency(c: string | null | undefined): c is TransactionCurrency {
  return SET.has((c ?? '').trim().toUpperCase());
}

/** Si la moneda no es una de las permitidas, usar ARS (p. ej. datos históricos con otra moneda). */
export function coerceTransactionCurrency(c: string | null | undefined): TransactionCurrency {
  const u = (c ?? 'ARS').trim().toUpperCase();
  return isTransactionCurrency(u) ? u : 'ARS';
}
