import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { analyticsService } from '@/lib/services/analytics';
import CategoryDonut from '@/components/analysis/CategoryDonut';
import MonthlyBarChart from '@/components/analysis/MonthlyBarChart';
import CashFlowChart from '@/components/analysis/CashFlowChart';
import TopExpenses from '@/components/analysis/TopExpenses';
import AccountBreakdownChart from '@/components/analysis/AccountBreakdownChart';

export default async function AnalysisPage() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      redirect('/login');
    }

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

    const [
      categoryBreakdown,
      monthlyTrend,
      dailyTrend,
      topExpenses,
      accountBreakdown,
      averages,
      incomeBreakdown
    ] = await Promise.all([
      analyticsService.getCategoryBreakdown(user.id, startOfMonth, endOfMonth, 'expense').catch(() => []),
      analyticsService.getMonthlyTrend(user.id, 6).catch(() => []),
      analyticsService.getDailyTrend(user.id, 30).catch(() => []),
      analyticsService.getTopExpenses(user.id, startOfMonth, endOfMonth, 10).catch(() => []),
      analyticsService.getAccountBreakdown(user.id, startOfMonth, endOfMonth).catch(() => []),
      analyticsService.getAverages(user.id).catch(() => ({ avgExpenses: 0, avgIncome: 0, avgBalance: 0 })),
      analyticsService.getCategoryBreakdown(user.id, startOfMonth, endOfMonth, 'income').catch(() => [])
    ]);

    const totalExpenses = categoryBreakdown.reduce((sum, c) => sum + c.amount, 0);
    const totalIncome = incomeBreakdown.reduce((sum, c) => sum + c.amount, 0);
    const balance = totalIncome - totalExpenses;

    const currentMonthData = monthlyTrend[monthlyTrend.length - 1];
    const previousMonthData = monthlyTrend.length > 1 ? monthlyTrend[monthlyTrend.length - 2] : null;
    
    const expensesDiff = previousMonthData && previousMonthData.expenses > 0
      ? ((currentMonthData?.expenses || 0) - previousMonthData.expenses) / previousMonthData.expenses * 100
      : 0;

    const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 
                        'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    const currentMonthName = monthNames[now.getMonth()];

    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900 transition-colors duration-300">
        <div className="max-w-7xl mx-auto p-4 pb-24 space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
                Análisis Financiero
              </h1>
              <p className="text-sm text-slate-500">{currentMonthName} {now.getFullYear()}</p>
            </div>
          </div>

          {/* Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="card p-4">
              <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">Gastos</div>
              <div className="text-xl font-bold text-red-600 dark:text-red-400">
                ${totalExpenses.toLocaleString('es-AR', { maximumFractionDigits: 0 })}
              </div>
              {previousMonthData && (
                <div className={`text-xs mt-1 ${expensesDiff <= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {expensesDiff >= 0 ? '↑' : '↓'} {Math.abs(expensesDiff).toFixed(0)}% vs mes anterior
                </div>
              )}
            </div>

            <div className="card p-4">
              <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">Ingresos</div>
              <div className="text-xl font-bold text-green-600 dark:text-green-400">
                ${totalIncome.toLocaleString('es-AR', { maximumFractionDigits: 0 })}
              </div>
            </div>

            <div className="card p-4">
              <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">Balance</div>
              <div className={`text-xl font-bold ${balance >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                {balance >= 0 ? '+' : ''}${balance.toLocaleString('es-AR', { maximumFractionDigits: 0 })}
              </div>
            </div>

            <div className="card p-4">
              <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">Promedio 6 meses</div>
              <div className="text-xl font-bold text-slate-700 dark:text-slate-300">
                ${averages.avgExpenses.toLocaleString('es-AR', { maximumFractionDigits: 0 })}
              </div>
              <div className="text-xs text-slate-500">gastos/mes</div>
            </div>
          </div>

          {/* Main Charts Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <CategoryDonut 
              data={categoryBreakdown} 
              title="Gastos por Categoría" 
            />
            
            <MonthlyBarChart data={monthlyTrend} />
          </div>

          {/* Cash Flow */}
          <CashFlowChart data={dailyTrend} />

          {/* Secondary Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <TopExpenses transactions={topExpenses} />
            <AccountBreakdownChart data={accountBreakdown} />
          </div>

          {/* Income Breakdown (if any) */}
          {incomeBreakdown.length > 0 && (
            <CategoryDonut 
              data={incomeBreakdown} 
              title="Ingresos por Categoría" 
            />
          )}

          {/* Insights Section */}
          <div className="card p-6 bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 border-blue-200 dark:border-blue-800">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <span>🔍</span> Análisis Rápido
            </h3>
            <div className="space-y-3 text-sm">
              {totalExpenses > totalIncome && (
                <div className="flex items-start gap-2 p-2 bg-red-100 dark:bg-red-900/30 rounded-lg">
                  <span>⚠️</span>
                  <span>Gastaste más de lo que ingresaste este mes. Diferencia: ${(totalExpenses - totalIncome).toLocaleString('es-AR', { maximumFractionDigits: 0 })}</span>
                </div>
              )}
              
              {categoryBreakdown.length > 0 && (
                <div className="flex items-start gap-2 p-2 bg-white/50 dark:bg-slate-800/50 rounded-lg">
                  <span>📊</span>
                  <span>
                    Tu categoría más alta es <strong>{categoryBreakdown[0].icon} {categoryBreakdown[0].name}</strong> con ${categoryBreakdown[0].amount.toLocaleString('es-AR', { maximumFractionDigits: 0 })} ({categoryBreakdown[0].percent.toFixed(0)}% del total)
                  </span>
                </div>
              )}
              
              {expensesDiff > 10 && previousMonthData && (
                <div className="flex items-start gap-2 p-2 bg-amber-100 dark:bg-amber-900/30 rounded-lg">
                  <span>📈</span>
                  <span>Tus gastos aumentaron {expensesDiff.toFixed(0)}% respecto al mes pasado. Revisá los gastos grandes.</span>
                </div>
              )}
              
              {expensesDiff < -10 && previousMonthData && (
                <div className="flex items-start gap-2 p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
                  <span>🎉</span>
                  <span>¡Excelente! Redujiste tus gastos {Math.abs(expensesDiff).toFixed(0)}% respecto al mes pasado.</span>
                </div>
              )}

              {totalExpenses > averages.avgExpenses * 1.2 && (
                <div className="flex items-start gap-2 p-2 bg-amber-100 dark:bg-amber-900/30 rounded-lg">
                  <span>💡</span>
                  <span>Estás 20% por encima de tu promedio de gastos. Todavía quedan días del mes para equilibrar.</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  } catch (error) {
    console.error('Analysis page error:', error);
    redirect('/login');
  }
}
