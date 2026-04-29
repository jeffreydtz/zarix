import { redirect } from 'next/navigation';
import dynamic from 'next/dynamic';
import { getCachedUser } from '@/lib/auth/session';
import { analyticsService } from '@/lib/services/analytics';
import ProjectionsWidget from '@/components/analysis/ProjectionsWidget';
import { PageHero, PageScaffold } from '@/components/ui/PageScaffold';
import MotionSection from '@/components/ui/MotionSection';

const CategoryDonut = dynamic(() => import('@/components/analysis/CategoryDonut'), { ssr: false });
const MonthlyBarChart = dynamic(() => import('@/components/analysis/MonthlyBarChart'), { ssr: false });
const CashFlowChart = dynamic(() => import('@/components/analysis/CashFlowChart'), { ssr: false });
const TopExpenses = dynamic(() => import('@/components/analysis/TopExpenses'), { ssr: false });
const AccountBreakdownChart = dynamic(() => import('@/components/analysis/AccountBreakdownChart'), { ssr: false });

export default async function AnalysisPage() {
  try {
    const user = await getCachedUser();

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
      incomeBreakdown
    ] = await Promise.all([
      analyticsService.getCategoryBreakdown(user.id, startOfMonth, endOfMonth, 'expense').catch(() => []),
      analyticsService.getMonthlyTrend(user.id, 6).catch(() => []),
      analyticsService.getDailyTrend(user.id, 30).catch(() => []),
      analyticsService.getTopExpenses(user.id, startOfMonth, endOfMonth, 10).catch(() => []),
      analyticsService.getAccountBreakdown(user.id, startOfMonth, endOfMonth).catch(() => []),
      analyticsService.getCategoryBreakdown(user.id, startOfMonth, endOfMonth, 'income').catch(() => [])
    ]);
    const averages = analyticsService.getAveragesFromMonthly(monthlyTrend);

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
      <PageScaffold
        hero={(
          <PageHero
            eyebrow="Inteligencia financiera"
            title="Analisis financiero"
            subtitle={`Tendencias y patrones de ${currentMonthName} ${now.getFullYear()} para anticiparte con mejores decisiones.`}
          />
        )}
      >
        <MotionSection delay={0.04} intensity="hero">
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            <div className="card bg-gradient-to-br from-red-50/80 via-white to-red-50/70 dark:from-red-900/15 dark:via-surface-elevated dark:to-red-900/5">
              <div className="text-xs text-muted-foreground mb-1">Gastos</div>
              <div className="text-2xl font-bold text-red-600 dark:text-red-400">
                ${totalExpenses.toLocaleString('es-AR', { maximumFractionDigits: 0 })}
              </div>
              {previousMonthData ? (
                <div className={`text-xs mt-1 ${expensesDiff <= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                  {expensesDiff >= 0 ? 'Subio' : 'Bajo'} {Math.abs(expensesDiff).toFixed(0)}% vs mes anterior
                </div>
              ) : null}
            </div>

            <div className="card bg-gradient-to-br from-emerald-50/80 via-white to-emerald-50/70 dark:from-emerald-900/20 dark:via-surface-elevated dark:to-emerald-900/5">
              <div className="text-xs text-muted-foreground mb-1">Ingresos</div>
              <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                ${totalIncome.toLocaleString('es-AR', { maximumFractionDigits: 0 })}
              </div>
            </div>

            <div className="card bg-gradient-to-br from-indigo-50/70 via-white to-blue-50/60 dark:from-indigo-900/20 dark:via-surface-elevated dark:to-blue-900/5">
              <div className="text-xs text-muted-foreground mb-1">Balance</div>
              <div className={`text-2xl font-bold ${balance >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                {balance >= 0 ? '+' : ''}${balance.toLocaleString('es-AR', { maximumFractionDigits: 0 })}
              </div>
            </div>

            <div className="card bg-gradient-to-br from-slate-100/80 via-white to-slate-100/60 dark:from-slate-800/60 dark:via-surface-elevated dark:to-slate-800/40">
              <div className="text-xs text-muted-foreground mb-1">Promedio 6 meses</div>
              <div className="text-2xl font-bold text-foreground">
                ${averages.avgExpenses.toLocaleString('es-AR', { maximumFractionDigits: 0 })}
              </div>
              <div className="text-xs text-muted-foreground">gastos / mes</div>
            </div>
          </div>
        </MotionSection>

        <MotionSection delay={0.09} intensity="normal">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 md:gap-6">
            <CategoryDonut data={categoryBreakdown} title="Gastos por categoria" />
            <MonthlyBarChart data={monthlyTrend} />
          </div>
        </MotionSection>

        <MotionSection delay={0.14} intensity="normal">
          <CashFlowChart data={dailyTrend} />
        </MotionSection>

        <MotionSection delay={0.18} intensity="subtle">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 md:gap-6">
            <TopExpenses transactions={topExpenses} />
            <AccountBreakdownChart data={accountBreakdown} />
          </div>
        </MotionSection>

        {incomeBreakdown.length > 0 ? (
          <MotionSection delay={0.23} intensity="subtle">
            <CategoryDonut data={incomeBreakdown} title="Ingresos por categoria" />
          </MotionSection>
        ) : null}

        <MotionSection delay={0.26} intensity="subtle" className="card border-primary/30 bg-gradient-to-br from-primary/10 via-surface to-indigo-100/60 dark:to-indigo-900/20">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <span>Analisis rapido</span>
          </h3>
          <div className="space-y-3 text-sm">
            {totalExpenses > totalIncome ? (
              <div className="flex items-start gap-2 p-3 rounded-control border border-red-200/70 dark:border-red-900/50 bg-red-100/80 dark:bg-red-900/25">
                <span>Gastaste mas que tus ingresos este mes. Diferencia: ${(totalExpenses - totalIncome).toLocaleString('es-AR', { maximumFractionDigits: 0 })}</span>
              </div>
            ) : null}

            {categoryBreakdown.length > 0 ? (
              <div className="flex items-start gap-2 p-3 rounded-control border border-border bg-surface-soft/70">
                <span>
                  Categoria dominante: <strong>{categoryBreakdown[0].icon} {categoryBreakdown[0].name}</strong> con ${categoryBreakdown[0].amount.toLocaleString('es-AR', { maximumFractionDigits: 0 })} ({categoryBreakdown[0].percent.toFixed(0)}% del total).
                </span>
              </div>
            ) : null}

            {expensesDiff > 10 && previousMonthData ? (
              <div className="flex items-start gap-2 p-3 rounded-control border border-amber-200/70 dark:border-amber-900/50 bg-amber-100/80 dark:bg-amber-900/25">
                <span>Tus gastos subieron {expensesDiff.toFixed(0)}% vs mes pasado. Conviene revisar los consumos mas altos.</span>
              </div>
            ) : null}

            {expensesDiff < -10 && previousMonthData ? (
              <div className="flex items-start gap-2 p-3 rounded-control border border-emerald-200/70 dark:border-emerald-900/50 bg-emerald-100/70 dark:bg-emerald-900/25">
                <span>Buen avance: redujiste gastos {Math.abs(expensesDiff).toFixed(0)}% frente al mes anterior.</span>
              </div>
            ) : null}

            {totalExpenses > averages.avgExpenses * 1.2 ? (
              <div className="flex items-start gap-2 p-3 rounded-control border border-amber-200/70 dark:border-amber-900/50 bg-amber-100/80 dark:bg-amber-900/25">
                <span>Estas 20% por encima de tu promedio historico. Todavia podes ajustar el cierre del mes.</span>
              </div>
            ) : null}
          </div>
        </MotionSection>

        <MotionSection delay={0.32} intensity="subtle">
          <ProjectionsWidget />
        </MotionSection>
      </PageScaffold>
    );
  } catch (error) {
    console.error('Analysis page error:', error);
    redirect('/login');
  }
}
