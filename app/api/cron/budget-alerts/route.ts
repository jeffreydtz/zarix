import { NextRequest } from 'next/server';
import { IterativeCronJob, ServiceClient } from '@/lib/cron/cron-job';
import { budgetsService } from '@/lib/services/budgets';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Chequeo diario de presupuestos del mes en curso: por cada usuario con
 * presupuestos, evalúa umbrales (alert_at_percent y 100%) y manda la alerta
 * por Telegram una sola vez por nivel (dedupe vía budget_alerts).
 */
class BudgetAlertsJob extends IterativeCronJob<{ userId: string }> {
  readonly name = 'budget-alerts';

  protected async fetchItems(supabase: ServiceClient): Promise<Array<{ userId: string }>> {
    const now = new Date();
    const monthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;

    const { data, error } = await supabase
      .from('budgets')
      .select('user_id')
      .eq('month', monthStr);

    if (error) throw error;

    const userIds = Array.from(new Set((data || []).map((b) => b.user_id as string)));
    return userIds.map((userId) => ({ userId }));
  }

  protected async processItem(
    _supabase: ServiceClient,
    item: { userId: string }
  ): Promise<void> {
    await budgetsService.checkAllBudgetsForUser(item.userId);
  }

  protected emptyMessage(): string {
    return 'No budgets for current month';
  }
}

export async function GET(request: NextRequest) {
  return new BudgetAlertsJob().run(request);
}
