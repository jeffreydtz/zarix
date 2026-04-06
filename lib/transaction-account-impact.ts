import type { TransactionWithCategory } from '@/lib/services/transactions';
import { effectiveAmountInAccountCurrencyForMovement } from '@/lib/transaction-exchange';

/** Tasas actuales (USD/EUR → ARS) para corregir conversiones 1:1 guardadas mal. */
export type FxHints = { usdToArs: number; eurArs: number };

export type ImpactOptions = {
  accountCurrency?: string;
  fx?: FxHints;
};

/**
 * Impacto de un movimiento sobre el saldo de una cuenta, en la **moneda de esa cuenta**.
 * Gastos/ingresos: usa la misma lógica que al crear movimientos y transferencias (`amount * cotización`);
 * si `fx` está presente, corrige filas con `amount_in_account_currency` ≈ monto en moneda extranjera.
 */
export function impactInAccountCurrency(
  tx: TransactionWithCategory,
  accountId: string,
  options?: ImpactOptions
): number {
  const ain = Number(tx.amount_in_account_currency);
  const amt = Number(tx.amount);
  const er = Number(tx.exchange_rate ?? 1);

  if (tx.account_id === accountId) {
    if (tx.type === 'transfer') return -Math.abs(ain);
    if (tx.type === 'adjustment') return ain;
    const accCur = options?.accountCurrency ?? tx.account?.currency ?? 'ARS';
    if (tx.type === 'expense') {
      const eff = effectiveAmountInAccountCurrencyForMovement(tx, accCur, options?.fx);
      return -Math.abs(eff);
    }
    if (tx.type === 'income') {
      const eff = effectiveAmountInAccountCurrencyForMovement(tx, accCur, options?.fx);
      return Math.abs(eff);
    }
  }
  if (tx.type === 'transfer' && tx.destination_account_id === accountId) {
    return Math.abs(amt * er);
  }
  return 0;
}

/**
 * Agrupa el monto **original del comprobante** por moneda (para desglose ARS / USD / …).
 * Los signos reflejan entrada/salida en esa moneda.
 */
export function aggregateOriginalByCurrency(
  txs: TransactionWithCategory[],
  accountId: string
): Record<string, number> {
  const out: Record<string, number> = {};
  const amt = (tx: TransactionWithCategory) => Number(tx.amount);
  const er = (tx: TransactionWithCategory) => Number(tx.exchange_rate ?? 1);

  for (const tx of txs) {
    if (tx.account_id === accountId) {
      const cur = (tx.currency || 'ARS').trim().toUpperCase();
      if (!out[cur]) out[cur] = 0;
      if (tx.type === 'expense') out[cur] -= Math.abs(amt(tx));
      else if (tx.type === 'income') out[cur] += Math.abs(amt(tx));
      else if (tx.type === 'transfer') out[cur] -= Math.abs(amt(tx));
      else if (tx.type === 'adjustment') out[cur] += Number(tx.amount_in_account_currency);
    } else if (tx.type === 'transfer' && tx.destination_account_id === accountId) {
      const cur = (
        tx.destination_account?.currency ||
        tx.currency ||
        'ARS'
      )
        .trim()
        .toUpperCase();
      if (!out[cur]) out[cur] = 0;
      out[cur] += Math.abs(amt(tx) * er(tx));
    }
  }
  return out;
}

export function sumImpactInAccountCurrency(
  txs: TransactionWithCategory[],
  accountId: string,
  options?: ImpactOptions
): number {
  return txs.reduce((s, tx) => s + impactInAccountCurrency(tx, accountId, options), 0);
}
