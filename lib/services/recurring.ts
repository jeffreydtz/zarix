import { createServiceClientSync } from '@/lib/supabase/server';
import type { RecurrenceFrequency, RecurringRule, TransactionType } from '@/types/database';

export interface CreateRecurringInput {
  userId: string;
  accountId: string;
  type: TransactionType;
  amount: number;
  currency: string;
  categoryId?: string | null;
  description: string;
  frequency: RecurrenceFrequency;
  /** YYYY-MM-DD de la primera ocurrencia. */
  startDate: string;
  endDate?: string | null;
}

export type RecurringRuleWithRelations = RecurringRule & {
  account: { name: string; currency: string } | null;
  category: { name: string } | null;
};

class RecurringService {
  async listActive(userId: string): Promise<RecurringRuleWithRelations[]> {
    const supabase = createServiceClientSync();

    const { data, error } = await supabase
      .from('recurring_rules')
      .select('*, category:categories(name), account:accounts(name, currency)')
      .eq('user_id', userId)
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data ?? [];
  }

  async create(input: CreateRecurringInput): Promise<RecurringRule> {
    const supabase = createServiceClientSync();

    const { data, error } = await supabase
      .from('recurring_rules')
      .insert({
        user_id: input.userId,
        account_id: input.accountId,
        type: input.type,
        amount: input.amount,
        currency: input.currency,
        category_id: input.categoryId || null,
        description: input.description,
        is_subscription: false,
        subscription_name: null,
        subscription_plan: null,
        notification_enabled: true,
        frequency: input.frequency,
        start_date: input.startDate,
        end_date: input.endDate || null,
        is_active: true,
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  }
}

export const recurringService = new RecurringService();
