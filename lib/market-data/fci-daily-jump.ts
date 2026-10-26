/**
 * Per-fund-type daily_jump band from the CAFCI catalog.
 *
 * Two consecutive NAV-date confirmation would need persistence (a migration).
 * Catalog `tipo_renta` + T+0 (`dias_liquidacion === 0`) is the robust option
 * without new tables: ±8% money-market / renta fija / T+0, ±25% equity,
 * mixed, CEDEAR-like, and unknown (unknown stays wide so a missing type does
 * not permanently freeze a legitimate move).
 */

export const FCI_DAILY_JUMP_MAX_AGE_MS = 10 * 24 * 60 * 60 * 1000;
export const FCI_DAILY_JUMP_TIGHT = 0.08;
export const FCI_DAILY_JUMP_WIDE = 0.25;

const TIGHT_JUMP_TYPES = new Set(['MERCADODEDINERO', 'RENTAFIJA']);

function foldTipo(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '');
}

export function fciJumpMaxAbs(
  tipoRenta?: string | null,
  diasLiquidacion?: number | null
): number {
  if (diasLiquidacion === 0) return FCI_DAILY_JUMP_TIGHT;
  const folded = foldTipo(tipoRenta ?? '');
  if (folded && TIGHT_JUMP_TYPES.has(folded)) return FCI_DAILY_JUMP_TIGHT;
  return FCI_DAILY_JUMP_WIDE;
}
