import { createServiceClientSync } from '@/lib/supabase/server';
import { readAllPages } from '@/lib/supabase-paginated-read';
import {
  buildToArsConverter,
  type TransactionWithCategory,
} from '@/lib/services/transactions';
import {
  eachYmdInclusive,
  monthKeysInclusive,
  transactionCivilYmd,
  ymdToQueryEndIso,
  ymdToQueryStartIso,
} from '@/lib/transaction-date';

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

const MONTH_NAMES_SHORT = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

function monthLabelFromKey(key: string): string {
  const [year, monthStr] = key.split('-');
  const month = Number(monthStr) - 1;
  return `${MONTH_NAMES_SHORT[month] ?? monthStr} ${year.slice(2)}`;
}

function dayLabelFromYmd(ymd: string): string {
  const day = Number(ymd.slice(8, 10));
  const month = Number(ymd.slice(5, 7));
  return `${day}/${month}`;
}

class AnalyticsService {
  async getCategoryBreakdown(
    userId: string,
    startYmd: string,
    endYmd: string,
    type: 'expense' | 'income' = 'expense'
  ): Promise<CategoryBreakdown[]> {
    const supabase = createServiceClientSync();

    const data = await readAllPages((from, to) => supabase
      .from('transactions')
      .select('amount, currency, category_id, category:categories(name, icon), account:accounts!transactions_account_id_fkey(is_active)')
      .eq('user_id', userId)
      .eq('type', type)
      .gte('transaction_date', ymdToQueryStartIso(startYmd))
      .lte('transaction_date', ymdToQueryEndIso(endYmd))
      .order('transaction_date', { ascending: true })
      .order('id', { ascending: true })
      .range(from, to));

    const rows = data.filter((t: any) => t.account?.is_active !== false);
    const { toArs, excludedCurrencies } = await buildToArsConverter(rows);
    // These aggregate-only responses cannot expose partial-valuation metadata.
    if (excludedCurrencies.length > 0) {
      throw new Error(`Cotizaciones no disponibles para ${excludedCurrencies.join(', ')}`);
    }
    const byCat = new Map<string, { name: string; icon: string; amount: number; count: number }>();
    for (const t of rows) {
      const amount = toArs(t);
      if (amount == null) continue;
      const cat = t.category as { name?: string; icon?: string } | null;
      const key = String(t.category_id || 'none');
      const cur = byCat.get(key) || {
        name: cat?.name || 'Sin categoría',
        icon: cat?.icon || '❓',
        amount: 0,
        count: 0,
      };
      cur.amount += amount;
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

  async getMonthlyTrend(userId: string, startYmd: string, endYmd: string): Promise<MonthlyData[]> {
    const supabase = createServiceClientSync();
    const monthKeys = monthKeysInclusive(startYmd, endYmd);
    if (monthKeys.length === 0) return [];

    const data = await readAllPages((from, to) => supabase
      .from('transactions')
      .select('amount, currency, type, transaction_date, account:accounts!transactions_account_id_fkey(is_active)')
      .eq('user_id', userId)
      .in('type', ['expense', 'income'])
      .gte('transaction_date', ymdToQueryStartIso(startOfRange(startYmd)))
      .lte('transaction_date', ymdToQueryEndIso(endYmd))
      .order('transaction_date', { ascending: true })
      .order('id', { ascending: true })
      .range(from, to));
    const rows = data.filter((t: any) => t.account?.is_active !== false);
    const { toArs, excludedCurrencies } = await buildToArsConverter(rows);
    // These aggregate-only responses cannot expose partial-valuation metadata.
    if (excludedCurrencies.length > 0) {
      throw new Error(`Cotizaciones no disponibles para ${excludedCurrencies.join(', ')}`);
    }
    const byMonth = new Map<string, { expenses: number; income: number }>();
    for (const key of monthKeys) {
      byMonth.set(key, { expenses: 0, income: 0 });
    }
    for (const t of rows) {
      const amount = toArs(t);
      if (amount == null) continue;
      const key = transactionCivilYmd(String(t.transaction_date)).slice(0, 7);
      const bucket = byMonth.get(key);
      if (!bucket) continue;
      if (t.type === 'expense') bucket.expenses += amount;
      else bucket.income += amount;
    }
    return monthKeys.map((key) => {
      const v = byMonth.get(key) || { expenses: 0, income: 0 };
      return {
        month: key,
        monthLabel: monthLabelFromKey(key),
        expenses: v.expenses,
        income: v.income,
        balance: v.income - v.expenses,
      };
    });
  }

  async getDailyTrend(userId: string, startYmd: string, endYmd: string): Promise<DailyData[]> {
    const supabase = createServiceClientSync();
    const days = eachYmdInclusive(startYmd, endYmd);
    if (days.length === 0) return [];

    const data = await readAllPages((from, to) => supabase
      .from('transactions')
      .select('amount, currency, type, transaction_date, account:accounts!transactions_account_id_fkey(is_active)')
      .eq('user_id', userId)
      .in('type', ['expense', 'income'])
      .gte('transaction_date', ymdToQueryStartIso(startYmd))
      .lte('transaction_date', ymdToQueryEndIso(endYmd))
      .order('transaction_date', { ascending: true })
      .order('id', { ascending: true })
      .range(from, to));
    const rows = data.filter((t: any) => t.account?.is_active !== false);
    const { toArs, excludedCurrencies } = await buildToArsConverter(rows);
    // These aggregate-only responses cannot expose partial-valuation metadata.
    if (excludedCurrencies.length > 0) {
      throw new Error(`Cotizaciones no disponibles para ${excludedCurrencies.join(', ')}`);
    }
    const byDay = new Map<string, { expenses: number; income: number }>();
    for (const dateStr of days) {
      byDay.set(dateStr, { expenses: 0, income: 0 });
    }
    for (const t of rows) {
      const amount = toArs(t);
      if (amount == null) continue;
      const dateStr = transactionCivilYmd(String(t.transaction_date));
      const bucket = byDay.get(dateStr);
      if (!bucket) continue;
      if (t.type === 'expense') bucket.expenses += amount;
      else bucket.income += amount;
    }
    return days.map((dateStr) => {
      const v = byDay.get(dateStr) || { expenses: 0, income: 0 };
      return {
        date: dateStr,
        dayLabel: dayLabelFromYmd(dateStr),
        expenses: v.expenses,
        income: v.income,
      };
    });
  }

  async getAccountBreakdown(
    userId: string,
    startYmd: string,
    endYmd: string
  ): Promise<AccountBreakdown[]> {
    const supabase = createServiceClientSync();

    const data = await readAllPages((from, to) => supabase
      .from('transactions')
      .select('amount, currency, account_id, account:accounts!transactions_account_id_fkey(name, icon, color, is_active)')
      .eq('user_id', userId)
      .eq('type', 'expense')
      .gte('transaction_date', ymdToQueryStartIso(startYmd))
      .lte('transaction_date', ymdToQueryEndIso(endYmd))
      .order('transaction_date', { ascending: true })
      .order('id', { ascending: true })
      .range(from, to));

    const rows = data.filter((t: any) => t.account?.is_active !== false);
    const { toArs, excludedCurrencies } = await buildToArsConverter(rows);
    // These aggregate-only responses cannot expose partial-valuation metadata.
    if (excludedCurrencies.length > 0) {
      throw new Error(`Cotizaciones no disponibles para ${excludedCurrencies.join(', ')}`);
    }
    const byAcc = new Map<string, { name: string; icon: string; color: string; amount: number }>();
    for (const t of rows) {
      const amount = toArs(t);
      if (amount == null) continue;
      const acc = t.account as { name?: string; icon?: string; color?: string } | null;
      const key = String(t.account_id || 'none');
      const cur = byAcc.get(key) || {
        name: acc?.name || 'Sin cuenta',
        icon: acc?.icon || '💳',
        color: acc?.color || '#6B7280',
        amount: 0,
      };
      cur.amount += amount;
      byAcc.set(key, cur);
    }
    const normalized = Array.from(byAcc.values()).sort((a, b) => b.amount - a.amount);
    const total = normalized.reduce((sum: number, item) => sum + item.amount, 0);

    return normalized.map((acc) => ({
      ...acc,
      percent: total > 0 ? (acc.amount / total) * 100 : 0,
    }));
  }

  async getTopExpenses(
    userId: string,
    startYmd: string,
    endYmd: string,
    limit: number = 10
  ) {
    const supabase = createServiceClientSync();

    const { data: topRows, error } = await supabase.rpc('analytics_top_expenses', {
      p_user_id: userId,
      p_start: ymdToQueryStartIso(startYmd),
      p_end: ymdToQueryEndIso(endYmd),
      p_limit: limit,
    });
    if (error) throw error;
    if (!topRows || topRows.length === 0) return [];

    const orderedIds = topRows.map((row: any) => String(row.id));
    const { data: hydrated, error: hydrationError } = await supabase
      .from('transactions')
      .select('*, category:categories(name, icon), account:accounts!transactions_account_id_fkey(name)')
      .eq('user_id', userId)
      .in('id', orderedIds);

    if (hydrationError) throw hydrationError;
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

  async getAverages(userId: string, startYmd: string, endYmd: string) {
    const monthlyData = await this.getMonthlyTrend(userId, startYmd, endYmd);
    return this.getAveragesFromMonthly(monthlyData);
  }
}

function startOfRange(startYmd: string): string {
  return `${startYmd.slice(0, 7)}-01`;
}

export const analyticsService = new AnalyticsService();
