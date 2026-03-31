import { createServiceClientSync } from '@/lib/supabase/server';
import { cotizacionesService } from './cotizaciones';
import type { Account } from '@/types/database';

export interface CreateAccountInput {
  userId: string;
  name: string;
  type: string;
  currency: string;
  initialBalance?: number;
  icon?: string;
  color?: string;
  isDebt?: boolean;
  includeInTotal?: boolean;
  minBalance?: number;
}

export interface AccountWithBalance extends Account {
  balance_usd?: number;
  balance_ars_blue?: number;
}

class AccountsService {
  async create(input: CreateAccountInput): Promise<Account> {
    const supabase = createServiceClientSync();

    const { data: accounts } = await supabase
      .from('accounts')
      .select('sort_order')
      .eq('user_id', input.userId)
      .order('sort_order', { ascending: false })
      .limit(1);

    const nextSortOrder = accounts && accounts.length > 0 ? accounts[0].sort_order + 1 : 0;

    const { data, error } = await supabase
      .from('accounts')
      .insert({
        user_id: input.userId,
        name: input.name,
        type: input.type as any,
        currency: input.currency,
        balance: input.initialBalance || 0,
        icon: input.icon || null,
        color: input.color || '#3B82F6',
        is_debt: input.isDebt || false,
        include_in_total: input.includeInTotal !== undefined ? input.includeInTotal : true,
        min_balance: input.minBalance || null,
        sort_order: nextSortOrder,
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async list(userId: string): Promise<AccountWithBalance[]> {
    const supabase = createServiceClientSync();

    const { data: accounts, error } = await supabase
      .from('accounts')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true)
      .order('sort_order', { ascending: true });

    if (error) throw error;

    const blueRate = await cotizacionesService.getExchangeRate('USD', 'ARS');
    
    if (blueRate === 0) {
      throw new Error('Exchange rate not available');
    }

    const accountsWithConversion = accounts.map((account) => {
      let balanceUSD = 0;
      let balanceARSBlue = 0;

      if (account.currency === 'ARS') {
        balanceUSD = account.balance / blueRate;
        balanceARSBlue = account.balance;
      } else if (account.currency === 'USD') {
        balanceUSD = account.balance;
        balanceARSBlue = account.balance * blueRate;
      } else {
        balanceUSD = account.balance;
        balanceARSBlue = account.balance * blueRate;
      }

      return {
        ...account,
        balance: Number(account.balance),
        balance_usd: balanceUSD,
        balance_ars_blue: balanceARSBlue,
      };
    });

    return accountsWithConversion;
  }

  async getById(id: string, userId: string): Promise<Account> {
    const supabase = createServiceClientSync();

    const { data, error } = await supabase
      .from('accounts')
      .select('*')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (error) throw error;
    return { ...data, balance: Number(data.balance) };
  }

  async update(
    id: string,
    userId: string,
    updates: Partial<CreateAccountInput>
  ): Promise<Account> {
    const supabase = createServiceClientSync();

    const { data, error } = await supabase
      .from('accounts')
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

    const { data: transactions } = await supabase
      .from('transactions')
      .select('id')
      .eq('account_id', id)
      .limit(1);

    if (transactions && transactions.length > 0) {
      throw new Error('Cannot delete account with transactions');
    }

    const { error } = await supabase
      .from('accounts')
      .update({ is_active: false })
      .eq('id', id)
      .eq('user_id', userId);

    if (error) throw error;
  }

  async getTotalBalance(userId: string) {
    const supabase = createServiceClientSync();

    const { data, error } = await supabase
      .from('accounts')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true);

    if (error) throw error;

    const blueRate = await cotizacionesService.getExchangeRate('USD', 'ARS');
    
    if (blueRate === 0) {
      throw new Error('Exchange rate not available');
    }

    let totalUSD = 0;
    let totalARSBlue = 0;

    for (const account of data) {
      if (!account.include_in_total) continue;

      const balance = Number(account.balance);

      if (account.currency === 'ARS') {
        totalUSD += balance / blueRate;
        totalARSBlue += balance;
      } else if (account.currency === 'USD') {
        totalUSD += balance;
        totalARSBlue += balance * blueRate;
      } else {
        const rateToUSD = await cotizacionesService.getExchangeRate(
          account.currency,
          'USD'
        );
        if (rateToUSD > 0) {
          const balanceUSD = balance * rateToUSD;
          totalUSD += balanceUSD;
          totalARSBlue += balanceUSD * blueRate;
        }
      }
    }

    return {
      totalUSD: Math.round(totalUSD * 100) / 100,
      totalARSBlue: Math.round(totalARSBlue * 100) / 100,
      accountCount: data.length,
    };
  }

  async findByName(userId: string, name: string): Promise<Account | null> {
    const supabase = createServiceClientSync();

    const { data, error } = await supabase
      .from('accounts')
      .select('*')
      .eq('user_id', userId)
      .ilike('name', `%${name}%`)
      .eq('is_active', true)
      .limit(1)
      .single();

    if (error || !data) return null;
    return { ...data, balance: Number(data.balance) };
  }
}

export const accountsService = new AccountsService();
