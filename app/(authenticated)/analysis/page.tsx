import { redirect } from 'next/navigation';
import dynamic from 'next/dynamic';
import { getCachedUser } from '@/lib/auth/session';
import { analyticsService } from '@/lib/services/analytics';
import { monthlyTrendWindow, percentChange, resolveAnalysisPeriod } from '@/lib/analysis-period';
import ProjectionsWidget from '@/components/analysis/ProjectionsWidget';
import AnalysisPeriodPicker from '@/components/analysis/AnalysisPeriodPicker';
import { PageHero, PageScaffold } from '@/components/ui/PageScaffold';
import MotionSection from '@/components/ui/MotionSection';
import ChartSkeleton from '@/components/ui/ChartSkeleton';

const CategoryDonut = dynamic(() => import('@/components/analysis/CategoryDonut'), { ssr: false, loading: () => <ChartSkeleton height={320} /> });
const MonthlyBarChart = dynamic(() => import('@/components/analysis/MonthlyBarChart'), { ssr: false, loading: () => <ChartSkeleton height={320} /> });
const CashFlowChart = dynamic(() => import('@/components/analysis/CashFlowChart'), { ssr: false, loading: () => <ChartSkeleton height={320} /> });
const TopExpenses = dynamic(() => import('@/components/analysis/TopExpenses'), { ssr: false, loading: () => <ChartSkeleton height={240} /> });
const AccountBreakdownChart = dynamic(() => import('@/components/analysis/AccountBreakdownChart'), { ssr: false, loading: () => <ChartSkeleton height={240} /> });

function firstParam(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

function formatMoney(n: number): string {
  return n.toLocaleString('es-AR', { maximumFractionDigits: 0 });
}

function changeLabel(
  diff: number | null,
  suffix: string,
  { upIsGood }: { upIsGood: boolean }
): { text: string; className: string } | null {
  if (diff == null) return null;
  const good = upIsGood ? diff >= 0 : diff <= 0;
  return {
    text: `${diff >= 0 ? 'Subió' : 'Bajó'} ${Math.abs(diff).toFixed(0)}% ${suffix}`,
    className: good ? 'text-success' : 'text-destructive',
  };
}

export default async function AnalysisPage({
  searchParams,
}: {
  searchParams: { [key: string]: string | string[] | undefined };
}) {
  try {
    const user = await getCachedUser();

    if (!user) {
      redirect('/login');
    }

    const period = resolveAnalysisPeriod({
      period: firstParam(searchParams.period),
      startDate: firstParam(searchParams.startDate),
      endDate: firstParam(searchParams.endDate),
    });
    const monthlyWindow = monthlyTrendWindow(period);

    const [
      categoryBreakdown,
      monthlyTrend,
      dailyTrend,
      topExpenses,
      accountBreakdown,
      incomeBreakdown,
      prevExpenseBreakdown,
      prevIncomeBreakdown,
    ] = await Promise.all([
      analyticsService.getCategoryBreakdown(user.id, period.startYmd, period.endYmd, 'expense').catch(() => []),
      analyticsService.getMonthlyTrend(user.id, monthlyWindow.startYmd, monthlyWindow.endYmd).catch(() => []),
      analyticsService.getDailyTrend(user.id, period.startYmd, period.endYmd).catch(() => []),
      analyticsService.getTopExpenses(user.id, period.startYmd, period.endYmd, 10).catch(() => []),
      analyticsService.getAccountBreakdown(user.id, period.startYmd, period.endYmd).catch(() => []),
      analyticsService.getCategoryBreakdown(user.id, period.startYmd, period.endYmd, 'income').catch(() => []),
      analyticsService.getCategoryBreakdown(user.id, period.prevStartYmd, period.prevEndYmd, 'expense').catch(() => []),
      analyticsService.getCategoryBreakdown(user.id, period.prevStartYmd, period.prevEndYmd, 'income').catch(() => []),
    ]);
    const averages = analyticsService.getAveragesFromMonthly(monthlyTrend);

    const totalExpenses = categoryBreakdown.reduce((sum, c) => sum + c.amount, 0);
    const totalIncome = incomeBreakdown.reduce((sum, c) => sum + c.amount, 0);
    const balance = totalIncome - totalExpenses;
    const savingsRate = totalIncome > 0 ? (balance / totalIncome) * 100 : null;

    const prevExpenses = prevExpenseBreakdown.reduce((sum, c) => sum + c.amount, 0);
    const prevIncome = prevIncomeBreakdown.reduce((sum, c) => sum + c.amount, 0);
    const expensesDiff = percentChange(totalExpenses, prevExpenses);
    const incomeDiff = percentChange(totalIncome, prevIncome);
    const expensesChange = changeLabel(expensesDiff, 'vs período anterior', { upIsGood: false });
    const incomeChange = changeLabel(incomeDiff, 'vs período anterior', { upIsGood: true });

    return (
      <PageScaffold
        hero={(
          <PageHero
            eyebrow="Inteligencia financiera"
            title="Análisis financiero"
            subtitle={`Tendencias y patrones de ${period.label} para anticiparte con mejores decisiones.`}
          />
        )}
      >
        <MotionSection delay={0.02} intensity="hero">
          <AnalysisPeriodPicker period={period} />
        </MotionSection>

        <MotionSection delay={0.04} intensity="hero">
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            <div className="card bg-gradient-to-br from-destructive/10 via-card to-destructive/10">
              <div className="text-xs text-muted-foreground mb-1">Gastos</div>
              <div className="text-2xl font-bold text-destructive">
                ${formatMoney(totalExpenses)}
              </div>
              {expensesChange ? (
                <div className={`text-xs mt-1 ${expensesChange.className}`}>
                  {expensesChange.text}
                </div>
              ) : null}
            </div>

            <div className="card bg-gradient-to-br from-success/10 via-card to-success/10">
              <div className="text-xs text-muted-foreground mb-1">Ingresos</div>
              <div className="text-2xl font-bold text-success">
                ${formatMoney(totalIncome)}
              </div>
              {incomeChange ? (
                <div className={`text-xs mt-1 ${incomeChange.className}`}>
                  {incomeChange.text}
                </div>
              ) : null}
            </div>

            <div className="card bg-gradient-to-br from-indigo-50/70 via-card to-blue-50/60 dark:from-indigo-900/20 dark:to-blue-900/5">
              <div className="text-xs text-muted-foreground mb-1">Balance</div>
              <div className={`text-2xl font-bold ${balance >= 0 ? 'text-success' : 'text-destructive'}`}>
                {balance >= 0 ? '+' : ''}${formatMoney(balance)}
              </div>
              {savingsRate != null ? (
                <div className="text-xs text-muted-foreground mt-1">
                  Ahorro {savingsRate.toFixed(0)}% de los ingresos
                </div>
              ) : null}
            </div>

            <div className="card bg-gradient-to-br from-secondary via-card to-secondary">
              <div className="text-xs text-muted-foreground mb-1">Promedio mensual</div>
              <div className="text-2xl font-bold text-foreground">
                ${formatMoney(averages.avgExpenses)}
              </div>
              <div className="text-xs text-muted-foreground">gastos / mes en la evolución</div>
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
          <CashFlowChart
            data={dailyTrend}
            title={`Flujo de caja (${period.shortLabel})`}
          />
        </MotionSection>

        <MotionSection delay={0.18} intensity="subtle">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 md:gap-6">
            <TopExpenses transactions={topExpenses} title={`Gastos más grandes · ${period.shortLabel}`} />
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
            {totalExpenses === 0 && totalIncome === 0 ? (
              <div className="flex items-start gap-2 p-3 rounded-control border border-border bg-surface-soft/70">
                <span>No hay movimientos en {period.label}. Probá otro período o cargá un gasto desde el botón Nuevo.</span>
              </div>
            ) : null}

            {totalExpenses > totalIncome && totalIncome > 0 ? (
              <div className="flex items-start gap-2 p-3 rounded-control border border-destructive/30 bg-destructive/10">
                <span>Gastaste más que tus ingresos en {period.shortLabel}. Diferencia: ${formatMoney(totalExpenses - totalIncome)}</span>
              </div>
            ) : null}

            {categoryBreakdown.length > 0 ? (
              <div className="flex items-start gap-2 p-3 rounded-control border border-border bg-surface-soft/70">
                <span>
                  Categoría dominante: <strong>{categoryBreakdown[0].icon} {categoryBreakdown[0].name}</strong> con ${formatMoney(categoryBreakdown[0].amount)} ({categoryBreakdown[0].percent.toFixed(0)}% del total).
                </span>
              </div>
            ) : null}

            {expensesDiff != null && expensesDiff > 10 ? (
              <div className="flex items-start gap-2 p-3 rounded-control border border-warning/30 bg-warning/10">
                <span>Tus gastos subieron {expensesDiff.toFixed(0)}% vs el período anterior. Conviene revisar los consumos más altos.</span>
              </div>
            ) : null}

            {expensesDiff != null && expensesDiff < -10 ? (
              <div className="flex items-start gap-2 p-3 rounded-control border border-success/30 bg-success/10">
                <span>Buen avance: redujiste gastos {Math.abs(expensesDiff).toFixed(0)}% frente al período anterior.</span>
              </div>
            ) : null}

            {totalExpenses > averages.avgExpenses * 1.2 && averages.avgExpenses > 0 ? (
              <div className="flex items-start gap-2 p-3 rounded-control border border-warning/30 bg-warning/10">
                <span>Estás 20% por encima de tu promedio histórico de la evolución mensual.</span>
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
    const digest =
      error && typeof error === 'object' && 'digest' in error
        ? (error as { digest?: unknown }).digest
        : undefined;
    if (typeof digest === 'string' && digest.startsWith('NEXT_')) {
      throw error;
    }
    console.error('Analysis page error:', error);
    redirect('/login');
  }
}
