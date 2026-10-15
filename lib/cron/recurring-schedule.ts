import { isCivilYmd } from '@/lib/transaction-date';

/** Pure scheduling helpers for CU-001 A06 (recurring movements). */

export function todayYmdAr(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

export function ymdParts(ymd: string): { y: number; m: number; d: number; dow: number } {
  const [y, m, d] = ymd.slice(0, 10).split('-').map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d, 15, 0, 0)).getUTCDay();
  return { y, m, d, dow };
}

export function lastDayOfMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function shouldExecuteToday(rule: {
  start_date?: string | null;
  end_date?: string | null;
  last_executed_date?: string | null;
  frequency?: string | null;
}): boolean {
  const todayYmd = todayYmdAr();
  const today = ymdParts(todayYmd);
  const startYmd = String(rule.start_date || '').slice(0, 10);
  if (!isCivilYmd(startYmd)) return false;
  const start = ymdParts(startYmd);

  if (todayYmd < startYmd) return false;

  if (rule.end_date) {
    const endYmd = String(rule.end_date).slice(0, 10);
    if (!isCivilYmd(endYmd) || endYmd < startYmd) return false;
    if (todayYmd > endYmd) return false;
  }

  if (rule.last_executed_date) {
    const lastYmd = String(rule.last_executed_date).slice(0, 10);
    if (!isCivilYmd(lastYmd) || lastYmd >= todayYmd) return false;
  }

  const frequency = rule.frequency;

  if (frequency === 'daily') return true;

  if (frequency === 'weekly') {
    return today.dow === start.dow;
  }

  if (frequency === 'monthly') {
    const targetDay = Math.min(start.d, lastDayOfMonth(today.y, today.m));
    return today.d === targetDay;
  }

  if (frequency === 'yearly') {
    if (today.m !== start.m) return false;
    const targetDay = Math.min(start.d, lastDayOfMonth(today.y, today.m));
    return today.d === targetDay;
  }

  return false;
}
