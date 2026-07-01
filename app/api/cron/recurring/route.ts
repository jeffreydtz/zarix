import { NextRequest } from 'next/server';
import { IterativeCronJob, ServiceClient } from '@/lib/cron/cron-job';
import { transactionsService } from '@/lib/services/transactions';
import { sendTelegramDm } from '@/lib/telegram/send';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function shouldExecuteToday(rule: any): boolean {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const startDate = new Date(rule.start_date);
  startDate.setHours(0, 0, 0, 0);

  // Don't execute before start date
  if (today < startDate) return false;

  // Don't execute after end date
  if (rule.end_date) {
    const endDate = new Date(rule.end_date);
    endDate.setHours(0, 0, 0, 0);
    if (today > endDate) return false;
  }

  // Check if already executed today
  if (rule.last_executed_date) {
    const lastExec = new Date(rule.last_executed_date);
    lastExec.setHours(0, 0, 0, 0);
    if (lastExec.getTime() === today.getTime()) return false;
  }

  const frequency = rule.frequency;

  if (frequency === 'daily') return true;

  if (frequency === 'weekly') {
    const dayOfWeek = startDate.getDay();
    return today.getDay() === dayOfWeek;
  }

  if (frequency === 'monthly') {
    // Clamp al último día del mes: una regla del 31 debe ejecutarse el 30/28
    // en meses más cortos en vez de saltearse el mes entero.
    const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
    const targetDay = Math.min(startDate.getDate(), lastDay);
    return today.getDate() === targetDay;
  }

  if (frequency === 'yearly') {
    if (today.getMonth() !== startDate.getMonth()) return false;
    const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
    const targetDay = Math.min(startDate.getDate(), lastDay); // 29/2 → 28/2 en años no bisiestos
    return today.getDate() === targetDay;
  }

  return false;
}

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

  protected async processItem(supabase: ServiceClient, rule: any): Promise<void> {
    // "Reclamamos" el día ANTES de crear: si la creación o un retry fallan a
    // medias, el próximo cron del mismo día ve last_executed_date == hoy y NO
    // vuelve a crear. Un duplicado de plata es peor que saltear una ocurrencia.
    await supabase
      .from('recurring_rules')
      .update({ last_executed_date: new Date().toISOString().split('T')[0] })
      .eq('id', rule.id);

    await transactionsService.create({
      userId: rule.user_id,
      type: rule.type,
      accountId: rule.account_id,
      amount: rule.amount,
      currency: rule.currency,
      categoryId: rule.category_id,
      description: rule.description,
      transactionDate: new Date().toISOString(),
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
