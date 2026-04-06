import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { applyArchivedAccountsTransactionFilter } from '@/lib/services/transactions';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const now = new Date();

    // Get last 3 months of income + expense data
    const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 2, 1);

    let txQuery = supabase
      .from('transactions')
      .select('type, amount_in_account_currency, transaction_date')
      .eq('user_id', user.id)
      .in('type', ['expense', 'income'])
      .gte('transaction_date', threeMonthsAgo.toISOString());
    txQuery = await applyArchivedAccountsTransactionFilter(txQuery, user.id);
    const { data: transactions } = await txQuery;

    if (!transactions || transactions.length === 0) {
      return NextResponse.json({
        hasData: false,
        message: 'Necesitás al menos 1 mes de datos para proyecciones.',
      });
    }

    // Group by month
    const monthlyData: Record<string, { income: number; expense: number }> = {};

    for (const t of transactions) {
      const date = new Date(t.transaction_date);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      if (!monthlyData[monthKey]) {
        monthlyData[monthKey] = { income: 0, expense: 0 };
      }
      if (t.type === 'income') {
        monthlyData[monthKey].income += Number(t.amount_in_account_currency);
      } else {
        monthlyData[monthKey].expense += Number(t.amount_in_account_currency);
      }
    }

    const months = Object.values(monthlyData);
    const completedMonths = months.filter(m => m.income > 0 || m.expense > 0);

    if (completedMonths.length === 0) {
      return NextResponse.json({
        hasData: false,
        message: 'No hay suficientes datos para proyectar.',
      });
    }

    const avgIncome = completedMonths.reduce((s, m) => s + m.income, 0) / completedMonths.length;
    const avgExpense = completedMonths.reduce((s, m) => s + m.expense, 0) / completedMonths.length;
    const avgSavings = avgIncome - avgExpense;
    const savingsRate = avgIncome > 0 ? (avgSavings / avgIncome) * 100 : 0;

    // Get current account balances for total patrimony
    const { data: accounts } = await supabase
      .from('accounts')
      .select('balance, currency, is_debt')
      .eq('user_id', user.id)
      .eq('is_active', true);

    const currentARS = (accounts || [])
      .filter(a => a.currency === 'ARS' && !a.is_debt)
      .reduce((sum, a) => sum + Number(a.balance), 0);

    // Project 3, 6, 12 months
    const projection3m = currentARS + (avgSavings * 3);
    const projection6m = currentARS + (avgSavings * 6);
    const projection12m = currentARS + (avgSavings * 12);

    const monthNames = [
      'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
      'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic',
    ];

    const futureMonths = [];
    for (let i = 1; i <= 12; i++) {
      const future = new Date(now.getFullYear(), now.getMonth() + i, 1);
      futureMonths.push({
        month: `${monthNames[future.getMonth()]} ${future.getFullYear()}`,
        projected: currentARS + (avgSavings * i),
      });
    }

    return NextResponse.json({
      hasData: true,
      avgIncome: Math.round(avgIncome),
      avgExpense: Math.round(avgExpense),
      avgSavings: Math.round(avgSavings),
      savingsRate: Math.round(savingsRate * 10) / 10,
      currentBalance: Math.round(currentARS),
      projection3m: Math.round(projection3m),
      projection6m: Math.round(projection6m),
      projection12m: Math.round(projection12m),
      futureMonths,
      monthsAnalyzed: completedMonths.length,
      trend: avgSavings > 0 ? 'positive' : 'negative',
    });
  } catch (error) {
    console.error('Projections error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
