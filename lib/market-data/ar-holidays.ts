/**
 * Argentine public holidays (Ley 27.399) plus BCRA Jueves Santo.
 * Used so FCI NAV age counts banking days, not weekdays that markets were closed.
 */

import { addDaysYmd, isCivilYmd } from '@/lib/transaction-date';

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** Anonymous Gregorian computus → YYYY-MM-DD of Easter Sunday. */
export function easterSundayYmd(year: number): string {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

function ymd(year: number, month: number, day: number): string {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

function weekdayUtc(dateYmd: string): number {
  const m = dateYmd.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return -1;
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))).getUTCDay();
}

/**
 * Ley 27.399 art. 2: Tuesday/Wednesday → previous Monday;
 * Thursday/Friday → following Monday. Monday/weekend stay put.
 */
export function transferLey27399Holiday(dateYmd: string): string {
  const day = weekdayUtc(dateYmd);
  if (day === 2 || day === 3) return addDaysYmd(dateYmd, 1 - day);
  if (day === 4 || day === 5) return addDaysYmd(dateYmd, 8 - day);
  return dateYmd;
}

/** Inamovible + Carnaval + Viernes Santo + transferred tourist holidays. */
export function argentinePublicHolidayYmds(year: number): Set<string> {
  const easter = easterSundayYmd(year);
  const holidays = new Set<string>([
    ymd(year, 1, 1),
    addDaysYmd(easter, -48),
    addDaysYmd(easter, -47),
    ymd(year, 3, 24),
    ymd(year, 4, 2),
    addDaysYmd(easter, -2),
    ymd(year, 5, 1),
    ymd(year, 5, 25),
    ymd(year, 6, 20),
    ymd(year, 7, 9),
    ymd(year, 12, 8),
    ymd(year, 12, 25),
    transferLey27399Holiday(ymd(year, 6, 17)),
    transferLey27399Holiday(ymd(year, 8, 17)),
    transferLey27399Holiday(ymd(year, 10, 12)),
    transferLey27399Holiday(ymd(year, 11, 20)),
  ]);
  return holidays;
}

const holidayCache = new Map<number, Set<string>>();

function holidaysForYear(year: number): Set<string> {
  let set = holidayCache.get(year);
  if (!set) {
    set = argentinePublicHolidayYmds(year);
    holidayCache.set(year, set);
  }
  return set;
}

/** National holiday, including transferred tourist dates. */
export function isArgentinePublicHoliday(dateYmd: string): boolean {
  if (!isCivilYmd(dateYmd)) return false;
  const year = Number(dateYmd.slice(0, 4));
  return holidaysForYear(year).has(dateYmd);
}

/** BCRA / mercado: public holidays plus Jueves Santo. */
export function isArgentineMarketHoliday(dateYmd: string): boolean {
  if (!isCivilYmd(dateYmd)) return false;
  if (isArgentinePublicHoliday(dateYmd)) return true;
  const year = Number(dateYmd.slice(0, 4));
  return addDaysYmd(easterSundayYmd(year), -3) === dateYmd;
}
