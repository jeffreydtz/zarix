import { effectivePlan } from '@/lib/plans/rules';
import { IterativeCronJob, ServiceClient } from '@/lib/cron/cron-job';
import { shouldExecuteToday, todayYmdAr } from '@/lib/cron/recurring-schedule';
import { transactionsService } from '@/lib/services/transactions';
import { addDaysYmd } from '@/lib/transaction-date';

export class RecurringRulesJob extends IterativeCronJob<any> {
  readonly name = 'recurring';

  protected async fetchItems(supabase: ServiceClient): Promise<any[]> {
    // La fecha fin es inclusiva. Una regla vencida no debe quedar activa para siempre.
    const { error: expirationError } = await supabase
      .from('recurring_rules')
      .update({ is_active: false })
      .eq('is_active', true)
      .lt('end_date', todayYmdAr());
    if (expirationError) throw expirationError;

    // Get all active recurring rules with their accounts
    const { data: rules, error } = await supabase
      .from('recurring_rules')
      .select('*, account:accounts!recurring_rules_account_id_fkey(name, currency, is_active, movement_enabled), user:users(status, current_period_end, grace_period_end)')
      .eq('is_active', true);

    if (error) throw error;
    return rules || [];
  }

  protected shouldProcess(rule: any): boolean {
    if (effectivePlan(rule.user) !== 'premium') return false;
    if (!shouldExecuteToday(rule)) return false;

    // No generar movimientos contra una cuenta desactivada (el usuario la
    // considera cerrada). La regla sigue activa pero se saltea.
    if (rule.account && (rule.account.is_active === false || rule.account.movement_enabled === false)) return false;

    return true;
  }

  protected async processItem(supabase: ServiceClient, rule: any): Promise<boolean | void> {
    const today = todayYmdAr();
    let created = true;
    try {
      await transactionsService.create({
      requestId: `recurring:${rule.id}:${today}`,
      userId: rule.user_id,
      type: rule.type,
      accountId: rule.account_id,
      amount: rule.amount,
      currency: rule.currency,
      categoryId: rule.category_id,
      description: rule.description,
      transactionDate: `${today}T12:00:00.000Z`,
      isRecurring: true,
      recurringRuleId: rule.id,
      });
    } catch (error) {
      // El índice idx_transactions_recurring_occurrence arbitra la concurrencia.
      // Un error distinto de unicidad NO marca la regla como ejecutada: puede reintentarse.
      if ((error as { code?: string }).code !== '23505') throw error;
      const { data: existing, error: lookupError } = await supabase
        .from('transactions')
        .select('id')
        .eq('user_id', rule.user_id)
        .eq('recurring_rule_id', rule.id)
        .gte('transaction_date', `${today}T03:00:00.000Z`)
        .lt('transaction_date', `${addDaysYmd(today, 1)}T03:00:00.000Z`)
        .maybeSingle();
      if (lookupError) throw lookupError;
      if (!existing) throw error; // No ocultar un conflicto de otro índice.
      created = false;
    }

    // Si esta marca falla tras el INSERT, el siguiente intento encuentra la
    // ocurrencia por su índice único y repara la marca sin un segundo débito.
    const { error: markError } = await supabase
      .from('recurring_rules')
      .update({ last_executed_date: today })
      .eq('id', rule.id)
      .eq('user_id', rule.user_id)
      .or(`last_executed_date.is.null,last_executed_date.lt.${today}`);
    if (markError) throw markError;
    if (!created) return false;

    // Notification and execution marker are committed by the INSERT trigger.
    // Delivery is retried independently by the durable outbox dispatcher.
  }

  protected emptyMessage(): string {
    return 'No active recurring rules';
  }
}
