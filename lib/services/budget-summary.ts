import { createServiceClientSync } from '@/lib/supabase/server';
import { APP_CIVIL_TIMEZONE, civilTodayYmd, startOfMonthYmd } from '@/lib/transaction-date';
import { budgetsService } from './budgets';

export interface TopBudgetItem {
  id: string;
  categoryId: string | null;
  name: string;
  icon: string;
  limitAmount: number;
  spentAmount: number;
  remainingAmount: number;
  /** 0-100+, puede superar 100 si el presupuesto está excedido. */
  percentUsed: number;
  currency: string;
}

/** Primer día del mes civil Córdoba, formato YYYY-MM-01 (mismo formato que `budgets.month`). */
function currentMonthStr(now: Date = new Date()): string {
  return startOfMonthYmd(civilTodayYmd(APP_CIVIL_TIMEZONE, now));
}

/**
 * Presupuestos del mes en curso ordenados por porcentaje consumido
 * descendente. Reutiliza `budgetsService.getStatus` (RPC `get_budget_status`)
 * para el cálculo de gastado/restante — mismo criterio que el resto de la app.
 */
export async function getTopBudgets(userId: string, limit = 4): Promise<TopBudgetItem[]> {
  const supabase = createServiceClientSync();
  const month = currentMonthStr();

  const { data: budgets, error } = await supabase
    .from('budgets')
    .select('*, category:categories(name, icon)')
    .eq('user_id', userId)
    .eq('month', month);

  if (error) throw error;
  if (!budgets || budgets.length === 0) return [];

  // La RPC incluye presupuestos sin categoría; null también identifica su estado.
  const status = await budgetsService.getStatus(userId, month);
  const statusByCategory = new Map(status.map((s) => [s.category_id, s]));

  const items: TopBudgetItem[] = budgets.map((b: any) => {
    const s = statusByCategory.get(b.category_id);
    const limitAmount = Number(b.amount);
    const spentAmount = s ? Number(s.spent_amount) : 0;
    const remainingAmount = s ? Number(s.remaining_amount) : limitAmount;
    const percentUsed = s ? Number(s.percent_used) : 0;

    return {
      id: b.id,
      categoryId: b.category_id,
      name: b.category?.name || 'Sin categoría',
      icon: b.category?.icon || '📦',
      limitAmount,
      spentAmount,
      remainingAmount,
      percentUsed,
      currency: b.currency,
    };
  });

  return items.sort((a, b) => b.percentUsed - a.percentUsed).slice(0, limit);
}
