import { createServiceClientSync } from '@/lib/supabase/server';

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
    
    const { data: transactions } = await supabase
      .from('transactions')
      .select('amount_in_account_currency, category:categories(name, icon)')
      .eq('user_id', userId)
      .eq('type', type)
      .gte('transaction_date', startDate.toISOString())
      .lte('transaction_date', endDate.toISOString());
    
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
    const result: MonthlyData[] = [];
    
    const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    
    for (let i = months - 1; i >= 0; i--) {
      const date = new Date();
      date.setMonth(date.getMonth() - i);
      const year = date.getFullYear();
      const month = date.getMonth();
      
      const startDate = new Date(year, month, 1);
      const endDate = new Date(year, month + 1, 0, 23, 59, 59);
      
      const { data: transactions } = await supabase
        .from('transactions')
        .select('type, amount_in_account_currency')
        .eq('user_id', userId)
        .gte('transaction_date', startDate.toISOString())
        .lte('transaction_date', endDate.toISOString());
      
      let expenses = 0;
      let income = 0;
      
      (transactions || []).forEach(t => {
        const amount = Number(t.amount_in_account_currency);
        if (t.type === 'expense') expenses += amount;
        else if (t.type === 'income') income += amount;
      });
      
      result.push({
        month: `${year}-${String(month + 1).padStart(2, '0')}`,
        monthLabel: `${monthNames[month]} ${year.toString().slice(2)}`,
        expenses,
        income,
        balance: income - expenses
      });
    }
    
    return result;
  }
  
  async getDailyTrend(userId: string, days: number = 30): Promise<DailyData[]> {
    const supabase = createServiceClientSync();
    const result: DailyData[] = [];
    
    const dayNames = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days + 1);
    
    const { data: transactions } = await supabase
      .from('transactions')
      .select('type, amount_in_account_currency, transaction_date')
      .eq('user_id', userId)
      .gte('transaction_date', startDate.toISOString())
      .lte('transaction_date', endDate.toISOString());
    
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
    
    const { data: transactions } = await supabase
      .from('transactions')
      .select('amount_in_account_currency, account:accounts!transactions_account_id_fkey(name, icon, color)')
      .eq('user_id', userId)
      .eq('type', 'expense')
      .gte('transaction_date', startDate.toISOString())
      .lte('transaction_date', endDate.toISOString());
    
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
    
    const { data } = await supabase
      .from('transactions')
      .select('*, category:categories(name, icon), account:accounts!transactions_account_id_fkey(name)')
      .eq('user_id', userId)
      .eq('type', 'expense')
      .gte('transaction_date', startDate.toISOString())
      .lte('transaction_date', endDate.toISOString())
      .order('amount_in_account_currency', { ascending: false })
      .limit(limit);
    
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
