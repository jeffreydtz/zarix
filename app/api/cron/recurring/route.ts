import { NextRequest } from 'next/server';
import { IterativeCronJob, ServiceClient } from '@/lib/cron/cron-job';
import { transactionsService } from '@/lib/services/transactions';
import { sendTelegramDm } from '@/lib/telegram/send';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function todayYmdAr(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function ymdParts(ymd: string): { y: number; m: number; d: number; dow: number } {
  const [y, m, d] = ymd.slice(0, 10).split('-').map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d, 15, 0, 0)).getUTCDay();
  return { y, m, d, dow };
}

function lastDayOfMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

function shouldExecuteToday(rule: any): boolean {
  const todayYmd = todayYmdAr();
  const today = ymdParts(todayYmd);
  const startYmd = String(rule.start_date || '').slice(0, 10);
  if (!startYmd) return false;
  const start = ymdParts(startYmd);

  if (todayYmd < startYmd) return false;

  if (rule.end_date) {
    const endYmd = String(rule.end_date).slice(0, 10);
    if (todayYmd > endYmd) return false;
  }

  if (rule.last_executed_date && String(rule.last_executed_date).slice(0, 10) === todayYmd) {
    return false;
  }

  const frequency = rule.frequency;

  if (frequency === 'daily') return true;

  if (frequency === 'weekly') {
    return today.dow === start.dow;
  }

  if (frequency === 'monthly') {
    const targetDay = Math.min(start.d, lastDayOfMonth(today.y, today.m));
    return today.d === targetDay;
  }

  if (frequency === 'yearly') {
    if (today.m !== start.m) return false;
    const targetDay = Math.min(start.d, lastDayOfMonth(today.y, today.m));
    return today.d === targetDay;
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
