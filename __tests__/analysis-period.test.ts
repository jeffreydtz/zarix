import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  addDaysYmd,
  addMonthsYmd,
  civilTodayYmd,
  dateToLocalYmd,
  daysInclusive,
  eachYmdInclusive,
  endOfMonthYmd,
  isCivilYmd,
  monthKeysInclusive,
  startOfMonthYmd,
  ymdToQueryEndIso,
  ymdToQueryStartIso,
} from '@/lib/transaction-date';
import {
  monthlyTrendWindow,
  percentChange,
  resolveAnalysisPeriod,
} from '@/lib/analysis-period';
import { accountIdFromPathname } from '@/lib/account-route';

describe('civil calendar helpers', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('accepts valid YYYY-MM-DD and rejects garbage', () => {
    expect(isCivilYmd('2026-08-31')).toBe(true);
    expect(isCivilYmd('2026-13-01')).toBe(false);
    expect(isCivilYmd('31/08/2026')).toBe(false);
  });

  it('adds days and months without local-TZ drift', () => {
    expect(addDaysYmd('2026-08-31', 1)).toBe('2026-09-01');
    expect(addDaysYmd('2026-03-01', -1)).toBe('2026-02-28');
    expect(addMonthsYmd('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonthsYmd('2024-01-31', 1)).toBe('2024-02-29');
    expect(addMonthsYmd('2026-03-31', -1)).toBe('2026-02-28');
  });

  it('computes month bounds and inclusive counts', () => {
    expect(startOfMonthYmd('2026-08-15')).toBe('2026-08-01');
    expect(endOfMonthYmd('2026-08-15')).toBe('2026-08-31');
    expect(daysInclusive('2026-08-01', '2026-08-31')).toBe(31);
    expect(eachYmdInclusive('2026-08-30', '2026-09-01')).toEqual([
      '2026-08-30',
      '2026-08-31',
      '2026-09-01',
    ]);
    expect(monthKeysInclusive('2026-11-20', '2027-01-05')).toEqual(['2026-11', '2026-12', '2027-01']);
  });

  it('builds query ISO bounds from civil days', () => {
    expect(ymdToQueryStartIso('2026-08-01')).toBe('2026-08-01T00:00:00.000Z');
    expect(ymdToQueryEndIso('2026-08-31')).toBe('2026-08-31T23:59:59.999Z');
  });

  it('civilTodayYmd uses Argentina even if the clock is already the next UTC day', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-01T01:30:00.000Z'));
    expect(civilTodayYmd()).toBe('2026-08-31');
  });

  it('dateToLocalYmd does not shift the civil day via toISOString', () => {
    const localMidnight = new Date(2026, 7, 1, 0, 0, 0, 0);
    expect(dateToLocalYmd(localMidnight)).toBe('2026-08-01');
  });
});

describe('resolveAnalysisPeriod', () => {
  const today = '2026-08-15';

  it('defaults to this month through today and compares against the same days last month', () => {
    const period = resolveAnalysisPeriod({}, today);
    expect(period.preset).toBe('this_month');
    expect(period.startYmd).toBe('2026-08-01');
    expect(period.endYmd).toBe('2026-08-15');
    expect(period.prevStartYmd).toBe('2026-07-01');
    expect(period.prevEndYmd).toBe('2026-07-15');
  });

  it('resolves last_month as a full calendar month', () => {
    const period = resolveAnalysisPeriod({ period: 'last_month' }, today);
    expect(period.startYmd).toBe('2026-07-01');
    expect(period.endYmd).toBe('2026-07-31');
    expect(period.prevStartYmd).toBe('2026-06-01');
    expect(period.prevEndYmd).toBe('2026-06-30');
  });

  it('resolves rolling day windows', () => {
    const week = resolveAnalysisPeriod({ period: 'last_7_days' }, today);
    expect(week.startYmd).toBe('2026-08-09');
    expect(week.endYmd).toBe('2026-08-15');
    expect(week.prevStartYmd).toBe('2026-08-02');
    expect(week.prevEndYmd).toBe('2026-08-08');
  });

  it('treats startDate/endDate as a custom range and swaps inverted bounds', () => {
    const period = resolveAnalysisPeriod(
      { period: 'custom', startDate: '2026-03-20', endDate: '2026-03-10' },
      today
    );
    expect(period.preset).toBe('custom');
    expect(period.startYmd).toBe('2026-03-10');
    expect(period.endYmd).toBe('2026-03-20');
    expect(period.prevStartYmd).toBe('2026-02-27');
    expect(period.prevEndYmd).toBe('2026-03-09');
  });

  it('pads short periods to 6 months of monthly context', () => {
    const period = resolveAnalysisPeriod({ period: 'this_month' }, today);
    const window = monthlyTrendWindow(period);
    expect(window.startYmd).toBe('2026-03-01');
    expect(window.endYmd).toBe('2026-08-31');
  });

  it('keeps a long custom range as-is for monthly evolution', () => {
    const period = resolveAnalysisPeriod(
      { startDate: '2026-01-01', endDate: '2026-06-30' },
      today
    );
    const window = monthlyTrendWindow(period);
    expect(window.startYmd).toBe('2026-01-01');
    expect(window.endYmd).toBe('2026-06-30');
  });
});

describe('percentChange', () => {
  it('returns null when previous is zero and a signed percent otherwise', () => {
    expect(percentChange(120, 100)).toBe(20);
    expect(percentChange(80, 100)).toBe(-20);
    expect(percentChange(10, 0)).toBeNull();
  });
});

describe('accountIdFromPathname', () => {
  const id = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

  it('extracts a UUID from an account detail path', () => {
    expect(accountIdFromPathname(`/accounts/${id}`)).toBe(id);
  });

  it('ignores the accounts index and unrelated routes', () => {
    expect(accountIdFromPathname('/accounts')).toBeUndefined();
    expect(accountIdFromPathname('/accounts/not-a-uuid')).toBeUndefined();
    expect(accountIdFromPathname('/expenses')).toBeUndefined();
  });
});
