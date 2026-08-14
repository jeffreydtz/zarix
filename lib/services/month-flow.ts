import { createServiceClientSync } from '@/lib/supabase/server';
import { accountsService } from '@/lib/services/accounts';
import { applyArchivedAccountsTransactionFilter, buildToArsConverter } from '@/lib/services/transactions';
import type { Transaction, RecurringRule } from '@/types/database';

export interface MonthFlow {
  incomeARS: number;
  spentARS: number;
  /** Gasto MTD + proyección del resto del mes (ver criterio en getMonthFlow). */
  projectedSpendARS: number;
  /** Días que quedan en el mes después de hoy. */
  daysLeft: number;
  /** Monedas sin cotización, excluidas de los totales (ver buildToArsConverter). */
  excludedCurrencies: string[];
}

const TRAILING_WINDOW_DAYS = 14;

/**
 * Cash flow del mes en curso, normalizado a ARS por movimiento (mismo criterio
 * que los crons semanal/mensual: sumar amount_in_account_currency crudo mezcla
 * ARS/USD/EUR en un total sin sentido).
 *
 * Criterio de proyección a fin de mes (simplificado, no es un forecast estadístico):
 *   projectedSpendARS = spentARS (MTD)
 *                      + avgDailySpend(últimos 14 días) × daysLeft
 *                      + montoDeReglasRecurrentesDeGastoPendientes
 *
 * - avgDailySpend: gasto total de los últimos 14 días (ventana corrida, puede
 *   pisar el mes anterior) dividido por esos mismos días de historia
 *   disponible. Sirve como "run-rate" de gasto variable día a día.
 * - Reglas recurrentes pendientes: reglas activas de tipo expense
 *   (monthly/weekly/daily) cuyo last_executed_date NO cae en el mes actual
 *   (es decir, todavía no dispararon este mes). Para cada una se estima
 *   cuántas ocurrencias faltan en lo que resta del mes:
 *     - monthly → 1 (dispara una sola vez por mes)
 *     - weekly  → ceil(daysLeft / 7) (aproximación por semanas restantes)
 *     - daily   → daysLeft (una vez por cada día que queda)
 *   Esto evita doble conteo: una regla diaria que ya viene ejecutándose este
 *   mes queda excluida de este bloque (sus movimientos ya están en spentARS y
 *   en el promedio de los últimos 14 días).
 * No contempla estacionalidad, aguinaldo, ni reglas yearly (impacto residual
 * en la proyección de UN mes).
 */
export async function getMonthFlow(userId: string): Promise<MonthFlow> {
  const supabase = createServiceClientSync();
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();

  const monthStart = new Date(year, month, 1);
  const monthEnd = new Date(year, month + 1, 0, 23, 59, 59, 999);
  const daysInMonth = monthEnd.getDate();
  const daysLeft = Math.max(0, daysInMonth - now.getDate());

  const activeIds = await accountsService.getActiveAccountIds(userId);

  // Movimientos del mes en curso, de arranque de mes hasta ahora (MTD).
  let mtdQuery = supabase
    .from('transactions')
    .select('*')
    .eq('user_id', userId)
    .gte('transaction_date', monthStart.toISOString())
    .lte('transaction_date', now.toISOString());
  mtdQuery = applyArchivedAccountsTransactionFilter(mtdQuery, activeIds);
  const { data: mtdData } = await mtdQuery;
  const mtdTransactions: Transaction[] = mtdData || [];

  // Ventana corrida de los últimos 14 días (solo gastos) para el run-rate diario.
  const trailingStart = new Date(now);
  trailingStart.setDate(trailingStart.getDate() - TRAILING_WINDOW_DAYS);
  let trailingQuery = supabase
    .from('transactions')
    .select('*')
    .eq('user_id', userId)
    .eq('type', 'expense')
    .gte('transaction_date', trailingStart.toISOString())
    .lte('transaction_date', now.toISOString());
  trailingQuery = applyArchivedAccountsTransactionFilter(trailingQuery, activeIds);
  const { data: trailingData } = await trailingQuery;
  const trailingExpenses: Transaction[] = trailingData || [];

  // Reglas recurrentes de gasto activas con frecuencia mensual/semanal/diaria.
  const { data: rulesData } = await supabase
    .from('recurring_rules')
    .select('*')
    .eq('user_id', userId)
    .eq('is_active', true)
    .eq('type', 'expense')
    .in('frequency', ['monthly', 'weekly', 'daily']);
  const activeExpenseRules: RecurringRule[] = rulesData || [];

  const { toArs, excludedCurrencies } = await buildToArsConverter([
    ...mtdTransactions,
    ...trailingExpenses,
    ...activeExpenseRules,
  ]);

  const incomeARS = mtdTransactions
    .filter((t) => t.type === 'income')
    .reduce((sum, t) => sum + toArs(t), 0);
  const spentARS = mtdTransactions
    .filter((t) => t.type === 'expense')
    .reduce((sum, t) => sum + toArs(t), 0);

  // Días de historia realmente disponibles para el promedio (evita inflar el
  // denominador a principio de mes/cuenta nueva, cuando hay menos de 14 días).
  const daysOfHistory = Math.min(TRAILING_WINDOW_DAYS, Math.max(1, now.getDate()));
  const trailingTotalARS = trailingExpenses.reduce((sum, t) => sum + toArs(t), 0);
  const avgDailySpendARS = trailingTotalARS / daysOfHistory;

  let pendingRecurringARS = 0;
  for (const rule of activeExpenseRules) {
    const ranThisMonth =
      !!rule.last_executed_date &&
      (() => {
        const d = new Date(rule.last_executed_date as string);
        return d.getFullYear() === year && d.getMonth() === month;
      })();
    if (ranThisMonth) continue;

    const startDate = new Date(rule.start_date);
    if (startDate > monthEnd) continue; // todavía no arrancó
    if (rule.end_date && new Date(rule.end_date) < monthStart) continue; // ya terminó

    let occurrencesLeft = 0;
    if (rule.frequency === 'monthly') {
      occurrencesLeft = 1;
    } else if (rule.frequency === 'weekly') {
      occurrencesLeft = Math.ceil(daysLeft / 7);
    } else if (rule.frequency === 'daily') {
      occurrencesLeft = daysLeft;
    }
    pendingRecurringARS += toArs(rule) * occurrencesLeft;
  }

  const projectedSpendARS = spentARS + avgDailySpendARS * daysLeft + pendingRecurringARS;

  return { incomeARS, spentARS, projectedSpendARS, daysLeft, excludedCurrencies };
}
