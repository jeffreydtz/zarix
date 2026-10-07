import { describe, expect, it } from 'vitest';
import {
  anomalyWindow,
  calculateFinancialAnomalies,
  type AnomalyTransaction,
} from '@/lib/financial-anomalies';

const now = new Date('2026-10-06T15:00:00.000Z');
function expense(amountArs: number, date: string, category = 'food'): AnomalyTransaction {
  return { type: 'expense', amountArs, transaction_date: date, category_id: category,
    category: { name: 'Alimentos', icon: '🍴' } };
}
const history = [expense(1000, '2026-07-01'), expense(1000, '2026-08-01'), expense(1000, '2026-09-01')];

describe('CU-003 RF11 anomalías financieras', () => {
  it('alerta en ratio2 exacto con promedio de tres meses completos', () => {
    expect(calculateFinancialAnomalies([...history, expense(2000, '2026-10-06')], now)).toEqual([{
      categoryId: 'food', categoryName: 'Alimentos', categoryIcon: '🍴',
      currentAmount: 2000, historicalAvg: 1000, ratio: 2, extraAmount: 1000,
    }]);
  });
  it('no alerta en ratio1.999', () => {
    expect(calculateFinancialAnomalies([...history, expense(1999, '2026-10-06')], now)).toEqual([]);
  });
  it('no alerta para nueva categoría en5000ARS exactos', () => {
    expect(calculateFinancialAnomalies([expense(5000, '2026-10-06')], now)).toEqual([]);
  });
  it('alerta nueva categoría en5000.01ARS con ratio desconocido', () => {
    expect(calculateFinancialAnomalies([expense(5000.01, '2026-10-06')], now)[0]).toMatchObject({
      currentAmount: 5000.01, historicalAvg: 0, ratio: null, extraAmount: 5000.01,
    });
  });
  it('usa el día Argentina para límites UTC y para timestamps sin tomar el prefijo ISO', () => {
    expect(anomalyWindow(new Date('2026-10-01T02:59:59.999Z'))).toMatchObject({
      todayYmd: '2026-09-30', currentMonthStartYmd: '2026-09-01',
      startIso: '2026-06-01T03:00:00.000Z', endExclusiveIso: '2026-10-01T03:00:00.000Z',
    });
    expect(anomalyWindow(new Date('2026-10-01T03:00:00.000Z'))).toMatchObject({
      todayYmd: '2026-10-01', startIso: '2026-07-01T03:00:00.000Z',
      endExclusiveIso: '2026-10-02T03:00:00.000Z',
    });
    // UTC October1 02:59 remains September30 in Argentina: historical, not current.
    const result = calculateFinancialAnomalies([
      expense(3000, '2026-10-01T02:59:59.999Z'), expense(2000, '2026-10-01T03:00:00.000Z'),
    ], now);
    expect(result[0]).toMatchObject({ historicalAvg: 1000, currentAmount: 2000, ratio: 2 });
  });
  it('devuelve vacío sin gastos elegibles ni ante ingresos o transferencias', () => {
    expect(calculateFinancialAnomalies([], now)).toEqual([]);
    expect(calculateFinancialAnomalies([
      { ...expense(99999, '2026-10-06'), type: 'income' },
      { ...expense(99999, '2026-10-06'), type: 'transfer' },
      expense(99999, 'invalid'),
    ], now)).toEqual([]);
  });
  it('excluye negativos, cero y conversiones no finitas sin alterar el oráculo', () => {
    expect(calculateFinancialAnomalies([
      ...history, expense(2000, '2026-10-06'), expense(-9000, '2026-10-06'),
      expense(0, '2026-10-06'), expense(NaN, '2026-10-06'), expense(Infinity, '2026-07-01'),
    ], now)[0]).toMatchObject({ currentAmount: 2000, historicalAvg: 1000, ratio: 2 });
  });
  it('incluye el corte civil y excluye mañana, meses futuros e historia demasiado antigua', () => {
    const result = calculateFinancialAnomalies([
      ...history, expense(2000, '2026-10-07T02:59:59.999Z'),
      expense(99999, '2026-10-07T03:00:00.000Z'), expense(99999, '2026-11-01'),
      expense(99999, '2026-06-30T15:00:00.000Z'),
    ], now);
    expect(result[0]).toMatchObject({ currentAmount: 2000, historicalAvg: 1000, ratio: 2 });
  });
});
