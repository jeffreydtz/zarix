import { NextRequest, NextResponse } from 'next/server';
import { createServiceClientSync } from '@/lib/supabase/server';
import { transactionsService } from '@/lib/services/transactions';
import { sendTelegramDm } from '@/lib/telegram/send';
import { verifyCronBearer } from '@/lib/cron-auth';

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
    const dayOfMonth = startDate.getDate();
    return today.getDate() === dayOfMonth;
  }

  if (frequency === 'yearly') {
    return (
      today.getDate() === startDate.getDate() &&
      today.getMonth() === startDate.getMonth()
    );
  }

  return false;
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (!verifyCronBearer(authHeader, process.env.CRON_SECRET)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServiceClientSync();

  // Get all active recurring rules with their accounts
  const { data: rules, error } = await supabase
    .from('recurring_rules')
    .select('*, account:accounts(name, currency, is_active)')
    .eq('is_active', true);

  if (error) {
    console.error('Error fetching recurring rules:', error);
    return NextResponse.json({ error: 'DB error' }, { status: 500 });
  }

  if (!rules || rules.length === 0) {
    return NextResponse.json({ message: 'No active recurring rules', executed: 0 });
  }

  let executed = 0;
  let errors = 0;

  for (const rule of rules) {
    if (!shouldExecuteToday(rule)) continue;

    try {
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

      // Update last_executed_date
      await supabase
        .from('recurring_rules')
        .update({ last_executed_date: new Date().toISOString().split('T')[0] })
        .eq('id', rule.id);

      executed++;

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
    } catch (e) {
      console.error(`Error executing rule ${rule.id}:`, e);
      errors++;
    }
  }

  return NextResponse.json({
    success: true,
    total: rules.length,
    executed,
    errors,
  });
}
