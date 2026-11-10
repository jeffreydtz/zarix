/**
 * Resumen proyectado de tarjeta a la argentina: ciclos de cierre/vencimiento,
 * cuotas pendientes mes a mes y deuda futura comprometida.
 *
 * Calendario civil Córdoba (misma regla que `create_installment_transactions`
 * y `lib/transaction-date.ts`). No convierte entre monedas: ARS y USD se
 * acumulan por separado. El equivalente blue queda para la UI que ya tiene FX.
 */
import {
  addDaysYmd,
  addMonthsYmd,
  civilTodayYmd,
  isCivilYmd,
  transactionCivilYmd,
} from '@/lib/transaction-date';

export const CARD_STATEMENT_CYCLES = 6;
export const CARD_STATEMENT_LOOKAHEAD_MONTHS = 24;

export type CardChargeKind = 'charge' | 'payment';

export interface CardCharge {
  id: string;
  accountId: string;
  kind: CardChargeKind;
  amount: number;
  currency: string;
  dateISO: string;
  description: string | null;
  installmentNumber: number | null;
  installmentTotal: number | null;
  installmentGroupId: string | null;
}

export type CurrencyTotals = Record<string, number>;

export interface StatementCycle {
  closingISO: string;
  dueISO: string | null;
  periodStartISO: string;
  periodEndISO: string;
  isCurrent: boolean;
  totals: CurrencyTotals;
  charges: CardCharge[];
  payments: CardCharge[];
  installments: CardCharge[];
}

export interface PendingInstallmentMonth {
  month: string;
  totals: CurrencyTotals;
  items: CardCharge[];
}

export interface CardStatementProjection {
  accountId: string;
  name: string;
  last4: string | null;
  primaryCurrency: string;
  secondaryCurrency: string | null;
  isMulticurrency: boolean;
  closingDay: number | null;
  dueDay: number | null;
  todayISO: string;
  nextClosingISO: string | null;
  nextDueISO: string | null;
  /** Monto estimado del próximo resumen (por moneda). No es el saldo de cuenta. */
  nextStatementTotals: CurrencyTotals;
  /** Suma de cuotas con fecha >= hoy (comprometido, por moneda). */
  futureDebtTotals: CurrencyTotals;
  cycles: StatementCycle[];
  pendingByMonth: PendingInstallmentMonth[];
}

export interface CardStatementAccount {
  id: string;
  name: string;
  last_4_digits: string | null;
  currency: string;
  secondary_currency: string | null;
  is_multicurrency: boolean;
  closing_day: number | null;
  due_day: number | null;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

export function emptyTotals(): CurrencyTotals {
  return {};
}

export function addAmount(totals: CurrencyTotals, currency: string, amount: number): void {
  const code = (currency || 'ARS').trim().toUpperCase() || 'ARS';
  if (!Number.isFinite(amount) || amount === 0) return;
  totals[code] = (totals[code] ?? 0) + amount;
}

export function totalsAreEmpty(totals: CurrencyTotals): boolean {
  return Object.values(totals).every((n) => !Number.isFinite(n) || Math.abs(n) < 1e-8);
}

export function primaryTotal(totals: CurrencyTotals, primaryCurrency: string): number | undefined {
  const code = (primaryCurrency || 'ARS').trim().toUpperCase() || 'ARS';
  const value = totals[code];
  if (value == null || !Number.isFinite(value)) {
    const keys = Object.keys(totals);
    if (keys.length === 1) return totals[keys[0]];
    return undefined;
  }
  return value;
}

/** Día `day` del mes de `fromISO` (YYYY-MM-DD), clampeado a la duración real del mes. */
export function clampMonthDay(fromISO: string, day: number): string {
  if (!isCivilYmd(fromISO) || !Number.isInteger(day) || day < 1 || day > 31) {
    return fromISO;
  }
  const year = Number(fromISO.slice(0, 4));
  const month = Number(fromISO.slice(5, 7));
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${year}-${pad2(month)}-${pad2(Math.min(day, last))}`;
}

export function nextClosingOnOrAfter(closingDay: number, fromISO: string): string {
  const thisMonth = clampMonthDay(fromISO, closingDay);
  if (thisMonth >= fromISO) return thisMonth;
  return clampMonthDay(addMonthsYmd(fromISO.slice(0, 8) + '01', 1), closingDay);
}

export function previousClosingBefore(closingDay: number, closingISO: string): string {
  const thisMonth = clampMonthDay(closingISO, closingDay);
  if (thisMonth < closingISO) return thisMonth;
  return clampMonthDay(addMonthsYmd(closingISO.slice(0, 8) + '01', -1), closingDay);
}

export function statementPeriodForClosing(
  closingDay: number,
  closingISO: string
): { startISO: string; endISO: string } {
  const previous = previousClosingBefore(closingDay, closingISO);
  return { startISO: addDaysYmd(previous, 1), endISO: closingISO };
}

/**
 * Vencimiento asociado a un cierre: mismo mes si `dueDay` cae después del
 * cierre; si no, el mes siguiente (ciclo típico Visa/Master argentina).
 */
export function dueDateForClosing(dueDay: number, closingISO: string): string {
  const sameMonth = clampMonthDay(closingISO, dueDay);
  if (sameMonth > closingISO) return sameMonth;
  return clampMonthDay(addMonthsYmd(closingISO.slice(0, 8) + '01', 1), dueDay);
}

export function nextNClosings(closingDay: number, fromISO: string, n: number): string[] {
  const out: string[] = [];
  let cursor = nextClosingOnOrAfter(closingDay, fromISO);
  for (let i = 0; i < n; i += 1) {
    out.push(cursor);
    cursor = nextClosingOnOrAfter(closingDay, addDaysYmd(cursor, 1));
  }
  return out;
}

export function chargeInPeriod(charge: CardCharge, startISO: string, endISO: string): boolean {
  const day = transactionCivilYmd(charge.dateISO);
  return day >= startISO && day <= endISO;
}

function signedAmount(charge: CardCharge): number {
  const abs = Math.abs(Number(charge.amount));
  if (!Number.isFinite(abs)) return 0;
  return charge.kind === 'payment' ? -abs : abs;
}

export function cycleTotals(charges: CardCharge[]): CurrencyTotals {
  const totals = emptyTotals();
  for (const charge of charges) {
    addAmount(totals, charge.currency, signedAmount(charge));
  }
  return totals;
}

export function isInstallment(charge: CardCharge): boolean {
  return Boolean(charge.installmentGroupId);
}

export function pendingInstallmentsByMonth(
  charges: readonly CardCharge[],
  fromISO: string
): PendingInstallmentMonth[] {
  const byMonth = new Map<string, CardCharge[]>();
  for (const charge of charges) {
    if (!isInstallment(charge) || charge.kind !== 'charge') continue;
    const day = transactionCivilYmd(charge.dateISO);
    if (day < fromISO) continue;
    const month = day.slice(0, 7);
    const list = byMonth.get(month) ?? [];
    list.push(charge);
    byMonth.set(month, list);
  }
  return Array.from(byMonth.entries())
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([month, items]) => ({
      month,
      items: items.slice().sort((a, b) => a.dateISO.localeCompare(b.dateISO)),
      totals: cycleTotals(items),
    }));
}

export function futureDebtTotals(charges: readonly CardCharge[], fromISO: string): CurrencyTotals {
  const totals = emptyTotals();
  for (const charge of charges) {
    if (!isInstallment(charge) || charge.kind !== 'charge') continue;
    if (transactionCivilYmd(charge.dateISO) < fromISO) continue;
    addAmount(totals, charge.currency, signedAmount(charge));
  }
  return totals;
}

export function projectCardStatement(
  account: CardStatementAccount,
  charges: readonly CardCharge[],
  options?: { todayISO?: string; cycles?: number }
): CardStatementProjection {
  const todayISO = options?.todayISO ?? civilTodayYmd();
  const cyclesCount = options?.cycles ?? CARD_STATEMENT_CYCLES;
  const closingDay = account.closing_day;
  const dueDay = account.due_day;
  const ownCharges = charges.filter((c) => c.accountId === account.id);

  const closings = closingDay ? nextNClosings(closingDay, todayISO, cyclesCount) : [];
  const nextClosingISO = closings[0] ?? null;
  const nextDueISO =
    nextClosingISO && dueDay ? dueDateForClosing(dueDay, nextClosingISO) : null;

  const cycles: StatementCycle[] = closings.map((closingISO, index) => {
    const period = statementPeriodForClosing(closingDay as number, closingISO);
    const inPeriod = ownCharges.filter((c) => chargeInPeriod(c, period.startISO, period.endISO));
    const installments = inPeriod.filter((c) => isInstallment(c) && c.kind === 'charge');
    const payments = inPeriod.filter((c) => c.kind === 'payment');
    const cycleCharges = inPeriod.filter((c) => c.kind === 'charge');
    return {
      closingISO,
      dueISO: dueDay ? dueDateForClosing(dueDay, closingISO) : null,
      periodStartISO: period.startISO,
      periodEndISO: period.endISO,
      isCurrent: index === 0,
      totals: cycleTotals(inPeriod),
      charges: cycleCharges,
      payments,
      installments,
    };
  });

  return {
    accountId: account.id,
    name: account.name,
    last4: account.last_4_digits,
    primaryCurrency: account.currency || 'ARS',
    secondaryCurrency: account.secondary_currency,
    isMulticurrency: Boolean(account.is_multicurrency && account.secondary_currency),
    closingDay,
    dueDay,
    todayISO,
    nextClosingISO,
    nextDueISO,
    nextStatementTotals: cycles[0]?.totals ?? emptyTotals(),
    futureDebtTotals: futureDebtTotals(ownCharges, todayISO),
    cycles,
    pendingByMonth: pendingInstallmentsByMonth(ownCharges, todayISO),
  };
}

export function formatMonthLabel(month: string): string {
  const [year, mm] = month.split('-');
  const date = new Date(Date.UTC(Number(year), Number(mm) - 1, 1));
  if (Number.isNaN(date.getTime())) return month;
  const label = date.toLocaleDateString('es-AR', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  return label.charAt(0).toUpperCase() + label.slice(1);
}
