import { createServiceClientSync } from '@/lib/supabase/server';
import type { TransactionWithCategory } from '@/lib/services/transactions';

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

    const { data, error } = await supabase.rpc('analytics_category_breakdown', {
      p_user_id: userId,
      p_start: startDate.toISOString(),
      p_end: endDate.toISOString(),
      p_type: type,
    });

    if (error || !data) return [];

    const normalized: Array<{ name: string; icon: string; amount: number; count: number }> = data.map((row: any) => ({
      name: String(row.category_name || 'Sin categoría'),
      icon: String(row.category_icon || '❓'),
      amount: Number(row.amount || 0),
      count: Number(row.tx_count || 0),
    }));
    const total = normalized.reduce((sum: number, item) => sum + item.amount, 0);

    return normalized.map((cat, index) => ({
      ...cat,
      percent: total > 0 ? (cat.amount / total) * 100 : 0,
      color: CATEGORY_COLORS[index % CATEGORY_COLORS.length],
    }));
  }
  
  async getMonthlyTrend(userId: string, months: number = 6): Promise<MonthlyData[]> {
    const supabase = createServiceClientSync();
    const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

    const now = new Date();
    const startRange = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1);
    const endRange = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

    const { data, error } = await supabase.rpc('analytics_monthly_trend', {
      p_user_id: userId,
      p_start: startRange.toISOString(),
      p_end: endRange.toISOString(),
    });
    if (error || !data) return [];

    return (data || []).map((row: any) => {
      const key = String(row.month_key);
      const [year, monthStr] = key.split('-');
      const month = Number(monthStr) - 1;
      const expenses = Number(row.expenses || 0);
      const income = Number(row.income || 0);
      return {
        month: key,
        monthLabel: `${monthNames[month]} ${year.slice(2)}`,
        expenses,
        income,
        balance: income - expenses,
      };
    });
  }
  
  async getDailyTrend(userId: string, days: number = 30): Promise<DailyData[]> {
    const supabase = createServiceClientSync();
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days + 1);

    const { data, error } = await supabase.rpc('analytics_daily_trend', {
      p_user_id: userId,
      p_start: startDate.toISOString(),
      p_end: endDate.toISOString(),
    });
    if (error || !data) return [];

    return (data || []).map((row: any) => {
      const dateStr = String(row.day_key);
      const date = new Date(dateStr);
      return {
        date: dateStr,
        dayLabel: `${date.getDate()}/${date.getMonth() + 1}`,
        expenses: Number(row.expenses || 0),
        income: Number(row.income || 0),
      };
    });
  }
  
  async getAccountBreakdown(
    userId: string,
    startDate: Date,
    endDate: Date
  ): Promise<AccountBreakdown[]> {
    const supabase = createServiceClientSync();

    const { data, error } = await supabase.rpc('analytics_account_breakdown', {
      p_user_id: userId,
      p_start: startDate.toISOString(),
      p_end: endDate.toISOString(),
    });

    if (error || !data) return [];
    const normalized: Array<{ name: string; icon: string; color: string; amount: number }> = data.map((row: any) => ({
      name: String(row.account_name || 'Sin cuenta'),
      icon: String(row.account_icon || '💳'),
      color: String(row.account_color || '#6B7280'),
      amount: Number(row.amount || 0),
    }));
    const total = normalized.reduce((sum: number, item) => sum + item.amount, 0);

    return normalized.map((acc) => ({
      ...acc,
      percent: total > 0 ? (acc.amount / total) * 100 : 0,
    }));
  }
  
  async getTopExpenses(
    userId: string,
    startDate: Date,
    endDate: Date,
    limit: number = 10
  ) {
    const supabase = createServiceClientSync();

    const { data: topRows, error } = await supabase.rpc('analytics_top_expenses', {
      p_user_id: userId,
      p_start: startDate.toISOString(),
      p_end: endDate.toISOString(),
      p_limit: limit,
    });
    if (error || !topRows || topRows.length === 0) return [];

    const orderedIds = topRows.map((row: any) => String(row.id));
    const { data: hydrated } = await supabase
      .from('transactions')
      .select('*, category:categories(name, icon), account:accounts!transactions_account_id_fkey(name)')
      .in('id', orderedIds);

    if (!hydrated) return [];
    const byId = new Map(hydrated.map((row: any) => [row.id, row as TransactionWithCategory]));
    return orderedIds
      .map((id: string) => byId.get(id))
      .filter((row: TransactionWithCategory | undefined): row is TransactionWithCategory => Boolean(row));
  }
  
  getAveragesFromMonthly(monthlyData: MonthlyData[]) {
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

  async getAverages(userId: string) {
    const monthlyData = await this.getMonthlyTrend(userId, 6);
    return this.getAveragesFromMonthly(monthlyData);
  }
}

export const analyticsService = new AnalyticsService();
