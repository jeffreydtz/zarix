import { createServiceClientSync } from '@/lib/supabase/server';
import {
  buildToArsConverter,
  type TransactionWithCategory,
} from '@/lib/services/transactions';

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

    const { data, error } = await supabase
      .from('transactions')
      .select('amount, currency, category_id, category:categories(name, icon), account:accounts!transactions_account_id_fkey(is_active)')
      .eq('user_id', userId)
      .eq('type', type)
      .gte('transaction_date', startDate.toISOString())
      .lte('transaction_date', endDate.toISOString());

    if (error || !data) return [];
    const rows = data.filter((t: any) => t.account?.is_active !== false);
    const { toArs } = await buildToArsConverter(rows);
    const byCat = new Map<string, { name: string; icon: string; amount: number; count: number }>();
    for (const t of rows) {
      const cat = t.category as { name?: string; icon?: string } | null;
      const key = String(t.category_id || 'none');
      const cur = byCat.get(key) || {
        name: cat?.name || 'Sin categoría',
        icon: cat?.icon || '❓',
        amount: 0,
        count: 0,
      };
      cur.amount += toArs(t);
      cur.count += 1;
      byCat.set(key, cur);
    }
    const normalized = Array.from(byCat.values()).sort((a, b) => b.amount - a.amount);
    const total = normalized.reduce((sum, item) => sum + item.amount, 0);

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

    const { data, error } = await supabase
      .from('transactions')
      .select('amount, currency, type, transaction_date, account:accounts!transactions_account_id_fkey(is_active)')
      .eq('user_id', userId)
      .in('type', ['expense', 'income'])
      .gte('transaction_date', startRange.toISOString())
      .lte('transaction_date', endRange.toISOString());
    if (error || !data) return [];
    const rows = data.filter((t: any) => t.account?.is_active !== false);
    const { toArs } = await buildToArsConverter(rows);
    const byMonth = new Map<string, { expenses: number; income: number }>();
    for (let i = 0; i < months; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - (months - 1 - i), 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      byMonth.set(key, { expenses: 0, income: 0 });
    }
    for (const t of rows) {
      const d = new Date(t.transaction_date);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const bucket = byMonth.get(key);
      if (!bucket) continue;
      if (t.type === 'expense') bucket.expenses += toArs(t);
      else bucket.income += toArs(t);
    }
    return Array.from(byMonth.entries()).map(([key, v]) => {
      const [year, monthStr] = key.split('-');
      const month = Number(monthStr) - 1;
      return {
        month: key,
        monthLabel: `${monthNames[month]} ${year.slice(2)}`,
        expenses: v.expenses,
        income: v.income,
        balance: v.income - v.expenses,
      };
    });
  }
  
  async getDailyTrend(userId: string, days: number = 30): Promise<DailyData[]> {
    const supabase = createServiceClientSync();
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days + 1);

    const { data, error } = await supabase
      .from('transactions')
      .select('amount, currency, type, transaction_date, account:accounts!transactions_account_id_fkey(is_active)')
      .eq('user_id', userId)
      .in('type', ['expense', 'income'])
      .gte('transaction_date', startDate.toISOString())
      .lte('transaction_date', endDate.toISOString());
    if (error || !data) return [];
    const rows = data.filter((t: any) => t.account?.is_active !== false);
    const { toArs } = await buildToArsConverter(rows);
    const byDay = new Map<string, { expenses: number; income: number }>();
    for (const t of rows) {
      const dateStr = String(t.transaction_date).slice(0, 10);
      const bucket = byDay.get(dateStr) || { expenses: 0, income: 0 };
      if (t.type === 'expense') bucket.expenses += toArs(t);
      else bucket.income += toArs(t);
      byDay.set(dateStr, bucket);
    }
    return Array.from(byDay.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([dateStr, v]) => {
        const date = new Date(`${dateStr}T12:00:00Z`);
        return {
          date: dateStr,
          dayLabel: `${date.getUTCDate()}/${date.getUTCMonth() + 1}`,
          expenses: v.expenses,
          income: v.income,
        };
      });
  }
  
  async getAccountBreakdown(
    userId: string,
    startDate: Date,
    endDate: Date
  ): Promise<AccountBreakdown[]> {
    const supabase = createServiceClientSync();

    const { data, error } = await supabase
      .from('transactions')
      .select('amount, currency, account_id, account:accounts!transactions_account_id_fkey(name, icon, color, is_active)')
      .eq('user_id', userId)
      .eq('type', 'expense')
      .gte('transaction_date', startDate.toISOString())
      .lte('transaction_date', endDate.toISOString());

    if (error || !data) return [];
    const rows = data.filter((t: any) => t.account?.is_active !== false);
    const { toArs } = await buildToArsConverter(rows);
    const byAcc = new Map<string, { name: string; icon: string; color: string; amount: number }>();
    for (const t of rows) {
      const acc = t.account as { name?: string; icon?: string; color?: string } | null;
      const key = String(t.account_id || 'none');
      const cur = byAcc.get(key) || {
        name: acc?.name || 'Sin cuenta',
        icon: acc?.icon || '💳',
        color: acc?.color || '#6B7280',
        amount: 0,
      };
      cur.amount += toArs(t);
      byAcc.set(key, cur);
    }
    const normalized = Array.from(byAcc.values());
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
      .eq('user_id', userId)
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
