import { NextRequest } from 'next/server';
import { IterativeCronJob, ServiceClient } from '@/lib/cron/cron-job';
import { createServiceClientSync } from '@/lib/supabase/server';
import { accountsService } from '@/lib/services/accounts';
import { applyArchivedAccountsTransactionFilter } from '@/lib/services/transactions';
import { getGeminiForUser, GeminiMissingKeyError } from '@/lib/ai/gemini';
import { sendTelegramDm } from '@/lib/telegram/send';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

interface WeekAnalysis {
  totalGastos: number;
  totalIngresos: number;
  balance: number;
  topCategorias: Array<{ name: string; icon: string; amount: number; percent: number }>;
  comparativaAnterior: { gastosDiff: number; gastosPercent: number };
  insights: string[];
  sugerencias: string[];
}

async function getTransactionsInRange(
  userId: string,
  start: Date,
  end: Date
): Promise<any[]> {
  const supabase = createServiceClientSync();
  let txQ = supabase
    .from('transactions')
    .select('*, category:categories(name, icon)')
    .eq('user_id', userId)
    .gte('transaction_date', start.toISOString())
    .lte('transaction_date', end.toISOString());
  const activeIds = await accountsService.getActiveAccountIds(userId);
  txQ = applyArchivedAccountsTransactionFilter(txQ, activeIds);
  const { data } = await txQ;
  return data || [];
}

/** Lunes 00:00 UTC a domingo 23:59:59 UTC de la semana que terminó el domingo anterior al lunes `asOfMonday`. */
function getCompletedWeekRangeUtc(asOfMonday: Date): { start: Date; end: Date } {
  const lastSunday = new Date(asOfMonday);
  lastSunday.setUTCDate(lastSunday.getUTCDate() - 1);
  lastSunday.setUTCHours(23, 59, 59, 999);
  const weekStart = new Date(lastSunday);
  weekStart.setUTCDate(lastSunday.getUTCDate() - 6);
  weekStart.setUTCHours(0, 0, 0, 0);
  return { start: weekStart, end: lastSunday };
}

function previousWeekRange(
  weekStart: Date
): { start: Date; end: Date } {
  const prevEnd = new Date(weekStart);
  prevEnd.setUTCDate(prevEnd.getUTCDate() - 1);
  prevEnd.setUTCHours(23, 59, 59, 999);
  const prevStart = new Date(prevEnd);
  prevStart.setUTCDate(prevEnd.getUTCDate() - 6);
  prevStart.setUTCHours(0, 0, 0, 0);
  return { start: prevStart, end: prevEnd };
}

async function analyzeWeek(
  currentWeek: any[],
  previousWeek: any[],
  userId: string
): Promise<WeekAnalysis> {
  const expenses = currentWeek.filter((t) => t.type === 'expense');
  const income = currentWeek.filter((t) => t.type === 'income');
  const prevExpenses = previousWeek.filter((t) => t.type === 'expense');
  const prevIncome = previousWeek.filter((t) => t.type === 'income');

  const totalGastos = expenses.reduce((sum, t) => sum + Number(t.amount_in_account_currency), 0);
  const totalIngresos = income.reduce((sum, t) => sum + Number(t.amount_in_account_currency), 0);
  const prevTotalGastos = prevExpenses.reduce((sum, t) => sum + Number(t.amount_in_account_currency), 0);
  const prevTotalIngresos = prevIncome.reduce((sum, t) => sum + Number(t.amount_in_account_currency), 0);

  const categoryMap = new Map<string, { name: string; icon: string; amount: number }>();
  expenses.forEach((t) => {
    if (t.category) {
      const cat = t.category as { name: string; icon: string };
      const existing = categoryMap.get(cat.name) || { name: cat.name, icon: cat.icon, amount: 0 };
      existing.amount += Number(t.amount_in_account_currency);
      categoryMap.set(cat.name, existing);
    }
  });

  const topCategorias = Array.from(categoryMap.values())
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 5)
    .map((c) => ({
      ...c,
      percent: totalGastos > 0 ? (c.amount / totalGastos) * 100 : 0,
    }));

  const gastosDiff = totalGastos - prevTotalGastos;
  const gastosPercent = prevTotalGastos > 0 ? (gastosDiff / prevTotalGastos) * 100 : 0;

  const prompt = `
Analizá estos datos financieros de la SEMANA (7 días) y dame insights breves en español rioplatense.

DATOS DE LA SEMANA:
- Gastos: $${totalGastos.toLocaleString('es-AR')}
- Ingresos: $${totalIngresos.toLocaleString('es-AR')}
- Balance: $${(totalIngresos - totalGastos).toLocaleString('es-AR')}
- vs semana anterior (gastos): ${gastosDiff >= 0 ? '+' : ''}${gastosPercent.toFixed(1)}%

TOP CATEGORÍAS:
${topCategorias.map((c) => `- ${c.icon} ${c.name}: $${c.amount.toLocaleString('es-AR')}`).join('\n')}

Respondé en JSON:
{ "insights": ["..."], "sugerencias": ["..."] }
`;

  let insights: string[] = [];
  let sugerencias: string[] = [];

  try {
    const gemini = await getGeminiForUser(userId);
    const result = await gemini.chat(prompt);
    const parsed = JSON.parse(result);
    insights = parsed.insights || [];
    sugerencias = parsed.sugerencias || [];
  } catch (e) {
    if (e instanceof GeminiMissingKeyError) {
      insights = [
        totalGastos > totalIngresos
          ? 'Gastaste más de lo que ingresaste este período'
          : 'Balance positivo en la semana',
      ];
      sugerencias = ['Configurá Gemini en la app para más detalle.'];
    } else {
      insights = [
        gastosDiff > 0
          ? `Gastaste ${gastosPercent.toFixed(0)}% más que la semana anterior`
          : `Gastaste ${Math.abs(gastosPercent).toFixed(0)}% menos que la semana anterior`,
      ];
      sugerencias = ['Revisá tus categorías con mayor gasto.'];
    }
  }

  return {
    totalGastos,
    totalIngresos,
    balance: totalIngresos - totalGastos,
    topCategorias,
    comparativaAnterior: { gastosDiff, gastosPercent },
    insights,
    sugerencias,
  };
}

function formatWeekMessage(
  analysis: WeekAnalysis,
  labelRange: string
): string {
  const {
    totalGastos,
    totalIngresos,
    balance,
    topCategorias,
    comparativaAnterior,
    insights,
    sugerencias,
  } = analysis;
  const balanceEmoji = balance >= 0 ? '✅' : '🔴';
  const trendEmoji = comparativaAnterior.gastosDiff <= 0 ? '📉' : '📈';

  let msg = `📊 *RESUMEN SEMANAL*\n_${labelRange}_\n\n`;
  msg += `💰 *Balance*\n`;
  msg += `├ Ingresos: $${totalIngresos.toLocaleString('es-AR')}\n`;
  msg += `├ Gastos: $${totalGastos.toLocaleString('es-AR')}\n`;
  msg += `└ ${balanceEmoji} Resultado: $${balance.toLocaleString('es-AR')}\n\n`;
  msg += `${trendEmoji} *vs semana anterior*\n`;
  const diffText = comparativaAnterior.gastosDiff >= 0 ? '+' : '';
  msg += `└ Gastos: ${diffText}${comparativaAnterior.gastosPercent.toFixed(1)}%\n\n`;

  if (topCategorias.length > 0) {
    msg += `🏷️ *Top categorías*\n`;
    topCategorias.forEach((cat, i) => {
      const prefix = i === topCategorias.length - 1 ? '└' : '├';
      msg += `${prefix} ${cat.icon} ${cat.name}: $${cat.amount.toLocaleString('es-AR')}\n`;
    });
    msg += '\n';
  }
  if (insights.length > 0) {
    msg += `💡 *Observaciones*\n`;
    insights.forEach((x) => {
      msg += `• ${x}\n`;
    });
    msg += '\n';
  }
  if (sugerencias.length > 0) {
    msg += `🎯 *Sugerencias*\n`;
    sugerencias.forEach((x) => {
      msg += `• ${x}\n`;
    });
  }
  return msg;
}

class WeeklySummaryJob extends IterativeCronJob<any> {
  readonly name = 'weekly-summary';

  private weekStart!: Date;
  private weekEnd!: Date;
  private prev!: { start: Date; end: Date };
  private labelRange = '';

  protected async fetchItems(supabase: ServiceClient): Promise<any[]> {
    const { data: users, error } = await supabase
      .from('users')
      .select('id, telegram_chat_id, weekly_summary_enabled, telegram_bot_token')
      .eq('weekly_summary_enabled', true)
      .not('telegram_chat_id', 'is', null);

    if (error) throw error;
    return users || [];
  }

  protected async beforeAll(): Promise<void> {
    const asOfMonday = new Date();
    const { start, end } = getCompletedWeekRangeUtc(asOfMonday);
    this.weekStart = start;
    this.weekEnd = end;
    this.prev = previousWeekRange(start);
    this.labelRange = `${start.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })} – ${end.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })}`;
  }

  protected async processItem(_supabase: ServiceClient, user: any): Promise<boolean> {
    const currentWeekData = await getTransactionsInRange(user.id, this.weekStart, this.weekEnd);
    const previousWeekData = await getTransactionsInRange(user.id, this.prev.start, this.prev.end);

    if (currentWeekData.length === 0) return false;

    const analysis = await analyzeWeek(currentWeekData, previousWeekData, user.id);
    const message = formatWeekMessage(analysis, this.labelRange);

    await sendTelegramDm(user.telegram_chat_id, message, {
      parse_mode: 'Markdown',
      botToken: user.telegram_bot_token,
    });
    return true;
  }

  protected emptyMessage(): string {
    return 'No users to notify';
  }
}

export async function GET(request: NextRequest) {
  return new WeeklySummaryJob().run(request);
}
