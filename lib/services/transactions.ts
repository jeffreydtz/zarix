import { createServiceClient } from '@/lib/supabase/server';
import { cotizacionesService } from './cotizaciones';
import type { Transaction, Account } from '@/types/database';

export interface CreateTransactionInput {
  userId: string;
  type: 'expense' | 'income' | 'transfer' | 'adjustment';
  accountId: string;
  destinationAccountId?: string;
  amount: number;
  currency: string;
  categoryId?: string;
  description?: string;
  notes?: string;
  tags?: string[];
  transactionDate?: string;
  installments?: number;
}

export interface TransactionWithCategory extends Transaction {
  category?: {
    name: string;
    icon: string;
  };
  account?: {
    name: string;
    currency: string;
  };
}

class TransactionsService {
  async create(input: CreateTransactionInput): Promise<Transaction> {
    const supabase = await createServiceClient();

    const account = await supabase
      .from('accounts')
      .select('*')
      .eq('id', input.accountId)
      .single();

    if (account.error || !account.data) {
      throw new Error('Account not found');
    }

    let exchangeRate = 1;
    let amountInAccountCurrency = input.amount;

    if (input.currency !== account.data.currency) {
      exchangeRate = await cotizacionesService.getExchangeRate(
        input.currency,
        account.data.currency
      );
      amountInAccountCurrency = input.amount * exchangeRate;
    }

    if (input.installments && input.installments > 1) {
      const { data, error } = await supabase.rpc('create_installment_transactions', {
        p_user_id: input.userId,
        p_account_id: input.accountId,
        p_total_amount: input.amount,
        p_currency: input.currency,
        p_installments: input.installments,
        p_category_id: input.categoryId || null,
        p_description: input.description || 'Compra en cuotas',
        p_start_date: input.transactionDate || new Date().toISOString(),
      });

      if (error) throw error;

      const firstInstallment = await supabase
        .from('transactions')
        .select('*')
        .eq('installment_group_id', data)
        .eq('installment_number', 1)
        .single();

      if (firstInstallment.error) throw firstInstallment.error;
      return firstInstallment.data;
    }

    if (input.type === 'transfer' && input.destinationAccountId) {
      const destAccount = await supabase
        .from('accounts')
        .select('*')
        .eq('id', input.destinationAccountId)
        .single();

      if (destAccount.error || !destAccount.data) {
        throw new Error('Destination account not found');
      }

      let transferExchangeRate = 1;
      if (input.currency !== destAccount.data.currency) {
        transferExchangeRate = await cotizacionesService.getExchangeRate(
          input.currency,
          destAccount.data.currency
        );
      }

      const { data, error } = await supabase
        .from('transactions')
        .insert({
          user_id: input.userId,
          type: 'transfer',
          account_id: input.accountId,
          destination_account_id: input.destinationAccountId,
          amount: input.amount,
          currency: input.currency,
          amount_in_account_currency: amountInAccountCurrency,
          exchange_rate: transferExchangeRate !== 1 ? transferExchangeRate : null,
          description: input.description || 'Transferencia entre cuentas',
          transaction_date: input.transactionDate || new Date().toISOString(),
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    }

    const { data, error } = await supabase
      .from('transactions')
      .insert({
        user_id: input.userId,
        type: input.type,
        account_id: input.accountId,
        amount: input.amount,
        currency: input.currency,
        amount_in_account_currency: amountInAccountCurrency,
        exchange_rate: exchangeRate !== 1 ? exchangeRate : null,
        category_id: input.categoryId || null,
        description: input.description || null,
        notes: input.notes || null,
        tags: input.tags || null,
        transaction_date: input.transactionDate || new Date().toISOString(),
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async list(
    userId: string,
    options: {
      accountId?: string;
      categoryId?: string;
      type?: string;
      startDate?: string;
      endDate?: string;
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<TransactionWithCategory[]> {
    const supabase = await createServiceClient();

    let query = supabase
      .from('transactions')
      .select(
        `
        *,
        category:categories(name, icon),
        account:accounts(name, currency)
      `
      )
      .eq('user_id', userId)
      .order('transaction_date', { ascending: false });

    if (options.accountId) {
      query = query.eq('account_id', options.accountId);
    }

    if (options.categoryId) {
      query = query.eq('category_id', options.categoryId);
    }

    if (options.type) {
      query = query.eq('type', options.type);
    }

    if (options.startDate) {
      query = query.gte('transaction_date', options.startDate);
    }

    if (options.endDate) {
      query = query.lte('transaction_date', options.endDate);
    }

    query = query.limit(options.limit || 50);

    if (options.offset) {
      query = query.range(options.offset, options.offset + (options.limit || 50) - 1);
    }

    const { data, error } = await query;

    if (error) throw error;
    return data as TransactionWithCategory[];
  }

  async getById(id: string, userId: string): Promise<TransactionWithCategory> {
    const supabase = await createServiceClient();

    const { data, error } = await supabase
      .from('transactions')
      .select(
        `
        *,
        category:categories(name, icon),
        account:accounts(name, currency)
      `
      )
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (error) throw error;
    return data as TransactionWithCategory;
  }

  async delete(id: string, userId: string): Promise<void> {
    const supabase = await createServiceClient();

    const { error } = await supabase
      .from('transactions')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);

    if (error) throw error;
  }

  async getMonthSummary(userId: string, month: Date) {
    const supabase = await createServiceClient();

    const startOfMonth = new Date(month.getFullYear(), month.getMonth(), 1);
    const endOfMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0, 23, 59, 59);

    const { data: transactions, error } = await supabase
      .from('transactions')
      .select('*, category:categories(name, icon)')
      .eq('user_id', userId)
      .gte('transaction_date', startOfMonth.toISOString())
      .lte('transaction_date', endOfMonth.toISOString());

    if (error) throw error;

    const expenses = transactions.filter((t) => t.type === 'expense');
    const income = transactions.filter((t) => t.type === 'income');

    const totalExpenses = expenses.reduce((sum, t) => sum + t.amount_in_account_currency, 0);
    const totalIncome = income.reduce((sum, t) => sum + t.amount_in_account_currency, 0);

    const categoryMap = new Map<string, { name: string; icon: string; amount: number }>();
    expenses.forEach((t) => {
      if (t.category) {
        const cat = t.category as { name: string; icon: string };
        const existing = categoryMap.get(cat.name) || { name: cat.name, icon: cat.icon, amount: 0 };
        existing.amount += t.amount_in_account_currency;
        categoryMap.set(cat.name, existing);
      }
    });

    const topCategories = Array.from(categoryMap.values())
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5);

    return {
      totalExpenses,
      totalIncome,
      balance: totalIncome - totalExpenses,
      topCategories,
      transactionCount: transactions.length,
    };
  }
}

export const transactionsService = new TransactionsService();
