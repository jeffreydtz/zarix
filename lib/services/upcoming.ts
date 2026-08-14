import { createServiceClientSync } from '@/lib/supabase/server';
import type { Account, Investment, RecurringRule } from '@/types/database';

export type UpcomingKind = 'recurring' | 'card_close' | 'card_due' | 'maturity';

export interface UpcomingItem {
  kind: UpcomingKind;
  label: string;
  /** YYYY-MM-DD */
  dateISO: string;
  amountARS?: number;
  currency?: string;
}

/** Cuántos días hacia adelante buscamos vencimientos de tarjeta / la próxima corrida de una regla recurrente. */
const CARD_HORIZON_DAYS = 45;
/** Tope de búsqueda para la próxima ocurrencia de una regla `yearly` (>1 vuelta de calendario). */
const RECURRING_HORIZON_DAYS = 400;
/** Sólo inversiones que vencen dentro de esta ventana entran al listado. */
const MATURITY_HORIZON_DAYS = 30;

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function toISODate(d: Date): string {
  return d.toISOString().split('T')[0];
}

function addDays(d: Date, days: number): Date {
  const next = new Date(d);
  next.setDate(next.getDate() + days);
  return next;
}

/** Misma lógica de matching que `app/api/cron/recurring/route.ts::shouldExecuteToday`, pero para una fecha arbitraria. */
function matchesFrequency(rule: RecurringRule, date: Date, startDate: Date): boolean {
  if (rule.frequency === 'daily') return true;

  if (rule.frequency === 'weekly') {
    return date.getDay() === startDate.getDay();
  }

  if (rule.frequency === 'monthly') {
    const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
    const targetDay = Math.min(startDate.getDate(), lastDay);
    return date.getDate() === targetDay;
  }

  if (rule.frequency === 'yearly') {
    if (date.getMonth() !== startDate.getMonth()) return false;
    const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
    const targetDay = Math.min(startDate.getDate(), lastDay);
    return date.getDate() === targetDay;
  }

  return false;
}

/** Próxima fecha (>= hoy) en la que la regla ejecutaría, o null si ya terminó / no hay ninguna dentro del horizonte. */
function getNextOccurrence(rule: RecurringRule, today: Date): Date | null {
  const startDate = new Date(rule.start_date);
  startDate.setHours(0, 0, 0, 0);

  const endDate = rule.end_date ? new Date(rule.end_date) : null;
  if (endDate) endDate.setHours(0, 0, 0, 0);

  const lastExec = rule.last_executed_date ? new Date(rule.last_executed_date) : null;
  if (lastExec) lastExec.setHours(0, 0, 0, 0);

  let cursor = today < startDate ? new Date(startDate) : new Date(today);

  for (let i = 0; i <= RECURRING_HORIZON_DAYS; i++) {
    if (endDate && cursor > endDate) return null;

    const alreadyExecuted = lastExec && cursor.getTime() === lastExec.getTime();
    if (!alreadyExecuted && matchesFrequency(rule, cursor, startDate)) {
      return cursor;
    }

    cursor = addDays(cursor, 1);
  }

  return null;
}

/** Próxima fecha (>= hoy) en la que cae el día `day` del mes, clampeado a la duración real del mes. */
function nextDateForMonthDay(day: number, today: Date): Date {
  const lastDayThisMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  const targetDayThisMonth = Math.min(day, lastDayThisMonth);
  const candidate = new Date(today.getFullYear(), today.getMonth(), targetDayThisMonth);

  if (candidate >= today) return candidate;

  const nextMonth = new Date(today.getFullYear(), today.getMonth() + 1, 1);
  const lastDayNextMonth = new Date(nextMonth.getFullYear(), nextMonth.getMonth() + 1, 0).getDate();
  const targetDayNextMonth = Math.min(day, lastDayNextMonth);
  return new Date(nextMonth.getFullYear(), nextMonth.getMonth(), targetDayNextMonth);
}

/**
 * Lista cronológica unificada de próximas obligaciones/eventos: próximas
 * corridas de reglas recurrentes de gasto, cierres/vencimientos de tarjeta
 * de crédito y vencimientos de inversiones dentro de los próximos 30 días.
 */
export async function getUpcoming(userId: string, limit = 5): Promise<UpcomingItem[]> {
  const supabase = createServiceClientSync();
  const today = startOfToday();

  const [rulesRes, accountsRes, investmentsRes] = await Promise.all([
    supabase
      .from('recurring_rules')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true)
      .eq('type', 'expense'),
    supabase
      .from('accounts')
      .select('*')
      .eq('user_id', userId)
      .eq('type', 'credit_card')
      .eq('is_active', true),
    supabase
      .from('investments')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true)
      .not('maturity_date', 'is', null),
  ]);

  if (rulesRes.error) throw rulesRes.error;
  if (accountsRes.error) throw accountsRes.error;
  if (investmentsRes.error) throw investmentsRes.error;

  const items: UpcomingItem[] = [];

  // 1. Reglas recurrentes de gasto activas.
  for (const rule of (rulesRes.data ?? []) as RecurringRule[]) {
    const next = getNextOccurrence(rule, today);
    if (!next) continue;

    items.push({
      kind: 'recurring',
      label: rule.subscription_name || rule.description,
      dateISO: toISODate(next),
      amountARS: Number(rule.amount),
      currency: rule.currency,
    });
  }

  // 2. Cierres y vencimientos de tarjeta de crédito.
  const cardHorizon = addDays(today, CARD_HORIZON_DAYS);
  for (const card of (accountsRes.data ?? []) as Account[]) {
    if (card.closing_day) {
      const closeDate = nextDateForMonthDay(card.closing_day, today);
      if (closeDate <= cardHorizon) {
        items.push({
          kind: 'card_close',
          label: `Cierre ${card.name}`,
          dateISO: toISODate(closeDate),
        });
      }
    }

    if (card.due_day) {
      const dueDate = nextDateForMonthDay(card.due_day, today);
      if (dueDate <= cardHorizon) {
        items.push({
          kind: 'card_due',
          label: `Vencimiento ${card.name}`,
          dateISO: toISODate(dueDate),
          amountARS: Math.abs(Number(card.balance)),
          currency: card.currency,
        });
      }
    }
  }

  // 3. Inversiones con vencimiento dentro de los próximos 30 días.
  const maturityHorizon = addDays(today, MATURITY_HORIZON_DAYS);
  for (const investment of (investmentsRes.data ?? []) as Investment[]) {
    if (!investment.maturity_date) continue;

    const maturityDate = new Date(investment.maturity_date);
    maturityDate.setHours(0, 0, 0, 0);

    if (maturityDate < today || maturityDate > maturityHorizon) continue;

    items.push({
      kind: 'maturity',
      label: `Vencimiento ${investment.ticker || investment.name}`,
      dateISO: toISODate(maturityDate),
      amountARS: Number(investment.quantity) * Number(investment.purchase_price),
      currency: investment.purchase_currency,
    });
  }

  items.sort((a, b) => (a.dateISO < b.dateISO ? -1 : a.dateISO > b.dateISO ? 1 : 0));

  return items.slice(0, limit);
}
