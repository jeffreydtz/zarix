import { describe, expect, it } from 'vitest';
import { parseArgentineNumber } from '@/lib/market-data/argentine-number';
import {
  easterSundayYmd,
  isArgentineMarketHoliday,
  isArgentinePublicHoliday,
} from '@/lib/market-data/ar-holidays';
import {
  businessDaysBetween,
  cafciValoresAlLabel,
  evaluateFciNavFreshness,
  FCI_NAV_MAX_BUSINESS_DAYS,
  freshFciNavIso,
  navTimestampToCivilYmd,
  shiftBusinessDays,
} from '@/lib/market-data/fci-nav-freshness';
import { parseCafciDateLabel } from '@/lib/market-data/cafci-client';
import { civilTodayYmd } from '@/lib/transaction-date';
import { storedFciTimestampMs } from '@/lib/market-data/quote-refresh';

describe('strict Argentine number parsing', () => {
  it('treats grouped integers without a decimal comma as thousands', () => {
    expect(parseArgentineNumber('1.000')).toBe(1000);
    expect(parseArgentineNumber('1.000.000')).toBe(1_000_000);
    expect(parseArgentineNumber('1.241,954039')).toBeCloseTo(1241.954039);
    expect(parseArgentineNumber('1,097744')).toBeCloseTo(1.097744);
    expect(parseArgentineNumber('-0,15')).toBeCloseTo(-0.15);
    expect(parseArgentineNumber('\u22120,15')).toBeCloseTo(-0.15);
  });

  it('rejects markup, malformed grouping and leftover tokens', () => {
    expect(parseArgentineNumber('1<span>,097744</span>')).toBeNull();
    expect(parseArgentineNumber('1,10,90')).toBeNull();
    expect(parseArgentineNumber('1.2,34')).toBeNull();
    expect(parseArgentineNumber('12.34')).toBeNull();
    expect(parseArgentineNumber('1.00')).toBeNull();
    expect(parseArgentineNumber('')).toBeNull();
  });
});

describe('FCI NAV freshness', () => {
  const monday = new Date('2026-10-26T15:00:00.000Z');

  it('counts Friday→Monday as one business day and accepts it', () => {
    expect(civilTodayYmd('America/Argentina/Buenos_Aires', monday)).toBe('2026-10-26');
    expect(businessDaysBetween('2026-10-23', '2026-10-26')).toBe(1);
    const iso = '2026-10-23T03:00:00.000Z';
    expect(evaluateFciNavFreshness(iso, { now: monday })).toMatchObject({
      ok: true, ymd: '2026-10-23', ageBusinessDays: 1,
    });
  });

  it('rejects undated, impossible and stale NAVs', () => {
    expect(evaluateFciNavFreshness(null, { now: monday })).toMatchObject({ reason: 'undated' });
    expect(evaluateFciNavFreshness('not-a-date', { now: monday })).toMatchObject({ reason: 'invalid_date' });
    expect(evaluateFciNavFreshness('2026-10-27T03:00:00.000Z', { now: monday })).toMatchObject({
      reason: 'future_nav',
    });
    expect(evaluateFciNavFreshness('2025-01-06T03:00:00.000Z', { now: monday })).toMatchObject({
      reason: 'stale_nav',
    });
    expect(FCI_NAV_MAX_BUSINESS_DAYS).toBe(5);
  });

  it('shifts weekdays without landing on a weekend', () => {
    expect(shiftBusinessDays('2026-10-26', -1)).toBe('2026-10-23');
    expect(cafciValoresAlLabel(monday)).toBe('23/10/2026');
    expect(freshFciNavIso(monday)).toBe('2026-10-23T03:00:00.000Z');
  });

  it('skips Argentine market holidays such as 12 October', () => {
    expect(easterSundayYmd(2026)).toBe('2026-04-05');
    expect(isArgentinePublicHoliday('2026-10-12')).toBe(true);
    expect(isArgentineMarketHoliday('2026-04-02')).toBe(true);
    expect(isArgentineMarketHoliday('2026-04-03')).toBe(true);
    expect(businessDaysBetween('2026-03-30', '2026-04-07')).toBe(4);
    expect(shiftBusinessDays('2026-10-13', -1)).toBe('2026-10-09');
  });

  it('rejects an impossible ISO timestamp instead of Date.parse rollover', () => {
    expect(navTimestampToCivilYmd('2026-02-31T03:00:00Z')).toBeNull();
    expect(evaluateFciNavFreshness('2026-02-31T03:00:00.000Z', { now: monday })).toMatchObject({
      reason: 'invalid_date',
    });
    expect(navTimestampToCivilYmd('2026-10-23')).toBe('2026-10-23');
  });

  it('does not let a future stored timestamp block writes', () => {
    expect(storedFciTimestampMs('2099-01-01T03:00:00.000Z')).toBeNaN();
    expect(storedFciTimestampMs('not-a-date')).toBeNaN();
    expect(storedFciTimestampMs('2026-10-23T03:00:00.000Z')).toBe(
      Date.parse('2026-10-23T03:00:00.000Z')
    );
  });
});

describe('CAFCI calendar dates', () => {
  it('does not roll 31/02 into March', () => {
    expect(parseCafciDateLabel('31/02/2026')).toBeNull();
    expect(parseCafciDateLabel('29/02/2026')).toBeNull();
    expect(parseCafciDateLabel('29/02/2024')).toBe('2024-02-29T03:00:00.000Z');
    expect(parseCafciDateLabel('2026-10-23')).toBeNull();
    expect(parseCafciDateLabel('October 23, 2026')).toBeNull();
  });
});
