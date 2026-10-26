/**
 * FCI automatic updates require a real source NAV date, not fetch time.
 * Age is measured in Argentina weekdays (Sat/Sun skipped); holidays are
 * treated as weekdays so a long weekend still fits inside the max age.
 */

import { addDaysYmd, civilTodayYmd, isCivilYmd } from '@/lib/transaction-date';

export const AR_MARKET_TZ = 'America/Argentina/Buenos_Aires';

/** Skip a NAV whose Argentina civil date is more than this many weekdays old. */
export const FCI_NAV_MAX_BUSINESS_DAYS = 5;

export type FciNavFreshnessReason =
  | 'undated'
  | 'invalid_date'
  | 'future_nav'
  | 'stale_nav';

export type FciNavFreshness =
  | { ok: true; ymd: string; ageBusinessDays: number }
  | { ok: false; reason: FciNavFreshnessReason; ymd: string | null; ageBusinessDays: number | null };

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** Sunday = 0 … Saturday = 6 for a YYYY-MM-DD civil date. */
export function civilWeekday(ymd: string): number {
  const m = ymd.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return -1;
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))).getUTCDay();
}

export function isWeekendYmd(ymd: string): boolean {
  const day = civilWeekday(ymd);
  return day === 0 || day === 6;
}

/** Move `ymd` by `delta` weekdays (negative = back). */
export function shiftBusinessDays(ymd: string, delta: number): string {
  if (!delta) return ymd;
  const step = delta > 0 ? 1 : -1;
  let left = Math.abs(delta);
  let cur = ymd;
  while (left > 0) {
    cur = addDaysYmd(cur, step);
    if (!isWeekendYmd(cur)) left -= 1;
  }
  return cur;
}

/** Weekdays strictly after `fromYmd` up to and including `toYmd`. */
export function businessDaysBetween(fromYmd: string, toYmd: string): number {
  if (fromYmd === toYmd) return 0;
  if (fromYmd > toYmd) return -businessDaysBetween(toYmd, fromYmd);
  let days = 0;
  let cur = fromYmd;
  while (cur < toYmd) {
    cur = addDaysYmd(cur, 1);
    if (!isWeekendYmd(cur)) days += 1;
  }
  return days;
}

export function civilYmdToNavIso(ymd: string): string | null {
  if (!isCivilYmd(ymd)) return null;
  const ms = Date.parse(`${ymd}T00:00:00-03:00`);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

/** Argentina civil YYYY-MM-DD for an observation timestamp. */
export function navTimestampToCivilYmd(timestamp: string): string | null {
  const ms = Date.parse(timestamp);
  if (!Number.isFinite(ms)) return null;
  return civilTodayYmd(AR_MARKET_TZ, new Date(ms));
}

export function evaluateFciNavFreshness(
  timestamp: string | null | undefined,
  opts?: { now?: Date; maxBusinessDays?: number }
): FciNavFreshness {
  if (timestamp == null || String(timestamp).trim() === '') {
    return { ok: false, reason: 'undated', ymd: null, ageBusinessDays: null };
  }
  const ymd = navTimestampToCivilYmd(String(timestamp));
  if (!ymd || !isCivilYmd(ymd)) {
    return { ok: false, reason: 'invalid_date', ymd: null, ageBusinessDays: null };
  }
  const today = civilTodayYmd(AR_MARKET_TZ, opts?.now ?? new Date());
  if (ymd > today) {
    return { ok: false, reason: 'future_nav', ymd, ageBusinessDays: null };
  }
  const ageBusinessDays = businessDaysBetween(ymd, today);
  const maxBusinessDays = opts?.maxBusinessDays ?? FCI_NAV_MAX_BUSINESS_DAYS;
  if (ageBusinessDays > maxBusinessDays) {
    return { ok: false, reason: 'stale_nav', ymd, ageBusinessDays };
  }
  return { ok: true, ymd, ageBusinessDays };
}

/** Previous weekday's 00:00 Argentina, as ISO. Used by tests as a still-fresh NAV. */
export function freshFciNavIso(now: Date = new Date()): string {
  const today = civilTodayYmd(AR_MARKET_TZ, now);
  const ymd = shiftBusinessDays(today, -1);
  return civilYmdToNavIso(ymd) ?? `${ymd}T03:00:00.000Z`;
}

/** `23/10/2026` label for the previous weekday. */
export function cafciValoresAlLabel(now: Date = new Date()): string {
  const today = civilTodayYmd(AR_MARKET_TZ, now);
  const ymd = shiftBusinessDays(today, -1);
  const [year, month, day] = ymd.split('-');
  return `${Number(day)}/${month}/${year}`;
}

export function civilYmdToDmyLabel(ymd: string): string {
  const [year, month, day] = ymd.split('-');
  return `${Number(day)}/${month}/${year}`;
}

export function padCivilPart(n: number): string {
  return pad2(n);
}
