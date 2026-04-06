import { createServiceClientSync } from '@/lib/supabase/server';
import { applyArchivedAccountsTransactionFilter } from '@/lib/services/transactions';

export interface CategoryBreakdown {
  name: string;
  icon: string;
  amount: number;
  count: number;
  percent: number;
  color: string;
}

export interface MonthlyData {
  month: string;
  monthLabel: string;
  expenses: number;
  income: number;
  balance: number;
}

export interface DailyData {
  date: string;
  dayLabel: string;
  expenses: number;
  income: number;
}

export interface AccountBreakdown {
  name: string;
  icon: string;
  amount: number;
  percent: number;
  color: string;
}

const CATEGORY_COLORS = [
  '#EF4444', '#F97316', '#EAB308', '#22C55E', '#14B8A6',
  '#06B6D4', '#3B82F6', '#6366F1', '#8B5CF6', '#EC4899',
  '#F43F5E', '#84CC16', '#10B981', '#0EA5E9', '#A855F7'
];

class AnalyticsService {
  async getCategoryBreakdown(
    userId: string,
    startDate: Date,
    endDate: Date,
    type: 'expense' | 'income' = 'expense'
  ): Promise<CategoryBreakdown[]> {
    const supabase = createServiceClientSync();
    
    let q = supabase
      .from('transactions')
      .select('amount_in_account_currency, category:categories(name, icon)')
      .eq('user_id', userId)
      .eq('type', type)
      .gte('transaction_date', startDate.toISOString())
      .lte('transaction_date', endDate.toISOString());
    q = await applyArchivedAccountsTransactionFilter(q, userId);
    const { data: transactions } = await q;

    if (!transactions) return [];
    
    const categoryMap = new Map<string, { name: string; icon: string; amount: number; count: number }>();
    let total = 0;
    
    transactions.forEach(t => {
      const cat = t.category as unknown as { name: string; icon: string } | null;
      const catName = cat?.name || 'Sin categoría';
      const catIcon = cat?.icon || '❓';
      const amount = Number(t.amount_in_account_currency);
      
      const existing = categoryMap.get(catName) || { name: catName, icon: catIcon, amount: 0, count: 0 };
      existing.amount += amount;
      existing.count += 1;
      categoryMap.set(catName, existing);
      total += amount;
    });
    
    return Array.from(categoryMap.values())
      .sort((a, b) => b.amount - a.amount)
      .map((cat, index) => ({
        ...cat,
        percent: total > 0 ? (cat.amount / total) * 100 : 0,
        color: CATEGORY_COLORS[index % CATEGORY_COLORS.length]
      }));
  }
  
  async getMonthlyTrend(userId: string, months: number = 6): Promise<MonthlyData[]> {
    const supabase = createServiceClientSync();
    const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

    const now = new Date();
    const startRange = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1);
    const endRange = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

    let qMonth = supabase
      .from('transactions')
      .select('type, amount_in_account_currency, transaction_date')
      .eq('user_id', userId)
      .gte('transaction_date', startRange.toISOString())
      .lte('transaction_date', endRange.toISOString());
    qMonth = await applyArchivedAccountsTransactionFilter(qMonth, userId);
    const { data: transactions } = await qMonth;

    const bucket = new Map<string, { expenses: number; income: number }>();
    for (let i = months - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      bucket.set(key, { expenses: 0, income: 0 });
    }

    (transactions || []).forEach((t) => {
      const d = new Date(t.transaction_date);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const entry = bucket.get(key);
      if (!entry) return;
      const amount = Number(t.amount_in_account_currency);
      if (t.type === 'expense') entry.expenses += amount;
      else if (t.type === 'income') entry.income += amount;
    });

    const result: MonthlyData[] = [];
    bucket.forEach((v, key) => {
      const [year, monthStr] = key.split('-');
      const month = Number(monthStr) - 1;
      result.push({
        month: key,
        monthLabel: `${monthNames[month]} ${year.slice(2)}`,
        expenses: v.expenses,
        income: v.income,
        balance: v.income - v.expenses,
      });
    });

    return result;
  }
  
  async getDailyTrend(userId: string, days: number = 30): Promise<DailyData[]> {
    const supabase = createServiceClientSync();
    const result: DailyData[] = [];
    
    const dayNames = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days + 1);
    
    let qDay = supabase
      .from('transactions')
      .select('type, amount_in_account_currency, transaction_date')
      .eq('user_id', userId)
      .gte('transaction_date', startDate.toISOString())
      .lte('transaction_date', endDate.toISOString());
    qDay = await applyArchivedAccountsTransactionFilter(qDay, userId);
    const { data: transactions } = await qDay;

    const dailyMap = new Map<string, { expenses: number; income: number }>();
    
    for (let i = 0; i < days; i++) {
      const date = new Date(startDate);
      date.setDate(date.getDate() + i);
      const key = date.toISOString().split('T')[0];
      dailyMap.set(key, { expenses: 0, income: 0 });
    }
    
    (transactions || []).forEach(t => {
      const dateKey = t.transaction_date.split('T')[0];
      const existing = dailyMap.get(dateKey);
      if (existing) {
        const amount = Number(t.amount_in_account_currency);
        if (t.type === 'expense') existing.expenses += amount;
        else if (t.type === 'income') existing.income += amount;
      }
    });
    
    dailyMap.forEach((data, dateStr) => {
      const date = new Date(dateStr);
      result.push({
        date: dateStr,
        dayLabel: `${date.getDate()}/${date.getMonth() + 1}`,
        expenses: data.expenses,
        income: data.income
      });
    });
    
    return result;
  }
  
  async getAccountBreakdown(
    userId: string,
    startDate: Date,
    endDate: Date
  ): Promise<AccountBreakdown[]> {
    const supabase = createServiceClientSync();
    
    let qAcc = supabase
      .from('transactions')
      .select('amount_in_account_currency, account:accounts!transactions_account_id_fkey(name, icon, color)')
      .eq('user_id', userId)
      .eq('type', 'expense')
      .gte('transaction_date', startDate.toISOString())
      .lte('transaction_date', endDate.toISOString());
    qAcc = await applyArchivedAccountsTransactionFilter(qAcc, userId);
    const { data: transactions } = await qAcc;

    if (!transactions) return [];
    
    const accountMap = new Map<string, { name: string; icon: string; amount: number; color: string }>();
    let total = 0;
    
    transactions.forEach(t => {
      const acc = t.account as unknown as { name: string; icon: string; color: string } | null;
      const accName = acc?.name || 'Sin cuenta';
      const accIcon = acc?.icon || '💳';
      const accColor = acc?.color || '#6B7280';
      const amount = Number(t.amount_in_account_currency);
      
      const existing = accountMap.get(accName) || { name: accName, icon: accIcon, amount: 0, color: accColor };
      existing.amount += amount;
      accountMap.set(accName, existing);
      total += amount;
    });
    
    return Array.from(accountMap.values())
      .sort((a, b) => b.amount - a.amount)
      .map(acc => ({
        ...acc,
        percent: total > 0 ? (acc.amount / total) * 100 : 0
      }));
  }
  
  async getTopExpenses(
    userId: string,
    startDate: Date,
    endDate: Date,
    limit: number = 10
  ) {
    const supabase = createServiceClientSync();
    
    let qTop = supabase
      .from('transactions')
      .select('*, category:categories(name, icon), account:accounts!transactions_account_id_fkey(name)')
      .eq('user_id', userId)
      .eq('type', 'expense')
      .gte('transaction_date', startDate.toISOString())
      .lte('transaction_date', endDate.toISOString())
      .order('amount_in_account_currency', { ascending: false })
      .limit(limit);
    qTop = await applyArchivedAccountsTransactionFilter(qTop, userId);
    const { data } = await qTop;

    return data || [];
  }
  
  async getAverages(userId: string) {
    const monthlyData = await this.getMonthlyTrend(userId, 6);
    
    if (monthlyData.length === 0) {
      return { avgExpenses: 0, avgIncome: 0, avgBalance: 0 };
    }
    
    const totalExpenses = monthlyData.reduce((sum, m) => sum + m.expenses, 0);
    const totalIncome = monthlyData.reduce((sum, m) => sum + m.income, 0);
    const totalBalance = monthlyData.reduce((sum, m) => sum + m.balance, 0);
    
    return {
      avgExpenses: totalExpenses / monthlyData.length,
      avgIncome: totalIncome / monthlyData.length,
      avgBalance: totalBalance / monthlyData.length
    };
  }
}

export const analyticsService = new AnalyticsService();
