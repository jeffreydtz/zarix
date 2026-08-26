import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  shouldExecuteToday,
  todayYmdAr,
  ymdParts,
  lastDayOfMonth,
} from '@/lib/cron/recurring-schedule';

describe('CU-006 recurring-schedule helpers', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('todayYmdAr formats Argentina calendar date', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-15T15:00:00.000Z'));
    expect(todayYmdAr()).toBe('2026-08-15');
  });

  it('ymdParts returns day-of-week in UTC anchor', () => {
    const parts = ymdParts('2026-08-15');
    expect(parts).toEqual({ y: 2026, m: 8, d: 15, dow: 6 });
  });

  it('lastDayOfMonth handles February in leap years', () => {
    expect(lastDayOfMonth(2024, 2)).toBe(29);
    expect(lastDayOfMonth(2025, 2)).toBe(28);
  });
});

describe('CU-006 shouldExecuteToday', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  function freezeToday(ymd: string) {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(`${ymd}T15:00:00.000Z`));
  }

  it('returns false when start_date is missing (branch B1)', () => {
    freezeToday('2026-08-15');
    expect(shouldExecuteToday({ frequency: 'daily' })).toBe(false);
  });

  it('returns false before start_date (branch B2)', () => {
    freezeToday('2026-08-10');
    expect(
      shouldExecuteToday({ start_date: '2026-08-15', frequency: 'daily' })
    ).toBe(false);
  });

  it('returns false after end_date (branch B3)', () => {
    freezeToday('2026-08-20');
    expect(
      shouldExecuteToday({
        start_date: '2026-08-01',
        end_date: '2026-08-15',
        frequency: 'daily',
      })
    ).toBe(false);
  });

  it('returns false when already executed today (branch B4)', () => {
    freezeToday('2026-08-15');
    expect(
      shouldExecuteToday({
        start_date: '2026-08-01',
        last_executed_date: '2026-08-15',
        frequency: 'daily',
      })
    ).toBe(false);
  });

  it('returns true for daily frequency inside window (branch B5)', () => {
    freezeToday('2026-08-15');
    expect(
      shouldExecuteToday({ start_date: '2026-08-01', frequency: 'daily' })
    ).toBe(true);
  });

  it('matches weekly rules on start weekday (branch B6)', () => {
    freezeToday('2026-08-15'); // Saturday
    expect(
      shouldExecuteToday({ start_date: '2026-08-08', frequency: 'weekly' })
    ).toBe(true);
    expect(
      shouldExecuteToday({ start_date: '2026-08-09', frequency: 'weekly' })
    ).toBe(false);
  });

  it('matches monthly rules on target day, clamped to month length (branch B7)', () => {
    freezeToday('2026-02-28');
    expect(
      shouldExecuteToday({ start_date: '2026-01-31', frequency: 'monthly' })
    ).toBe(true);
    freezeToday('2026-02-27');
    expect(
      shouldExecuteToday({ start_date: '2026-01-31', frequency: 'monthly' })
    ).toBe(false);
  });

  it('matches yearly rules only in start month on target day (branch B8)', () => {
    freezeToday('2026-08-15');
    expect(
      shouldExecuteToday({ start_date: '2025-08-15', frequency: 'yearly' })
    ).toBe(true);
    freezeToday('2026-09-15');
    expect(
      shouldExecuteToday({ start_date: '2025-08-15', frequency: 'yearly' })
    ).toBe(false);
  });

  it('returns false for unknown frequency (branch B9)', () => {
    freezeToday('2026-08-15');
    expect(
      shouldExecuteToday({ start_date: '2026-08-01', frequency: 'quarterly' })
    ).toBe(false);
  });
});
