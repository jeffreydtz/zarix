import { NextRequest } from 'next/server';
import { IterativeCronJob, ServiceClient } from '@/lib/cron/cron-job';
import { shouldExecuteToday, todayYmdAr } from '@/lib/cron/recurring-schedule';
import { transactionsService } from '@/lib/services/transactions';
import { sendTelegramDm } from '@/lib/telegram/send';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

class RecurringRulesJob extends IterativeCronJob<any> {
  readonly name = 'recurring';

  protected async fetchItems(supabase: ServiceClient): Promise<any[]> {
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
    // "Reclamamos" el día ANTES de crear: si la creación o un retry fallan a
    // medias, el próximo cron del mismo día ve last_executed_date == hoy y NO
    // vuelve a crear. Un duplicado de plata es peor que saltear una ocurrencia.
    const today = todayYmdAr();
    const { data: claimed, error: claimErr } = await supabase
      .from('recurring_rules')
      .update({ last_executed_date: today })
      .eq('id', rule.id)
      .or(`last_executed_date.is.null,last_executed_date.lt.${today}`)
      .select('id')
      .maybeSingle();
    if (claimErr) throw claimErr;
    if (!claimed) return false;

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
      ).catch(() => {});
    }
  }

  protected emptyMessage(): string {
    return 'No active recurring rules';
  }
}

export async function GET(request: NextRequest) {
  return new RecurringRulesJob().run(request);
}
