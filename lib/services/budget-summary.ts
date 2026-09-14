import { createServiceClientSync } from '@/lib/supabase/server';
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

/** Primer día del mes en curso, formato YYYY-MM-01 (mismo formato que la columna `budgets.month`). */
function currentMonthStr(): string {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' });
  return `${today.slice(0, 7)}-01`;
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

  // `get_budget_status` hace INNER JOIN contra categories, así que presupuestos
  // sin categoría (category_id null) no aparecen ahí: se listan con gastado = 0.
  const status = await budgetsService.getStatus(userId, new Date(month));
  const statusByCategory = new Map(status.map((s) => [s.category_id, s]));

  const items: TopBudgetItem[] = budgets.map((b: any) => {
    const s = b.category_id ? statusByCategory.get(b.category_id) : undefined;
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
