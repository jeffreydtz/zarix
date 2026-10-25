/**
 * Fechas de movimientos: el usuario elige un día calendario (YYYY-MM-DD).
 * Guardamos ese día como instante a mediodía UTC para que al listar en cualquier
 * zona horaria no se muestre el día anterior (bug típico con `...T00:00:00.000Z`).
 */

export const APP_CIVIL_TIMEZONE = 'America/Argentina/Cordoba';

const CIVIL_YMD = /^(\d{4})-(\d{2})-(\d{2})$/;

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

export function isCivilYmd(value: string | undefined | null): value is string {
  if (!value) return false;
  const m = value.match(CIVIL_YMD);
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (y < 1 || mo < 1 || mo > 12 || d < 1 || d > 31) return false;
  // Date.UTC silently normalizes February 31 and interprets years 0–99 as
  // 1900–1999. Set the full year explicitly and compare the civil components.
  const date = new Date(0);
  date.setUTCFullYear(y, mo - 1, d);
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d;
}

/** Día civil del `Date` en la zona local del runtime (navegador o server). */
export function dateToLocalYmd(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

export function todayLocalYmd(): string {
  return dateToLocalYmd(new Date());
}

/** Día civil de hoy en la zona de la app (Argentina), independiente del TZ del server. */
export function civilTodayYmd(timeZone: string = APP_CIVIL_TIMEZONE, now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

export function addDaysYmd(ymd: string, days: number): string {
  const m = ymd.trim().match(CIVIL_YMD);
  if (!m) return ymd;
  const dt = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + days));
  return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`;
}

export function addMonthsYmd(ymd: string, months: number): string {
  const m = ymd.trim().match(CIVIL_YMD);
  if (!m) return ymd;
  const day = Number(m[3]);
  const target = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1 + months, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  return `${target.getUTCFullYear()}-${pad2(target.getUTCMonth() + 1)}-${pad2(Math.min(day, last))}`;
}

export function startOfMonthYmd(ymd: string): string {
  return isCivilYmd(ymd) ? `${ymd.slice(0, 7)}-01` : ymd;
}

export function endOfMonthYmd(ymd: string): string {
  const m = ymd.trim().match(CIVIL_YMD);
  if (!m) return ymd;
  const last = new Date(Date.UTC(Number(m[1]), Number(m[2]), 0)).getUTCDate();
  return `${m[1]}-${m[2]}-${pad2(last)}`;
}

export function startOfYearYmd(ymd: string): string {
  return isCivilYmd(ymd) ? `${ymd.slice(0, 4)}-01-01` : ymd;
}

export function ymdToQueryStartIso(ymd: string, timeZone: string = APP_CIVIL_TIMEZONE): string {
  const civil = ymd.trim();
  if (!isCivilYmd(civil)) return `${civil}T00:00:00.000Z`;
  // Córdoba/Buenos Aires are UTC−03 year-round; keep the named zone in the API.
  void timeZone;
  return new Date(`${civil}T00:00:00.000-03:00`).toISOString();
}

export function ymdToQueryEndIso(ymd: string, timeZone: string = APP_CIVIL_TIMEZONE): string {
  const civil = ymd.trim();
  if (!isCivilYmd(civil)) return `${civil}T23:59:59.999Z`;
  void timeZone;
  return new Date(`${civil}T23:59:59.999-03:00`).toISOString();
}

/** Día civil del instante en la zona de la app (Córdoba), no el prefijo UTC. */
export function transactionCivilYmd(iso: string, timeZone: string = APP_CIVIL_TIMEZONE): string {
  const raw = String(iso).trim();
  if (isCivilYmd(raw)) return raw;
  const fallback = String(iso).trim();
  const parsed = new Date(fallback);
  if (Number.isNaN(parsed.getTime())) return fallback.slice(0, 10);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(parsed);
}

export function daysInclusive(startYmd: string, endYmd: string): number {
  const start = startYmd.trim().match(CIVIL_YMD);
  const end = endYmd.trim().match(CIVIL_YMD);
  if (!start || !end) return 0;
  const a = Date.UTC(Number(start[1]), Number(start[2]) - 1, Number(start[3]));
  const b = Date.UTC(Number(end[1]), Number(end[2]) - 1, Number(end[3]));
  return Math.floor((b - a) / 86400000) + 1;
}

export function eachYmdInclusive(startYmd: string, endYmd: string): string[] {
  if (!isCivilYmd(startYmd) || !isCivilYmd(endYmd) || startYmd > endYmd) return [];
  const out: string[] = [];
  let cur = startYmd;
  while (cur <= endYmd) {
    out.push(cur);
    cur = addDaysYmd(cur, 1);
  }
  return out;
}

export function monthKeysInclusive(startYmd: string, endYmd: string): string[] {
  if (!isCivilYmd(startYmd) || !isCivilYmd(endYmd) || startYmd > endYmd) return [];
  const keys: string[] = [];
  let y = Number(startYmd.slice(0, 4));
  let m = Number(startYmd.slice(5, 7));
  const ey = Number(endYmd.slice(0, 4));
  const em = Number(endYmd.slice(5, 7));
  while (y < ey || (y === ey && m <= em)) {
    keys.push(`${y}-${pad2(m)}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return keys;
}

/** `YYYY-MM-DD` (input date) → ISO al mediodía UTC de ese día civil. */
export function calendarDateToUtcNoonIso(ymd: string): string {
  const civil = ymd.trim();
  if (!isCivilYmd(civil)) throw new RangeError('Fecha calendario inválida');
  const m = civil.match(CIVIL_YMD)!;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const date = new Date(0);
  date.setUTCFullYear(y, mo - 1, d);
  date.setUTCHours(12, 0, 0, 0);
  return date.toISOString();
}

/** ISO guardado → valor para `<input type="date">` según calendario local del usuario. */
export function isoToLocalDateInputValue(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return todayLocalYmd();
  return dateToLocalYmd(d);
}

/**
 * Fecha devuelta por el bot (IA) o por parseo de ticket: `YYYY-MM-DD`, ISO completo, etc.
 * Si no es válida, `undefined` → el caller usa la hora actual.
 */
export function parseBotTransactionDateInput(raw: unknown): string | undefined {
  if (raw === null || raw === undefined) return undefined;
  const s = typeof raw === 'string' ? raw.trim() : '';
  if (!s) return undefined;

  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    return isCivilYmd(s) ? calendarDateToUtcNoonIso(s) : undefined;
  }

  const civilPrefix = s.match(/^(\d{4}-\d{2}-\d{2})[T\s]/);
  if (civilPrefix && !isCivilYmd(civilPrefix[1])) return undefined;

  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) {
    return d.toISOString();
  }
  return undefined;
}
