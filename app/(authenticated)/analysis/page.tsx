import { CategoryDonut, MonthlyBarChart, CashFlowChart, TopExpenses, AccountBreakdownChart } from '@/components/analysis/LazyAnalysisCharts';
import { redirect } from 'next/navigation';
import { getCachedUser } from '@/lib/auth/session';
import { analyticsService } from '@/lib/services/analytics';
import ProjectionsWidget from '@/components/analysis/ProjectionsWidget';
import { PageHero, PageScaffold } from '@/components/ui/PageScaffold';
import MotionSection from '@/components/ui/MotionSection';


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
            title="Análisis financiero"
            subtitle={`Tendencias y patrones de ${currentMonthName} ${now.getFullYear()} para anticiparte con mejores decisiones.`}
          />
        )}
      >
        <MotionSection delay={0.04} intensity="hero">
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            <div className="card bg-gradient-to-br from-destructive/10 via-card to-destructive/10">
              <div className="text-xs text-muted-foreground mb-1">Gastos</div>
              <div className="text-2xl font-bold text-destructive">
                ${totalExpenses.toLocaleString('es-AR', { maximumFractionDigits: 0 })}
              </div>
              {previousMonthData ? (
                <div className={`text-xs mt-1 ${expensesDiff <= 0 ? 'text-success' : 'text-destructive'}`}>
                  {expensesDiff >= 0 ? 'Subió' : 'Bajó'} {Math.abs(expensesDiff).toFixed(0)}% vs mes anterior
                </div>
              ) : null}
            </div>

            <div className="card bg-gradient-to-br from-success/10 via-card to-success/10">
              <div className="text-xs text-muted-foreground mb-1">Ingresos</div>
              <div className="text-2xl font-bold text-success">
                ${totalIncome.toLocaleString('es-AR', { maximumFractionDigits: 0 })}
              </div>
            </div>

            <div className="card bg-gradient-to-br from-indigo-50/70 via-card to-blue-50/60 dark:from-indigo-900/20 dark:to-blue-900/5">
              <div className="text-xs text-muted-foreground mb-1">Balance</div>
              <div className={`text-2xl font-bold ${balance >= 0 ? 'text-success' : 'text-destructive'}`}>
                {balance >= 0 ? '+' : ''}${balance.toLocaleString('es-AR', { maximumFractionDigits: 0 })}
              </div>
            </div>

            <div className="card bg-gradient-to-br from-secondary via-card to-secondary">
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
            <CategoryDonut data={categoryBreakdown} title="Gastos por categoría" />
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
            <CategoryDonut data={incomeBreakdown} title="Ingresos por categoría" />
          </MotionSection>
        ) : null}

        <MotionSection delay={0.26} intensity="subtle" className="card border-primary/30 bg-gradient-to-br from-primary/10 via-surface to-indigo-100/60 dark:to-indigo-900/20">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <span>Análisis rápido</span>
          </h3>
          <div className="space-y-3 text-sm">
            {totalExpenses > totalIncome ? (
              <div className="flex items-start gap-2 p-3 rounded-control border border-destructive/30 bg-destructive/10">
                <span>Gastaste más que tus ingresos este mes. Diferencia: ${(totalExpenses - totalIncome).toLocaleString('es-AR', { maximumFractionDigits: 0 })}</span>
              </div>
            ) : null}

            {categoryBreakdown.length > 0 ? (
              <div className="flex items-start gap-2 p-3 rounded-control border border-border bg-surface-soft/70">
                <span>
                  Categoría dominante: <strong>{categoryBreakdown[0].icon} {categoryBreakdown[0].name}</strong> con ${categoryBreakdown[0].amount.toLocaleString('es-AR', { maximumFractionDigits: 0 })} ({categoryBreakdown[0].percent.toFixed(0)}% del total).
                </span>
              </div>
            ) : null}

            {expensesDiff > 10 && previousMonthData ? (
              <div className="flex items-start gap-2 p-3 rounded-control border border-warning/30 bg-warning/10">
                <span>Tus gastos subieron {expensesDiff.toFixed(0)}% vs mes pasado. Conviene revisar los consumos mas altos.</span>
              </div>
            ) : null}

            {expensesDiff < -10 && previousMonthData ? (
              <div className="flex items-start gap-2 p-3 rounded-control border border-success/30 bg-success/10">
                <span>Buen avance: redujiste gastos {Math.abs(expensesDiff).toFixed(0)}% frente al mes anterior.</span>
              </div>
            ) : null}

            {totalExpenses > averages.avgExpenses * 1.2 ? (
              <div className="flex items-start gap-2 p-3 rounded-control border border-warning/30 bg-warning/10">
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
