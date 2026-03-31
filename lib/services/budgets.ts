import { createServiceClientSync } from '@/lib/supabase/server';
import type { Budget, BudgetStatus } from '@/types/database';

export interface CreateBudgetInput {
  userId: string;
  categoryId: string | null;
  month: string;
  amount: number;
  currency: string;
  rolloverEnabled?: boolean;
  alertAtPercent?: number;
}

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
      .select('*')
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

  async checkAndSendAlerts(userId: string, categoryId: string, month: string): Promise<void> {
    const supabase = createServiceClientSync();

    const budgetStatus = await this.getStatus(userId, new Date(month));
    const status = budgetStatus.find((s) => s.category_id === categoryId);

    if (!status) return;

    const { data: existingAlerts } = await supabase
      .from('budget_alerts')
      .select('*')
      .eq('budget_id', categoryId)
      .gte('percent_reached', Math.floor(status.percent_used));

    if (existingAlerts && existingAlerts.length > 0) {
      return;
    }

    const budget = await supabase
      .from('budgets')
      .select('*')
      .eq('user_id', userId)
      .eq('category_id', categoryId)
      .eq('month', month)
      .single();

    if (budget.error || !budget.data) return;

    if (status.percent_used >= budget.data.alert_at_percent) {
      await supabase.from('budget_alerts').insert({
        budget_id: budget.data.id,
        percent_reached: Math.floor(status.percent_used),
      });
    }
  }

  async update(
    id: string,
    userId: string,
    updates: Partial<CreateBudgetInput>
  ): Promise<Budget> {
    const supabase = createServiceClientSync();

    const { data, error } = await supabase
      .from('budgets')
      .update(updates as any)
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
}

export const budgetsService = new BudgetsService();
