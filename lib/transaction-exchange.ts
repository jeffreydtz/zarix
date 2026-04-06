import type { TransactionWithCategory } from '@/lib/services/transactions';

export function normalizeCurrency(c: string | null | undefined): string {
  return (c || 'ARS').trim().toUpperCase();
}

/** Misma idea que `cotizacionesService.getExchangeRate(from, to)` pero con tasas ya cargadas (p. ej. desde `/api/cotizaciones/transactions-fx`). */
export function approximateCrossRate(
  from: string,
  to: string,
  fx: { usdToArs: number; eurArs: number }
): number | null {
  const f = normalizeCurrency(from);
  const t = normalizeCurrency(to);
  if (f === t) return 1;
  const { usdToArs, eurArs } = fx;
  if (!Number.isFinite(usdToArs) || usdToArs <= 0) return null;
  const eurUsd = Number.isFinite(eurArs) && eurArs > 0 ? eurArs / usdToArs : null;

  if (f === 'USD' && t === 'ARS') return usdToArs;
  if (f === 'ARS' && t === 'USD') return 1 / usdToArs;
  if (f === 'EUR' && t === 'ARS') return eurArs > 0 ? eurArs : null;
  if (f === 'ARS' && t === 'EUR') return eurArs > 0 ? 1 / eurArs : null;
  if (f === 'EUR' && t === 'USD') return eurUsd != null && eurUsd > 0 ? eurUsd : null;
  if (f === 'USD' && t === 'EUR') return eurUsd != null && eurUsd > 0 ? 1 / eurUsd : null;

  return null;
}

/**
 * Magnitud en moneda de la cuenta para gasto/ingreso (positiva), alineada a transferencias:
 * prioriza `amount * exchange_rate` si hay tasa; si el guardado quedó 1:1 entre monedas distintas, recalcula con `fx`.
 */
export function effectiveAmountInAccountCurrencyForMovement(
  tx: TransactionWithCategory,
  accountCurrency: string,
  fx?: { usdToArs: number; eurArs: number }
): number {
  const txCur = normalizeCurrency(tx.currency);
  const accCur = normalizeCurrency(accountCurrency);
  const amt = Math.abs(Number(tx.amount));
  const ain = Math.abs(Number(tx.amount_in_account_currency));
  const erRaw = tx.exchange_rate != null ? Number(tx.exchange_rate) : null;
  /** `exchange_rate = 1` entre monedas distintas es inválido (bug viejo); tratar como ausencia de tasa. */
  const er =
    erRaw != null && Number.isFinite(erRaw) && erRaw > 0 && !(erRaw === 1 && txCur !== accCur)
      ? erRaw
      : null;

  if (txCur === accCur) {
    return ain;
  }

  if (amt < 1e-12) return ain;

  if (er != null) {
    const fromRate = amt * er;
    if (Math.abs(ain - fromRate) <= Math.max(0.01, amt * 1e-5)) {
      return ain;
    }
    if (Math.abs(ain - amt) <= Math.max(0.01, amt * 1e-5)) {
      return fromRate;
    }
    return fromRate;
  }

  const ratio = ain / amt;
  const looksLikeOneToOne = Math.abs(ratio - 1) < 0.0001;
  const usdToArsImplausible = txCur === 'USD' && accCur === 'ARS' && ratio < 5;
  const suspicious = looksLikeOneToOne || usdToArsImplausible;

  if (fx && suspicious) {
    const r = approximateCrossRate(txCur, accCur, fx);
    if (r != null && r > 0) {
      return amt * r;
    }
  }

  return ain;
}
