import { describe, it, expect } from 'vitest';
import {
  APP_CIVIL_TIMEZONE,
  todayLocalYmd,
  calendarDateToUtcNoonIso,
  civilTodayYmd,
  isoToLocalDateInputValue,
  parseBotTransactionDateInput,
  parseCivilMonthQuery,
  isCivilYmd,
  startOfMonthYmd,
  transactionCivilYmd,
  ymdToQueryEndIso,
  ymdToQueryExclusiveEndIso,
  ymdToQueryStartIso,
} from '@/lib/transaction-date';

describe('todayLocalYmd', () => {
  it('returns a YYYY-MM-DD string for today (local)', () => {
    const ymd = todayLocalYmd();
    expect(ymd).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const n = new Date();
    const expected = `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
    expect(ymd).toBe(expected);
  });
});

describe('calendarDateToUtcNoonIso', () => {
  it('maps a civil day to noon UTC of that day', () => {
    expect(calendarDateToUtcNoonIso('2026-03-15')).toBe('2026-03-15T12:00:00.000Z');
    expect(calendarDateToUtcNoonIso('2026-12-31')).toBe('2026-12-31T12:00:00.000Z');
  });

  it('tolerates surrounding whitespace', () => {
    expect(calendarDateToUtcNoonIso('  2026-06-20  ')).toBe('2026-06-20T12:00:00.000Z');
  });

  it.each(['2026-02-30', '2026-04-31', 'not-a-date', '2026-13-01', '2026-01-32'])(
    'rejects %s instead of recording another civil day', (input) => {
      expect(() => calendarDateToUtcNoonIso(input)).toThrow('Fecha calendario inválida');
    }
  );

  it('accepts leap days only in real leap years', () => {
    expect(isCivilYmd('2024-02-29')).toBe(true);
    expect(isCivilYmd('2000-02-29')).toBe(true);
    expect(isCivilYmd('1900-02-29')).toBe(false);
    expect(isCivilYmd('2026-02-29')).toBe(false);
    expect(isCivilYmd('2026-04-31')).toBe(false);
    expect(isCivilYmd(' 2026-01-01')).toBe(false);
    expect(calendarDateToUtcNoonIso('0099-02-28')).toBe('0099-02-28T12:00:00.000Z');
  });
});

describe('isoToLocalDateInputValue', () => {
  it('round-trips a civil day through noon-UTC storage (safe in any real timezone)', () => {
    for (const ymd of ['2026-01-01', '2026-06-20', '2026-12-31']) {
      const iso = calendarDateToUtcNoonIso(ymd);
      expect(isoToLocalDateInputValue(iso)).toBe(ymd);
    }
  });

  it('falls back to today for an unparseable ISO', () => {
    expect(isoToLocalDateInputValue('garbage')).toBe(todayLocalYmd());
  });
});

describe('parseBotTransactionDateInput', () => {
  it('returns undefined for null/undefined/empty/blank', () => {
    expect(parseBotTransactionDateInput(null)).toBeUndefined();
    expect(parseBotTransactionDateInput(undefined)).toBeUndefined();
    expect(parseBotTransactionDateInput('')).toBeUndefined();
    expect(parseBotTransactionDateInput('   ')).toBeUndefined();
  });

  it('returns undefined for non-string input', () => {
    expect(parseBotTransactionDateInput(123)).toBeUndefined();
    expect(parseBotTransactionDateInput({})).toBeUndefined();
  });

  it('maps a bare YYYY-MM-DD to noon UTC', () => {
    expect(parseBotTransactionDateInput('2026-03-15')).toBe('2026-03-15T12:00:00.000Z');
  });

  it('preserves a full ISO timestamp as-is', () => {
    expect(parseBotTransactionDateInput('2026-03-15T08:30:00.000Z')).toBe('2026-03-15T08:30:00.000Z');
  });

  it('returns undefined for an unparseable string', () => {
    expect(parseBotTransactionDateInput('yesterday')).toBeUndefined();
  });

  it.each(['2026-02-30', '2026-02-30T08:30:00Z', '1900-02-29T12:00:00Z'])(
    'does not normalize an impossible bot/OCR date %s', (input) => {
      expect(parseBotTransactionDateInput(input)).toBeUndefined();
    }
  );
});

describe('parseCivilMonthQuery', () => {
  it('treats YYYY-MM as Córdoba noon on day 1, not UTC midnight', () => {
    const month = parseCivilMonthQuery('2026-10');
    expect(month).not.toBeNull();
    expect(month!.toISOString()).toBe('2026-10-01T15:00:00.000Z');
    expect(new Date('2026-10').toISOString()).toBe('2026-10-01T00:00:00.000Z');
    expect(month!.getTime()).not.toBe(new Date('2026-10').getTime());
  });

  it('falls back to now only when the month param is missing', () => {
    const now = new Date('2026-09-15T12:00:00.000Z');
    expect(parseCivilMonthQuery(null, now)).toBe(now);
    expect(parseCivilMonthQuery(undefined, now)).toBe(now);
  });

  it.each(['', '   ', 'nope', '2026-13', '2026-00', '2026-10-32'])(
    'returns null for a present invalid month %s',
    (input) => {
      const now = new Date('2026-09-15T12:00:00.000Z');
      expect(parseCivilMonthQuery(input, now)).toBeNull();
    }
  );
});

describe('Córdoba civil grouping and month bounds', () => {
  it('keeps 24 Oct 23:30 local on the 24th, not the UTC 25th', () => {
    expect(transactionCivilYmd('2026-10-24T23:30:00-03:00')).toBe('2026-10-24');
    expect(transactionCivilYmd('2026-10-24T23:30:00-03:00')).not.toBe('2026-10-25');
  });

  it('selects October for 31 Oct 23:30 Córdoba even when UTC is 1 Nov', () => {
    const late = new Date('2026-10-31T23:30:00-03:00');
    expect(startOfMonthYmd(civilTodayYmd(APP_CIVIL_TIMEZONE, late))).toBe('2026-10-01');
    const utcMorning = new Date('2026-11-01T01:00:00.000Z');
    expect(startOfMonthYmd(civilTodayYmd(APP_CIVIL_TIMEZONE, utcMorning))).toBe('2026-10-01');
    expect(utcMorning.toISOString().slice(0, 7)).toBe('2026-11');
  });

  it('keeps 31 Oct 23:30 local inside October query bounds', () => {
    expect(transactionCivilYmd('2026-10-31T23:30:00-03:00')).toBe('2026-10-31');
    const start = ymdToQueryStartIso('2026-10-01');
    const end = ymdToQueryEndIso('2026-10-31');
    const stored = new Date('2026-10-31T23:30:00-03:00').toISOString();
    expect(stored).toBe('2026-11-01T02:30:00.000Z');
    expect(stored >= start).toBe(true);
    expect(stored <= end).toBe(true);
    expect(end).toBe('2026-11-01T02:59:59.999Z');
    const exclusive = ymdToQueryExclusiveEndIso('2026-10-31');
    expect(exclusive).toBe('2026-11-01T03:00:00.000Z');
    expect(stored < exclusive).toBe(true);
  });
});
