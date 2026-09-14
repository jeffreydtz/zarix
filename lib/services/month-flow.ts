import { createServiceClientSync } from '@/lib/supabase/server';
import { accountsService } from '@/lib/services/accounts';
import { applyArchivedAccountsTransactionFilter, buildToArsConverter } from '@/lib/services/transactions';
import type { Transaction, RecurringRule } from '@/types/database';

export interface MonthFlow {
  incomeARS: number;
  spentARS: number;
  projectedSpendARS: number;
  daysLeft: number;
  excludedCurrencies: string[];
  month?: string;
}

const TRAILING_WINDOW_DAYS = 14;
const DAY_MS = 86400000;
const ARGENTINA_TIMEZONE = 'America/Argentina/Buenos_Aires';
type FlowTransaction = Pick<Transaction, 'amount' | 'currency' | 'type' | 'transaction_date' | 'is_recurring' | 'recurring_rule_id'>;

export function argentinaDate(now: Date): string {
  return now.toLocaleDateString('en-CA', { timeZone: ARGENTINA_TIMEZONE });
}

/** Argentina actualmente tiene UTC−3; las fechas de reglas son días calendario. */
export function monthFlowDates(now: Date) {
  const today = argentinaDate(now);
  const [year, month, day] = today.split('-').map(Number);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return {
    today, month: today.slice(0, 7), daysLeft: daysInMonth - day,
    monthStart: new Date(`${today.slice(0, 7)}-01T00:00:00-03:00`),
    trailingStart: new Date(now.getTime() - TRAILING_WINDOW_DAYS * DAY_MS),
    daysInMonth,
  };
}

/** Cuenta las ocurrencias futuras reales; respeta inicio, fin y meses cortos. */
export function remainingOccurrences(rule: RecurringRule, now: Date, executedToday = false): number {
  const dates = monthFlowDates(now);
  const startISO = rule.start_date.slice(0, 10);
  const endISO = rule.end_date?.slice(0, 10);
  const start = new Date(`${startISO}T12:00:00Z`);
  if (!Number.isFinite(start.getTime())) return 0;
  const lastISO = rule.last_executed_date?.slice(0, 10);
  const cursor = new Date(`${dates.today}T12:00:00Z`);
  let count = 0;
  // Una obligación de hoy todavía pendiente también forma parte del gasto estimado.
  for (let remaining = 0; remaining <= dates.daysLeft; remaining++) {
    const iso = cursor.toISOString().slice(0, 10);
    const current = new Date(cursor);
    const isToday = remaining === 0;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    if (isToday && executedToday) continue;
    if (iso < startISO || (endISO && iso > endISO) || (lastISO && iso <= lastISO)) continue;
    const targetDay = Math.min(start.getUTCDate(), dates.daysInMonth);
    const matches = rule.frequency === 'daily'
      || (rule.frequency === 'weekly' && current.getUTCDay() === start.getUTCDay())
      || (rule.frequency === 'monthly' && current.getUTCDate() === targetDay)
      || (rule.frequency === 'yearly' && current.getUTCMonth() === start.getUTCMonth() && current.getUTCDate() === targetDay);
    if (matches) count++;
  }
  return count;
}

export function calculateMonthFlow(
  transactions: FlowTransaction[], rules: RecurringRule[], now: Date,
  toArs: (row: { amount: number; currency: string | null }) => number,
  excludedCurrencies: string[] = [],
): MonthFlow {
  const dates = monthFlowDates(now);
  let incomeARS = 0, spentARS = 0, variableTrailingARS = 0;
  for (const transaction of transactions) {
    const at = new Date(transaction.transaction_date);
    if (at > now) continue;
    const amount = toArs(transaction);
    if (at >= dates.monthStart) {
      if (transaction.type === 'income') incomeARS += amount;
      if (transaction.type === 'expense') spentARS += amount;
    }
    if (at >= dates.trailingStart && transaction.type === 'expense'
      && !transaction.is_recurring && !transaction.recurring_rule_id) variableTrailingARS += amount;
  }
  const executedToday = new Set(transactions.filter((transaction) => transaction.type === 'expense'
    && transaction.recurring_rule_id && new Date(transaction.transaction_date) <= now
    && argentinaDate(new Date(transaction.transaction_date)) === dates.today)
    .map((transaction) => transaction.recurring_rule_id));
  const recurringARS = rules.reduce((sum, rule) => sum + toArs(rule) * remainingOccurrences(rule, now, executedToday.has(rule.id)), 0);
  return {
    incomeARS, spentARS,
    projectedSpendARS: spentARS + variableTrailingARS / TRAILING_WINDOW_DAYS * dates.daysLeft + recurringARS,
    daysLeft: dates.daysLeft, excludedCurrencies, month: dates.month,
  };
}

/** Flujo en calendario argentino, sin mezclar monedas ni duplicar gastos recurrentes. */
export async function getMonthFlow(userId: string): Promise<MonthFlow> {
  const supabase = createServiceClientSync();
  const now = new Date();
  const dates = monthFlowDates(now);
  const activeIds = await accountsService.getActiveAccountIds(userId);
  const since = new Date(Math.min(dates.monthStart.getTime(), dates.trailingStart.getTime()));
  const transactions: FlowTransaction[] = [];
  // Una sola ventana paginada evita repetir MTD y últimos 14 días o truncar totales.
  for (let from = 0; ; from += 500) {
    let query = supabase.from('transactions')
      .select('amount,currency,type,transaction_date,is_recurring,recurring_rule_id,id')
      .eq('user_id', userId).gte('transaction_date', since.toISOString())
      .lte('transaction_date', now.toISOString()).order('id').range(from, from + 499);
    query = applyArchivedAccountsTransactionFilter(query, activeIds);
    const { data, error } = await query;
    if (error) throw error;
    transactions.push(...(data ?? []));
    if (!data || data.length < 500) break;
  }
  const { data, error } = await supabase.from('recurring_rules').select('*')
    .eq('user_id', userId).eq('is_active', true).eq('type', 'expense');
  if (error) throw error;
  const rules = ((data ?? []) as RecurringRule[]).filter((rule) => activeIds.includes(rule.account_id));
  const { toArs, excludedCurrencies } = await buildToArsConverter([...transactions, ...rules]);
  return calculateMonthFlow(transactions, rules, now, toArs, excludedCurrencies);
}
