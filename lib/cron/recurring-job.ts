import { IterativeCronJob, ServiceClient } from '@/lib/cron/cron-job';
import { shouldExecuteToday, todayYmdAr } from '@/lib/cron/recurring-schedule';
import { transactionsService } from '@/lib/services/transactions';
import { addDaysYmd } from '@/lib/transaction-date';
import { sendTelegramDm } from '@/lib/telegram/send';

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
      .select('*, account:accounts(name, currency, is_active)')
      .eq('is_active', true);

    if (error) throw error;
    return rules || [];
  }

  protected shouldProcess(rule: any): boolean {
    if (!shouldExecuteToday(rule)) return false;

    // No generar movimientos contra una cuenta desactivada (el usuario la
    // considera cerrada). La regla sigue activa pero se saltea.
    if (rule.account && rule.account.is_active === false) return false;

    return true;
  }

  protected async processItem(supabase: ServiceClient, rule: any): Promise<boolean | void> {
    const today = todayYmdAr();
    let created = true;
    try {
      await transactionsService.create({
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

    // Send Telegram notification
    const { data: user } = await supabase
      .from('users')
      .select('telegram_chat_id, telegram_bot_token')
      .eq('id', rule.user_id)
      .single();

    if (rule.notification_enabled && user?.telegram_chat_id) {
      const typeEmoji = rule.type === 'expense' ? '💸' : '💰';
      const typeLabel = rule.type === 'expense' ? 'Gasto' : 'Ingreso';
      const freqLabel = {
        daily: 'diario',
        weekly: 'semanal',
        monthly: 'mensual',
        yearly: 'anual',
      }[rule.frequency as string] || rule.frequency;

      await sendTelegramDm(
        user.telegram_chat_id,
        `🔄 *Transacción recurrente ejecutada*\n\n` +
        `${typeEmoji} ${typeLabel} ${freqLabel}: *${rule.description}*\n` +
        `💰 $${Number(rule.amount).toLocaleString('es-AR')} ${rule.currency}`,
        { parse_mode: 'Markdown', botToken: user.telegram_bot_token }
      ).catch((error) => {
        // Un aviso fallido no revierte el movimiento. No hay outbox durable:
        // dejar el fallo visible, sin prometer reentrega ni exactly-once externo.
        console.error(`[cron:recurring] notification failed for rule ${rule.id}:`, error);
      });
    }
  }

  protected emptyMessage(): string {
    return 'No active recurring rules';
  }
}
