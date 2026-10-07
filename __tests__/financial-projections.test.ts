import { describe, expect, it } from 'vitest';
import { calculateFinancialProjection, projectionWindow } from '@/lib/financial-projections';

const now = new Date('2026-10-06T12:00:00Z');
const tx = (type: string, amountArs: number, day: string) => ({ type, amountArs, transaction_date: `${day}T12:00:00.000Z` });

describe('financial projection over completed calendar months', () => {
  it('excludes the partial current month and future entries from the average', () => {
    const result = calculateFinancialProjection([
      tx('income', 1200, '2026-08-10'), tx('expense', 600, '2026-08-12'),
      tx('income', 1800, '2026-09-10'), tx('expense', 900, '2026-09-12'),
      tx('expense', 50000, '2026-10-01'), tx('income', 100000, '2026-11-01'),
    ], 10000, now);
    expect(result).toMatchObject({ hasData: true, avgIncome: 1500, avgExpense: 750, avgSavings: 750, monthsAnalyzed: 2, projection3m: 12250, projection6m: 14500, projection12m: 19000 });
  });
  it('does not claim sufficient history when only the current month has entries', () => {
    expect(calculateFinancialProjection([tx('income', 3000, '2026-10-02')], 10000, now).hasData).toBe(false);
  });
  it('uses Argentina calendar when UTC has already crossed into a new month', () => {
    const boundary = new Date('2026-10-01T01:00:00Z');
    expect(projectionWindow(boundary)).toEqual({ startYmd: '2026-06-01', endExclusive: '2026-09-01' });
    const result = calculateFinancialProjection([tx('income', 200, '2026-08-31'), tx('expense', 100, '2026-09-01')], 1000, boundary);
    expect(result).toMatchObject({ hasData: true, avgIncome: 200, avgExpense: 0, projection3m: 1600 });
    if (result.hasData) expect(result.futureMonths[0].month).toBe('Oct 2026');
  });
  it('honors the inclusive start and exclusive end of the historical window', () => {
    expect(calculateFinancialProjection([tx('income', 9999, '2026-06-30'), tx('income', 100, '2026-07-01'), tx('expense', 40, '2026-09-30'), tx('income', 9999, '2026-10-01')], 1000, now)).toMatchObject({ avgIncome: 50, avgExpense: 20, monthsAnalyzed: 2, projection3m: 1090 });
  });
  it('excludes transfers, invalid amounts and other non-operating entries', () => {
    expect(calculateFinancialProjection([tx('transfer', 9999, '2026-09-02'), tx('income', NaN, '2026-09-03'), tx('income', 0, '2026-09-04'), tx('expense', -10, '2026-09-05')], 0, now).hasData).toBe(false);
  });
  it('projects negative savings without hiding a deficit or dividing by zero income', () => {
    expect(calculateFinancialProjection([tx('expense', 100, '2026-09-10')], 200, now)).toMatchObject({ avgSavings: -100, savingsRate: 0, projection3m: -100, trend: 'negative' });
  });
  it('includes the last Argentina evening of a closed month and excludes the next local day', () => {
    const result = calculateFinancialProjection([
      { type: 'income', amountArs: 1000, transaction_date: '2026-10-01T02:59:59Z' },
      { type: 'expense', amountArs: 900, transaction_date: '2026-10-01T03:00:00Z' },
    ], 0, now);
    expect(result).toMatchObject({ hasData: true, avgIncome: 1000, avgExpense: 0, monthsAnalyzed: 1 });
  });

});
