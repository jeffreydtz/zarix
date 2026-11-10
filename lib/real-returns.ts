/**
 * Rendimiento real y comparaciones de patrimonio/inversiones.
 *
 * No recomienda instrumentos ni rebalanceo. Si falta una serie o una tasa
 * con fuente, el comparador queda `unavailable` — nunca se inventa.
 */

export const REAL_RETURN_PERIODS = [
  { id: 'month', label: 'Mes', days: 30 },
  { id: 'quarter', label: 'Trimestre', days: 90 },
  { id: 'year', label: 'Año', days: 365 },
  { id: 'since_start', label: 'Desde el inicio', days: null },
] as const;

export type RealReturnPeriodId = (typeof REAL_RETURN_PERIODS)[number]['id'];

export interface DatedValue {
  dateISO: string;
  value: number;
}

export interface DataPoint {
  /** Fuente humana, p.ej. "INDEC vía argentinadatos.com". */
  source: string;
  /** ISO-8601 del dato (no del fetch). */
  asOf: string | null;
  value: number | null;
  unit?: string;
  note?: string;
}

export type ComparisonStatus = 'available' | 'unavailable';

export interface Comparison {
  id: string;
  label: string;
  status: ComparisonStatus;
  /** Variación porcentual del período. */
  pct: number | null;
  source: string;
  asOf: string | null;
  reason?: string;
}

export function pctChange(start: number, end: number): number | null {
  if (![start, end].every(Number.isFinite) || start === 0) return null;
  const pct = ((end - start) / Math.abs(start)) * 100;
  return Number.isFinite(pct) ? pct : null;
}

/** (1 + r_nom) / (1 + i) - 1, con r e i en %. */
export function realReturnPct(nominalPct: number, inflationPct: number): number | null {
  if (![nominalPct, inflationPct].every(Number.isFinite)) return null;
  const real = ((1 + nominalPct / 100) / (1 + inflationPct / 100) - 1) * 100;
  return Number.isFinite(real) ? real : null;
}

/** TNA simple argentina: TNA% * días / 365. No capitaliza ni inventa TEA. */
export function simpleTnaPeriodPct(tnaPct: number, days: number): number | null {
  if (!Number.isFinite(tnaPct) || !Number.isFinite(days) || days <= 0) return null;
  const pct = (tnaPct * days) / 365;
  return Number.isFinite(pct) ? pct : null;
}

export function pickOnOrBefore<T extends { dateISO: string }>(
  rows: readonly T[],
  targetISO: string
): T | null {
  let best: T | null = null;
  for (const row of rows) {
    if (row.dateISO > targetISO) continue;
    if (!best || row.dateISO > best.dateISO) best = row;
  }
  return best;
}

export function periodWindow(
  period: RealReturnPeriodId,
  todayISO: string,
  firstSnapshotISO: string | null
): { startISO: string; endISO: string; days: number } | null {
  const endISO = todayISO;
  if (period === 'since_start') {
    if (!firstSnapshotISO) return null;
    const days = daysBetween(firstSnapshotISO, endISO);
    if (days <= 0) return null;
    return { startISO: firstSnapshotISO, endISO, days };
  }
  const spec = REAL_RETURN_PERIODS.find((p) => p.id === period);
  if (!spec || spec.days == null) return null;
  const startISO = addDaysIso(endISO, -spec.days);
  return { startISO, endISO, days: spec.days };
}

export function daysBetween(startISO: string, endISO: string): number {
  const a = Date.parse(`${startISO.slice(0, 10)}T12:00:00Z`);
  const b = Date.parse(`${endISO.slice(0, 10)}T12:00:00Z`);
  if (![a, b].every(Number.isFinite)) return 0;
  return Math.round((b - a) / 86400000);
}

function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Inflación acumulada entre dos fechas: producto de (1+i/100) de los meses
 * estrictamente posteriores al mes de inicio y hasta el mes de fin inclusive.
 * Serie vacía o sin meses de IPC en el período → null (no se degrada a 0%).
 */
export function inflationPctBetween(
  series: ReadonlyArray<{ fecha: string; valor: number }>,
  startISO: string,
  endISO: string
): number | null {
  if (series.length === 0) return null;
  const startMonth = startISO.slice(0, 7);
  const endMonth = endISO.slice(0, 7);
  let factor = 1;
  let used = 0;
  for (const row of series) {
    const month = row.fecha.slice(0, 7);
    if (month > startMonth && month <= endMonth) {
      if (!Number.isFinite(row.valor)) return null;
      factor *= 1 + row.valor / 100;
      used += 1;
    }
  }
  if (used === 0) return null;
  return (factor - 1) * 100;
}

export interface RealReturnsSubject {
  id: 'liquid' | 'investments';
  label: string;
  startValue: number | null;
  endValue: number | null;
  currency: 'ARS' | 'USD';
  nominalPct: number | null;
  realVsInflationPct: number | null;
  vsMepPct: number | null;
  vsCclPct: number | null;
  startDate: string | null;
  endDate: string | null;
}

export interface RealReturnsPeriodReport {
  period: RealReturnPeriodId;
  label: string;
  startISO: string;
  endISO: string;
  days: number;
  liquid: RealReturnsSubject;
  investments: RealReturnsSubject;
  inflation: Comparison;
  mep: Comparison;
  ccl: Comparison;
  plazoFijo: Comparison;
  caucion: Comparison;
  fciMm: Comparison;
}

export interface RealReturnsReport {
  todayISO: string;
  disclaimer: string;
  inflationSource: { source: string; lastFecha: string | null };
  quotes: {
    mep: { rate: number | null; source: string | null; asOf: string | null };
    ccl: { rate: number | null; source: string | null; asOf: string | null };
  };
  periods: RealReturnsPeriodReport[];
}

export function unavailable(
  id: string,
  label: string,
  reason: string,
  source = 'no disponible'
): Comparison {
  return {
    id,
    label,
    status: 'unavailable',
    pct: null,
    source,
    asOf: null,
    reason,
  };
}
