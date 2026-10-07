import { isCivilYmd, calendarDateToUtcNoonIso } from '@/lib/transaction-date';

/** Fecha solo-calendario (sin hora) → mediodía UTC; evita correr un día al mostrar en UTC−3 u otras zonas. */
function calendarDateToUtcNoon(y: number, m: number, d: number): Date | null {
  const ymd = `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  return isCivilYmd(ymd) ? new Date(calendarDateToUtcNoonIso(ymd)) : null;
}

/** Cuando día y mes son ambiguos (≤12), elegir orden (Argentina vs EE.UU.). */
export type ImportDateAmbiguousOrder = 'dmy' | 'mdy';

export interface ParseImportDateOpts {
  ambiguousOrder?: ImportDateAmbiguousOrder;
}

/**
 * Número serial de Excel (días; 1 ≈ 1900-01-01) → fecha calendario en UTC mediodía.
 * Evita que una celda numérica se interprete como milisegundos en `new Date(n)`.
 */
export function excelSerialToUtcCalendarDate(serial: number): Date | null {
  const whole = Math.floor(serial);
  if (whole < 1 || whole > 1000000) return null;
  const ms = (whole - 25569) * 86400 * 1000;
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return null;
  return calendarDateToUtcNoon(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

export function parseImportDate(
  dateStr: string | number | undefined | null,
  opts?: ParseImportDateOpts
): Date | null {
  const ambiguousOrder = opts?.ambiguousOrder ?? 'dmy';

  if (typeof dateStr === 'number' && Number.isFinite(dateStr)) {
    const n = dateStr;
    if (n > 20000 && n < 80000) {
      const fromExcel = excelSerialToUtcCalendarDate(n);
      if (fromExcel) return fromExcel;
    }
    return null;
  }

  const raw = String(dateStr ?? '').trim();
  if (!raw) return null;

  // Serial Excel como texto (p. ej. "45321")
  if (/^\d{5,6}$/.test(raw)) {
    const n = Number(raw);
    if (n > 20000 && n < 80000) {
      const fromExcel = excelSerialToUtcCalendarDate(n);
      if (fromExcel) return fromExcel;
    }
  }

  // YYYY-MM-DD sin hora (común en Excel export y CSV)
  const isoDateOnly = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoDateOnly) {
    const y = Number(isoDateOnly[1]);
    const m = Number(isoDateOnly[2]);
    const d = Number(isoDateOnly[3]);
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      return calendarDateToUtcNoon(y, m, d);
    }
  }

  // ISO con hora (T o espacio) — respetar el instante (JSON export, Airtable, etc.)
  if (/^\d{4}-\d{2}-\d{2}[T\s]\d/.test(raw)) {
    if (!isCivilYmd(raw.slice(0, 10))) return null;
    const parsed = new Date(raw);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }

  const datePart = raw.split(/\s+/)[0] ?? raw;

  // DD/MM/YYYY o MM/DD/YYYY (export es-AR suele ser 15/1/2024; EE.UU. suele ser 2/4/2025 = 4 feb)
  const slashMatch = datePart.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})$/);
  if (slashMatch) {
    const A = Number(slashMatch[1]);
    const B = Number(slashMatch[2]);
    const yearRaw = Number(slashMatch[3]);
    const year = yearRaw < 100 ? 2000 + yearRaw : yearRaw;

    let month: number;
    let day: number;
    if (A > 12) {
      day = A;
      month = B;
    } else if (B > 12) {
      month = A;
      day = B;
    } else {
      // Ambiguo (ej. 02/04/2025): DD/MM → 2 abr; MM/DD (EE.UU.) → 4 feb
      if (ambiguousOrder === 'mdy') {
        month = A;
        day = B;
      } else {
        day = A;
        month = B;
      }
    }

    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    return calendarDateToUtcNoon(year, month, day);
  }

  const fallback = new Date(raw);
  if (!Number.isNaN(fallback.getTime())) return fallback;

  return null;
}

