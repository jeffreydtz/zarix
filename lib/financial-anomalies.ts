import {
  addDaysYmd,
  addMonthsYmd,
  civilTodayYmd,
  isCivilYmd,
  startOfMonthYmd,
} from '@/lib/transaction-date';

export interface AnomalyTransaction {
  type: string;
  amountArs: number;
  transaction_date: string;
  category_id: string | null;
  category?: { name?: string | null; icon?: string | null } | null;
}

export interface FinancialAnomaly {
  categoryId: string;
  categoryName: string;
  categoryIcon: string;
  currentAmount: number;
  historicalAvg: number;
  ratio: number | null;
  extraAmount: number;
}

/** Argentina's civil-day bounds, independent of the server's timezone. */
export function anomalyWindow(now: Date = new Date()) {
  const todayYmd = civilTodayYmd(undefined, now);
  const currentMonthStartYmd = startOfMonthYmd(todayYmd);
  const startYmd = addMonthsYmd(currentMonthStartYmd, -3);
  const endExclusiveYmd = addDaysYmd(todayYmd, 1);
  return {
    todayYmd,
    currentMonthStartYmd,
    startYmd,
    endExclusiveYmd,
    startIso: `${startYmd}T03:00:00.000Z`,
    endExclusiveIso: `${endExclusiveYmd}T03:00:00.000Z`,
  };
}

/** Three complete prior months versus spending through the current civil day. */
export function calculateFinancialAnomalies(
  transactions: AnomalyTransaction[],
  now: Date = new Date()
): FinancialAnomaly[] {
  const { startYmd, currentMonthStartYmd, todayYmd } = anomalyWindow(now);
  const historical = new Map<string, number>();
  const current = new Map<string, { name: string; icon: string; total: number }>();

  for (const t of transactions) {
    if (t.type !== 'expense' || !Number.isFinite(t.amountArs) || t.amountArs <= 0) continue;
    const instant = new Date(t.transaction_date);
    const day = isCivilYmd(t.transaction_date) ? t.transaction_date :
      Number.isNaN(instant.getTime()) ? '' : civilTodayYmd(undefined, instant);
    if (!day || day < startYmd || day > todayYmd) continue;
    const id = t.category_id || 'uncategorized';
    if (day < currentMonthStartYmd) {
      historical.set(id, (historical.get(id) ?? 0) + t.amountArs);
    } else {
      const category = current.get(id) ?? {
        name: t.category?.name || 'Sin categoría',
        icon: t.category?.icon || '🔁',
        total: 0,
      };
      category.total += t.amountArs;
      current.set(id, category);
    }
  }

  const anomalies: FinancialAnomaly[] = [];
  for (const [id, category] of current) {
    const average = (historical.get(id) ?? 0) / 3;
    const ratio = average > 0 ? category.total / average : null;
    if (ratio !== null ? ratio >= 2 : category.total > 5000) {
      anomalies.push({
        categoryId: id,
        categoryName: category.name,
        categoryIcon: category.icon,
        currentAmount: category.total,
        historicalAvg: average,
        ratio,
        extraAmount: category.total - average,
      });
    }
  }
  return anomalies.sort((a, b) => (b.ratio ?? 99) - (a.ratio ?? 99));
}
