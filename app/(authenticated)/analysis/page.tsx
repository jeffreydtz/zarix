import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { transactionsService } from '@/lib/services/transactions';
import ExpensesByCategory from '@/components/analysis/ExpensesByCategory';
import MonthlyTrend from '@/components/analysis/MonthlyTrend';

export default async function AnalysisPage() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      redirect('/login');
    }

    const currentMonth = new Date();
    const previousMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1);

    const [currentSummary, previousSummary] = await Promise.all([
      transactionsService.getMonthSummary(user.id, currentMonth).catch(() => ({
        totalExpenses: 0,
        totalIncome: 0,
        balance: 0,
        topCategories: [],
      })),
      transactionsService.getMonthSummary(user.id, previousMonth).catch(() => ({
        totalExpenses: 0,
        totalIncome: 0,
        balance: 0,
        topCategories: [],
      })),
    ]);

    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <div className="max-w-6xl mx-auto p-4 space-y-6">
          <h1 className="text-3xl font-bold">Análisis</h1>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="card">
              <div className="text-sm text-gray-500 mb-1">Gastos del Mes</div>
              <div className="text-2xl font-bold text-red-600">
                ${currentSummary.totalExpenses.toLocaleString('es-AR')}
              </div>
            </div>

            <div className="card">
              <div className="text-sm text-gray-500 mb-1">Ingresos del Mes</div>
              <div className="text-2xl font-bold text-green-600">
                ${currentSummary.totalIncome.toLocaleString('es-AR')}
              </div>
            </div>

            <div className="card">
              <div className="text-sm text-gray-500 mb-1">Balance</div>
              <div
                className={`text-2xl font-bold ${
                  currentSummary.balance >= 0 ? 'text-green-600' : 'text-red-600'
                }`}
              >
                {currentSummary.balance >= 0 ? '+' : ''}
                ${currentSummary.balance.toLocaleString('es-AR')}
              </div>
            </div>
          </div>

          <ExpensesByCategory categories={currentSummary.topCategories} />

          <MonthlyTrend current={currentSummary} previous={previousSummary} />
        </div>
      </div>
    );
  } catch (error) {
    console.error('Analysis page error:', error);
    redirect('/login');
  }
}
