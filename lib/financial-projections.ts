import { addMonthsYmd, civilTodayYmd, startOfMonthYmd, isCivilYmd } from '@/lib/transaction-date';

export interface ProjectionTransaction {
  type: string;
  amountArs: number;
  transaction_date: string;
}

/** Calendar bounds use the application's civil timezone, independently of the server TZ. */
export function projectionWindow(now: Date = new Date()) {
  const endExclusive = startOfMonthYmd(civilTodayYmd(undefined, now));
  return { startYmd: addMonthsYmd(endExclusive, -3), endExclusive };
}

/** Average observed complete calendar months; current and future months never contribute. */
export function calculateFinancialProjection(
  transactions: ProjectionTransaction[],
  currentARS: number,
  now: Date = new Date()
) {
  const { startYmd, endExclusive } = projectionWindow(now);
  const monthlyData = new Map<string, { income: number; expense: number }>();
  for (const t of transactions) {
    const instant = new Date(t.transaction_date);
    const day = isCivilYmd(t.transaction_date) ? t.transaction_date :
      Number.isNaN(instant.getTime()) ? '' : civilTodayYmd(undefined, instant);
    if (!day) continue;
    if (day < startYmd || day >= endExclusive || !Number.isFinite(t.amountArs) || t.amountArs <= 0) continue;
    if (t.type !== 'income' && t.type !== 'expense') continue;
    const key = day.slice(0, 7);
    const month = monthlyData.get(key) ?? { income: 0, expense: 0 };
    month[t.type] += t.amountArs;
    monthlyData.set(key, month);
  }
  const months = [...monthlyData.values()];
  if (!months.length) return {
    hasData: false as const,
    message: 'Necesitás movimientos de al menos un mes calendario anterior para proyectar.',
  };
  const avgIncome = months.reduce((sum, m) => sum + m.income, 0) / months.length;
  const avgExpense = months.reduce((sum, m) => sum + m.expense, 0) / months.length;
  const avgSavings = avgIncome - avgExpense;
  const savingsRate = avgIncome > 0 ? avgSavings / avgIncome * 100 : 0;
  const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  const futureMonths = Array.from({ length: 12 }, (_, index) => {
    const month = addMonthsYmd(endExclusive, index + 1);
    return { month: `${monthNames[Number(month.slice(5, 7)) - 1]} ${month.slice(0, 4)}`, projected: currentARS + avgSavings * (index + 1) };
  });
  return {
    hasData: true as const,
    avgIncome: Math.round(avgIncome), avgExpense: Math.round(avgExpense), avgSavings: Math.round(avgSavings),
    savingsRate: Math.round(savingsRate * 10) / 10, currentBalance: Math.round(currentARS),
    projection3m: Math.round(currentARS + avgSavings * 3),
    projection6m: Math.round(currentARS + avgSavings * 6),
    projection12m: Math.round(currentARS + avgSavings * 12),
    futureMonths, monthsAnalyzed: months.length, trend: avgSavings > 0 ? 'positive' : 'negative',
  };
}
