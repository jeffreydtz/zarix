import { createServiceClientSync } from '@/lib/supabase/server';
import type { Budget, BudgetStatus } from '@/types/database';
import { Telegraf } from 'telegraf';

export interface CreateBudgetInput {
  userId: string;
  categoryId: string | null;
  month: string;
  amount: number;
  currency: string;
  rolloverEnabled?: boolean;
  alertAtPercent?: number;
}

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN || 'placeholder');

class BudgetsService {
  async create(input: CreateBudgetInput): Promise<Budget> {
    const supabase = createServiceClientSync();

    const { data, error } = await supabase
      .from('budgets')
      .insert({
        user_id: input.userId,
        category_id: input.categoryId,
        month: input.month,
        amount: input.amount,
        currency: input.currency,
        rollover_enabled: input.rolloverEnabled || false,
        alert_at_percent: input.alertAtPercent || 80,
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async list(userId: string, month?: string): Promise<Budget[]> {
    const supabase = createServiceClientSync();

    let query = supabase
      .from('budgets')
      .select('*, category:categories(name, icon, type)')
      .eq('user_id', userId)
      .order('month', { ascending: false });

    if (month) {
      query = query.eq('month', month);
    }

    const { data, error } = await query;

    if (error) throw error;
    return data;
  }

  async getStatus(userId: string, month: Date): Promise<BudgetStatus[]> {
    const supabase = createServiceClientSync();

    const monthStr = month.toISOString().split('T')[0].substring(0, 7) + '-01';

    const { data, error } = await supabase.rpc('get_budget_status', {
      p_user_id: userId,
      p_month: monthStr,
    });

    if (error) throw error;
    return data;
  }

  async checkAndSendAlerts(userId: string, categoryId: string | null, month: string): Promise<void> {
    const supabase = createServiceClientSync();

    const budgetStatus = await this.getStatus(userId, new Date(month));
    const status = budgetStatus.find((s) => s.category_id === categoryId);

    if (!status) return;

    // Get the budget record to find the budget ID and alert threshold
    const { data: budget } = await supabase
      .from('budgets')
      .select('*')
      .eq('user_id', userId)
      .eq('category_id', categoryId)
      .eq('month', month)
      .single();

    if (!budget) return;

    const percentUsed = Number(status.percent_used);
    const alertThreshold = budget.alert_at_percent;

    // Check if we already sent an alert at this level
    const alertLevels = [100, alertThreshold].filter((l, i, a) => a.indexOf(l) === i);
    
    for (const alertLevel of alertLevels) {
      if (percentUsed >= alertLevel) {
        const { data: existingAlerts } = await supabase
          .from('budget_alerts')
          .select('*')
          .eq('budget_id', budget.id)
          .gte('percent_reached', alertLevel)
          .order('sent_at', { ascending: false })
          .limit(1);

        const alertAlreadySent = existingAlerts && existingAlerts.length > 0;
        
        if (!alertAlreadySent) {
          // Save alert record
          await supabase.from('budget_alerts').insert({
            budget_id: budget.id,
            percent_reached: Math.floor(percentUsed),
          });

          // Send Telegram notification
          await this.sendBudgetAlert(userId, status, alertLevel);
        }
      }
    }
  }

  private async sendBudgetAlert(
    userId: string,
    status: BudgetStatus,
    alertLevel: number
  ): Promise<void> {
    const supabase = createServiceClientSync();

    const { data: user } = await supabase
      .from('users')
      .select('telegram_chat_id')
      .eq('id', userId)
      .single();

    if (!user?.telegram_chat_id) return;

    const isOver = alertLevel >= 100;
    const emoji = isOver ? '🔴' : '⚠️';
    const title = isOver ? 'PRESUPUESTO SUPERADO' : 'ALERTA DE PRESUPUESTO';

    const message = 
      `${emoji} *${title}*\n\n` +
      `Categoría: *${status.category_name}*\n` +
      `Presupuesto: $${Number(status.budget_amount).toLocaleString('es-AR')}\n` +
      `Gastado: $${Number(status.spent_amount).toLocaleString('es-AR')} (${Math.floor(Number(status.percent_used))}%)\n` +
      `Restante: $${Number(status.remaining_amount).toLocaleString('es-AR')}\n\n` +
      (isOver 
        ? `¡Superaste el límite! Revisá tus gastos de ${status.category_name.toLowerCase()} este mes.`
        : `Llegaste al ${alertLevel}% de tu presupuesto en ${status.category_name.toLowerCase()}.`);

    try {
      await bot.telegram.sendMessage(user.telegram_chat_id, message, {
        parse_mode: 'Markdown',
      });
    } catch (e) {
      console.error('Error sending budget alert via Telegram:', e);
    }
  }

  async update(
    id: string,
    userId: string,
    updates: Record<string, any>
  ): Promise<Budget> {
    const supabase = createServiceClientSync();

    const { data, error } = await supabase
      .from('budgets')
      .update(updates)
      .eq('id', id)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async delete(id: string, userId: string): Promise<void> {
    const supabase = createServiceClientSync();

    const { error } = await supabase
      .from('budgets')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);

    if (error) throw error;
  }

  async checkAllBudgetsForUser(userId: string): Promise<void> {
    const supabase = createServiceClientSync();
    const now = new Date();
    const monthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;

    const { data: budgets } = await supabase
      .from('budgets')
      .select('*')
      .eq('user_id', userId)
      .eq('month', monthStr);

    if (!budgets) return;

    for (const budget of budgets) {
      await this.checkAndSendAlerts(userId, budget.category_id, monthStr);
    }
  }
}

export const budgetsService = new BudgetsService();
