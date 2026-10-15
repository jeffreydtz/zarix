import { describe, it, expect } from 'vitest';
import {
  todayLocalYmd,
  calendarDateToUtcNoonIso,
  isoToLocalDateInputValue,
  parseBotTransactionDateInput,
  isCivilYmd,
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
