import { NextRequest, NextResponse } from 'next/server';
import { createServiceClientSync } from '@/lib/supabase/server';
import { accountsService } from '@/lib/services/accounts';
import { applyArchivedAccountsTransactionFilter } from '@/lib/services/transactions';
import {
  getGeminiForUser,
  GeminiMissingKeyError,
} from '@/lib/ai/gemini';
import { sendTelegramDm } from '@/lib/telegram/send';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

interface MonthlyAnalysis {
  totalGastos: number;
  totalIngresos: number;
  balance: number;
  topCategorias: Array<{ name: string; icon: string; amount: number; percent: number }>;
  comparativaAnterior: {
    gastosDiff: number;
    gastosPercent: number;
    ingresosDiff: number;
  };
  insights: string[];
  sugerencias: string[];
}

async function getMonthData(userId: string, year: number, month: number) {
  const supabase = createServiceClientSync();
  
  const startDate = new Date(year, month, 1);
  const endDate = new Date(year, month + 1, 0, 23, 59, 59);
  
  let txQ = supabase
    .from('transactions')
    .select('*, category:categories(name, icon)')
    .eq('user_id', userId)
    .gte('transaction_date', startDate.toISOString())
    .lte('transaction_date', endDate.toISOString());
  const activeIds = await accountsService.getActiveAccountIds(userId);
  txQ = applyArchivedAccountsTransactionFilter(txQ, activeIds);
  const { data: transactions } = await txQ;

  return transactions || [];
}

async function analyzeMonth(
  currentMonth: any[],
  previousMonth: any[],
  userId: string
): Promise<MonthlyAnalysis> {
  const expenses = currentMonth.filter(t => t.type === 'expense');
  const income = currentMonth.filter(t => t.type === 'income');
  const prevExpenses = previousMonth.filter(t => t.type === 'expense');
  const prevIncome = previousMonth.filter(t => t.type === 'income');
  
  const totalGastos = expenses.reduce((sum, t) => sum + Number(t.amount_in_account_currency), 0);
  const totalIngresos = income.reduce((sum, t) => sum + Number(t.amount_in_account_currency), 0);
  const prevTotalGastos = prevExpenses.reduce((sum, t) => sum + Number(t.amount_in_account_currency), 0);
  const prevTotalIngresos = prevIncome.reduce((sum, t) => sum + Number(t.amount_in_account_currency), 0);
  
  const categoryMap = new Map<string, { name: string; icon: string; amount: number }>();
  expenses.forEach(t => {
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
    .map(c => ({
      ...c,
      percent: totalGastos > 0 ? (c.amount / totalGastos) * 100 : 0
    }));
  
  const gastosDiff = totalGastos - prevTotalGastos;
  const gastosPercent = prevTotalGastos > 0 ? ((gastosDiff / prevTotalGastos) * 100) : 0;
  
  const prompt = `
Analizá estos datos financieros del mes y dame insights útiles en español rioplatense.
Sé directo, práctico y enfocate en lo accionable.

DATOS DEL MES:
- Gastos totales: $${totalGastos.toLocaleString('es-AR')}
- Ingresos totales: $${totalIngresos.toLocaleString('es-AR')}
- Balance: $${(totalIngresos - totalGastos).toLocaleString('es-AR')}
- Variación vs mes anterior: ${gastosDiff >= 0 ? '+' : ''}${gastosPercent.toFixed(1)}%

TOP CATEGORÍAS DE GASTO:
${topCategorias.map(c => `- ${c.icon} ${c.name}: $${c.amount.toLocaleString('es-AR')} (${c.percent.toFixed(1)}%)`).join('\n')}

TRANSACCIONES DETALLADAS (últimas 20):
${expenses.slice(0, 20).map(t => `- $${t.amount} ${t.currency}: ${t.description || 'Sin descripción'}`).join('\n')}

Respondé en JSON con este formato exacto:
{
  "insights": ["insight 1", "insight 2", "insight 3"],
  "sugerencias": ["sugerencia 1", "sugerencia 2", "sugerencia 3"]
}

Los insights deben ser observaciones sobre patrones de gasto.
Las sugerencias deben ser acciones concretas para mejorar.
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
          ? 'Gastaste más de lo que ingresaste este mes'
          : 'Mantuviste un balance positivo',
      ];
      sugerencias = ['Configurá tu API Key de Gemini en Configuración para insights con IA.'];
    } else {
      insights = [
        totalGastos > totalIngresos
          ? 'Gastaste más de lo que ingresaste este mes'
          : 'Mantuviste un balance positivo',
        gastosDiff > 0
          ? `Gastaste ${gastosPercent.toFixed(0)}% más que el mes pasado`
          : `Gastaste ${Math.abs(gastosPercent).toFixed(0)}% menos que el mes pasado`,
      ];
      sugerencias = ['Revisá tus gastos más grandes para encontrar oportunidades de ahorro'];
    }
  }
  
  return {
    totalGastos,
    totalIngresos,
    balance: totalIngresos - totalGastos,
    topCategorias,
    comparativaAnterior: {
      gastosDiff,
      gastosPercent,
      ingresosDiff: totalIngresos - prevTotalIngresos
    },
    insights,
    sugerencias
  };
}

function formatMessage(analysis: MonthlyAnalysis, monthName: string): string {
  const { totalGastos, totalIngresos, balance, topCategorias, comparativaAnterior, insights, sugerencias } = analysis;
  
  const balanceEmoji = balance >= 0 ? '✅' : '🔴';
  const trendEmoji = comparativaAnterior.gastosDiff <= 0 ? '📉' : '📈';
  
  let msg = `📊 *RESUMEN DE ${monthName.toUpperCase()}*\n\n`;
  
  msg += `💰 *Balance del mes*\n`;
  msg += `├ Ingresos: $${totalIngresos.toLocaleString('es-AR')}\n`;
  msg += `├ Gastos: $${totalGastos.toLocaleString('es-AR')}\n`;
  msg += `└ ${balanceEmoji} Resultado: $${balance.toLocaleString('es-AR')}\n\n`;
  
  msg += `${trendEmoji} *vs mes anterior*\n`;
  const diffText = comparativaAnterior.gastosDiff >= 0 ? '+' : '';
  msg += `└ Gastos: ${diffText}${comparativaAnterior.gastosPercent.toFixed(1)}%\n\n`;
  
  if (topCategorias.length > 0) {
    msg += `🏷️ *Top categorías*\n`;
    topCategorias.forEach((cat, i) => {
      const prefix = i === topCategorias.length - 1 ? '└' : '├';
      msg += `${prefix} ${cat.icon} ${cat.name}: $${cat.amount.toLocaleString('es-AR')} (${cat.percent.toFixed(0)}%)\n`;
    });
    msg += '\n';
  }
  
  if (insights.length > 0) {
    msg += `💡 *Observaciones*\n`;
    insights.forEach((insight, i) => {
      msg += `• ${insight}\n`;
    });
    msg += '\n';
  }
  
  if (sugerencias.length > 0) {
    msg += `🎯 *Sugerencias*\n`;
    sugerencias.forEach((sug, i) => {
      msg += `• ${sug}\n`;
    });
  }
  
  return msg;
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  
  try {
    const supabase = createServiceClientSync();
    
    const { data: users } = await supabase
      .from('users')
      .select('id, telegram_chat_id, monthly_summary_enabled, telegram_bot_token')
      .eq('monthly_summary_enabled', true)
      .not('telegram_chat_id', 'is', null);
    
    if (!users || users.length === 0) {
      return NextResponse.json({ message: 'No users to notify' });
    }
    
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    const prevMonth = currentMonth === 0 ? 11 : currentMonth - 1;
    const prevYear = currentMonth === 0 ? currentYear - 1 : currentYear;
    
    const monthNames = [
      'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
      'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
    ];
    const monthName = monthNames[prevMonth];
    
    let sent = 0;
    
    for (const user of users) {
      try {
        const currentMonthData = await getMonthData(user.id, prevYear, prevMonth);
        const previousMonthData = await getMonthData(
          user.id,
          prevMonth === 0 ? prevYear - 1 : prevYear,
          prevMonth === 0 ? 11 : prevMonth - 1
        );
        
        if (currentMonthData.length === 0) continue;
        
        const analysis = await analyzeMonth(currentMonthData, previousMonthData, user.id);
        const message = formatMessage(analysis, monthName);
        
        await sendTelegramDm(user.telegram_chat_id, message, {
          parse_mode: 'Markdown',
          botToken: user.telegram_bot_token,
        });
        
        sent++;
      } catch (e) {
        console.error(`Error sending to user ${user.id}:`, e);
      }
    }
    
    return NextResponse.json({ 
      success: true, 
      sent,
      total: users.length 
    });
    
  } catch (error) {
    console.error('Monthly summary error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
