/**
 * Horarios alineados con Vercel crons:
 * - Semanal: lunes 09:00 UTC → /api/cron/weekly-summary
 * - Mensual: día 1 09:00 UTC → /api/cron/monthly-summary
 */
export const CRON_WEEKLY_HOUR_UTC = 9;
export const CRON_MONTHLY_HOUR_UTC = 9;
export const CRON_MONTHLY_DAY = 1;

/** Próximo envío semanal (lunes 09:00 UTC). */
export function getNextWeeklySendUtc(now: Date = new Date()): Date {
  const h = CRON_WEEKLY_HOUR_UTC;
  const m = 0;
  const dow = now.getUTCDay();
  const minsNow = now.getUTCHours() * 60 + now.getUTCMinutes();
  const minsTarget = h * 60 + m;
  let addDays: number;
  if (dow === 0) {
    addDays = 1;
  } else if (dow === 1) {
    addDays = minsNow < minsTarget ? 0 : 7;
  } else {
    addDays = 8 - dow;
  }
  const d = new Date(now);
  d.setUTCDate(d.getUTCDate() + addDays);
  d.setUTCHours(h, m, 0, 0);
  return d;
}

/** Próximo envío mensual (día 1 09:00 UTC). */
export function getNextMonthlySendUtc(now: Date = new Date()): Date {
  const h = CRON_MONTHLY_HOUR_UTC;
  const minute = 0;
  let y = now.getUTCFullYear();
  let mo = now.getUTCMonth();
  let candidate = new Date(Date.UTC(y, mo, CRON_MONTHLY_DAY, h, minute, 0, 0));
  if (now.getTime() >= candidate.getTime()) {
    mo += 1;
    if (mo > 11) {
      mo = 0;
      y += 1;
    }
    candidate = new Date(Date.UTC(y, mo, CRON_MONTHLY_DAY, h, minute, 0, 0));
  }
  return candidate;
}

export function formatSendInUserTimezone(dateUtc: Date, timezone: string | null | undefined): string {
  const tz = timezone?.trim() || 'America/Argentina/Buenos_Aires';
  try {
    return new Intl.DateTimeFormat('es-AR', {
      timeZone: tz,
      weekday: 'long',
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }).format(dateUtc);
  } catch {
    return dateUtc.toISOString();
  }
}

export function buildTelegramSummaryScheduleLines(
  weeklyEnabled: boolean,
  monthlyEnabled: boolean,
  timezone: string | null | undefined,
  now: Date = new Date()
): string {
  const lines: string[] = [];
  if (weeklyEnabled) {
    const next = getNextWeeklySendUtc(now);
    lines.push(
      `📅 *Resumen semanal* → próximo envío:\n   _${formatSendInUserTimezone(next, timezone)}_`
    );
  } else {
    lines.push('📅 *Resumen semanal:* desactivado');
  }
  if (monthlyEnabled) {
    const next = getNextMonthlySendUtc(now);
    lines.push(
      `📆 *Resumen mensual* → próximo envío:\n   _${formatSendInUserTimezone(next, timezone)}_`
    );
  } else {
    lines.push('📆 *Resumen mensual:* desactivado');
  }
  lines.push('');
  lines.push('_Los envíos usan el horario del servidor (UTC) mostrado en tu zona._');
  return lines.join('\n');
}
