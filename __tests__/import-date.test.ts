import { describe, expect, it } from 'vitest';
import { parseImportDate } from '@/lib/import/date';

describe('financial import calendar dates', () => {
  it.each(['2026-02-31', '31/02/2026', '2026-04-31', '2026-02-31T08:30:00Z'])(
    'rejects impossible date %s instead of shifting the financial history', (input) => {
      expect(parseImportDate(input)).toBeNull();
    }
  );

  it('handles leap years, chosen ambiguous order and Excel serials', () => {
    expect(parseImportDate('29/02/2024')?.toISOString()).toBe('2024-02-29T12:00:00.000Z');
    expect(parseImportDate('29/02/1900')).toBeNull();
    expect(parseImportDate('02/04/2026', { ambiguousOrder: 'dmy' })?.toISOString())
      .toBe('2026-04-02T12:00:00.000Z');
    expect(parseImportDate('02/04/2026', { ambiguousOrder: 'mdy' })?.toISOString())
      .toBe('2026-02-04T12:00:00.000Z');
    expect(parseImportDate(45351)?.toISOString()).toBe('2024-02-29T12:00:00.000Z');
  });

  it('preserves the time and offset of a valid timestamp', () => {
    expect(parseImportDate('2026-10-06T08:30:00-03:00')?.toISOString())
      .toBe('2026-10-06T11:30:00.000Z');
  });
});
