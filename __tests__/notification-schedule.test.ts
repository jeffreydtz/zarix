import { describe, it, expect } from 'vitest';
import {
  getNextWeeklySendUtc,
  getNextMonthlySendUtc,
  formatSendInUserTimezone,
  buildTelegramSummaryScheduleLines,
} from '@/lib/notification-schedule';

describe('getNextWeeklySendUtc (Monday 09:00 UTC)', () => {
  it('Sunday -> next day (Monday) at 09:00', () => {
    const now = new Date(Date.UTC(2026, 7, 9, 12, 0, 0)); // Sun 2026-08-09
    expect(getNextWeeklySendUtc(now).toISOString()).toBe('2026-08-10T09:00:00.000Z');
  });

  it('Monday before 09:00 -> same day 09:00', () => {
    const now = new Date(Date.UTC(2026, 7, 10, 8, 0, 0)); // Mon 08:00
    expect(getNextWeeklySendUtc(now).toISOString()).toBe('2026-08-10T09:00:00.000Z');
  });

  it('Monday after 09:00 -> following Monday', () => {
    const now = new Date(Date.UTC(2026, 7, 10, 10, 0, 0)); // Mon 10:00
    expect(getNextWeeklySendUtc(now).toISOString()).toBe('2026-08-17T09:00:00.000Z');
  });

  it('mid-week always lands on the next Monday 09:00', () => {
    const tue = new Date(Date.UTC(2026, 7, 11, 0, 0, 0));
    const wed = new Date(Date.UTC(2026, 7, 12, 23, 0, 0));
    for (const now of [tue, wed]) {
      const d = getNextWeeklySendUtc(now);
      expect(d.getUTCDay()).toBe(1);
      expect(d.getUTCHours()).toBe(9);
      expect(d.getUTCMinutes()).toBe(0);
      expect(d.toISOString()).toBe('2026-08-17T09:00:00.000Z');
    }
  });
});

describe('getNextMonthlySendUtc (day 1, 09:00 UTC)', () => {
  it('after this month\'s send -> first of next month', () => {
    const now = new Date(Date.UTC(2026, 7, 11, 12, 0, 0)); // 2026-08-11
    expect(getNextMonthlySendUtc(now).toISOString()).toBe('2026-09-01T09:00:00.000Z');
  });

  it('before the 1st 09:00 -> this month', () => {
    const now = new Date(Date.UTC(2026, 7, 1, 8, 0, 0)); // 2026-08-01 08:00
    expect(getNextMonthlySendUtc(now).toISOString()).toBe('2026-08-01T09:00:00.000Z');
  });

  it('rolls over the year in December', () => {
    const now = new Date(Date.UTC(2026, 11, 15, 0, 0, 0)); // 2026-12-15
    expect(getNextMonthlySendUtc(now).toISOString()).toBe('2027-01-01T09:00:00.000Z');
  });
});

describe('formatSendInUserTimezone', () => {
  it('falls back to ISO when the timezone is invalid', () => {
    const d = new Date(Date.UTC(2026, 7, 10, 9, 0, 0));
    expect(formatSendInUserTimezone(d, 'Not/AZone')).toBe(d.toISOString());
  });

  it('formats without throwing for a valid timezone', () => {
    const d = new Date(Date.UTC(2026, 7, 10, 9, 0, 0));
    const out = formatSendInUserTimezone(d, 'America/Argentina/Buenos_Aires');
    expect(typeof out).toBe('string');
    expect(out.length).toBeGreaterThan(0);
    expect(out).not.toBe(d.toISOString());
  });
});

describe('buildTelegramSummaryScheduleLines', () => {
  const now = new Date(Date.UTC(2026, 7, 11, 12, 0, 0));

  it('shows "desactivado" for disabled summaries', () => {
    const out = buildTelegramSummaryScheduleLines(false, false, null, now);
    expect(out).toContain('Resumen semanal:* desactivado');
    expect(out).toContain('Resumen mensual:* desactivado');
  });

  it('shows next-send lines for enabled summaries', () => {
    const out = buildTelegramSummaryScheduleLines(true, true, 'America/Argentina/Buenos_Aires', now);
    expect(out).toContain('Resumen semanal');
    expect(out).toContain('Resumen mensual');
    expect(out).toContain('próximo envío');
  });
});
