import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RecurringRule } from '@/types/database';

const mocks = vi.hoisted(() => ({
  accounts: vi.fn(), portfolio: vi.fn(), quotes: vi.fn(), upsert: vi.fn(),
}));
vi.mock('@/lib/supabase/server', () => ({ createServiceClientSync: () => ({ from: () => ({ upsert: mocks.upsert }) }) }));
vi.mock('@/lib/services/accounts', () => ({ accountsService: {
  list: mocks.accounts, aggregateAccountTotals: () => ({ liquidUSD: 100, investmentsUSD: 0, totalUSD: 100, totalARSBlue: 150000 }),
} }));
vi.mock('@/lib/services/investments', () => ({ investmentsService: { getPortfolioSummary: mocks.portfolio } }));
vi.mock('@/lib/services/cotizaciones', () => ({ cotizacionesService: { getDolarQuotes: mocks.quotes } }));
vi.mock('@/lib/services/transactions', () => ({ applyArchivedAccountsTransactionFilter: vi.fn(), buildToArsConverter: vi.fn() }));
import { recordNetWorthSnapshot } from '@/lib/services/net-worth';
import { calculateMonthFlow, monthFlowDates, remainingOccurrences } from '@/lib/services/month-flow';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.accounts.mockResolvedValue([{}]);
  mocks.portfolio.mockResolvedValue({ totalCurrentValue: 50, totalCurrentValueArsBlue: 75000 });
  mocks.quotes.mockResolvedValue({ blue: { sell: 1500 } });
  mocks.upsert.mockResolvedValue({ error: null });
});

describe('Patrimonio: no persistir historia financiera incompleta', () => {
  it.each(['accounts', 'portfolio'] as const)('no escribe cuando falla %s aunque la cotización funcione', async (source) => {
    mocks[source].mockRejectedValue(new Error('Servicio no disponible'));
    expect(await recordNetWorthSnapshot('user-a')).toBe(false);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
  it('rechaza valores no finitos', async () => {
    mocks.portfolio.mockResolvedValue({ totalCurrentValue: Infinity, totalCurrentValueArsBlue: 0 });
    expect(await recordNetWorthSnapshot('user-a')).toBe(false);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
  it('permite patrimonio vacío legítimo y conserva scope del dueño', async () => {
    mocks.accounts.mockResolvedValue([]);
    mocks.portfolio.mockResolvedValue({ totalCurrentValue: 0, totalCurrentValueArsBlue: 0 });
    expect(await recordNetWorthSnapshot('user-a')).toBe(true);
    expect(mocks.upsert).toHaveBeenCalledWith(expect.objectContaining({ user_id: 'user-a', total_usd: 0 }), { onConflict: 'user_id,snapshot_date' });
  });
});

function rule(patch: Partial<RecurringRule> = {}): RecurringRule {
  return { id: 'rent', user_id: 'u', account_id: 'a', type: 'expense', amount: 14000,
    currency: 'ARS', category_id: null, description: 'Alquiler', frequency: 'monthly',
    start_date: '2026-08-28', end_date: null, last_executed_date: '2026-08-28',
    is_subscription: false, subscription_name: null, subscription_plan: null,
    notification_enabled: true, is_active: true, created_at: '2026-01-01', ...patch };
}
const toArs = (row: { amount: number }) => Number(row.amount);

describe('Proyección en calendario argentino', () => {
  it('mantiene agosto durante las tres primeras horas UTC de septiembre', () => {
    const dates = monthFlowDates(new Date('2026-09-01T01:00:00Z'));
    expect(dates.today).toBe('2026-08-31');
    expect(dates.monthStart.toISOString()).toBe('2026-08-01T03:00:00.000Z');
    expect(dates.daysLeft).toBe(0);
  });
  it('no extrapola el alquiler mensual como gasto diario variable', () => {
    const flow = calculateMonthFlow([{ amount: 14000, currency: 'ARS', type: 'expense',
      transaction_date: '2026-08-28T12:00:00Z', is_recurring: true, recurring_rule_id: 'rent' }],
    [rule()], new Date('2026-09-01T15:00:00Z'), toArs);
    expect(flow.spentARS).toBe(0);
    expect(flow.projectedSpendARS).toBe(14000);
  });
  it('cuenta solamente los días posteriores al inicio real de la regla', () => {
    expect(remainingOccurrences(rule({ frequency: 'daily', start_date: '2026-09-29', last_executed_date: null }), new Date('2026-09-01T15:00:00Z'))).toBe(2);
  });
  it('respeta el fin de la regla', () => {
    expect(remainingOccurrences(rule({ frequency: 'daily', start_date: '2026-09-01', end_date: '2026-09-03', last_executed_date: '2026-09-01' }), new Date('2026-09-01T15:00:00Z'))).toBe(2);
  });
  it('ajusta día 31 a febrero y contempla recurrencia anual', () => {
    expect(remainingOccurrences(rule({ start_date: '2026-01-31', last_executed_date: null }), new Date('2026-02-01T15:00:00Z'))).toBe(1);
    expect(remainingOccurrences(rule({ start_date: '2024-02-29', frequency: 'yearly', last_executed_date: null }), new Date('2026-02-01T15:00:00Z'))).toBe(1);
  });
});


describe('Recurrencias pendientes para hoy', () => {
  const now = new Date('2026-09-14T10:00:00Z');
  const rent = rule({ amount: 100000, start_date: '2026-01-14', last_executed_date: '2026-08-14' });
  it('incluye la obligación de hoy aunque todavía no corrió el cron', () => {
    expect(calculateMonthFlow([], [rent], now, toArs).projectedSpendARS).toBe(100000);
  });
  it('no cuenta dos veces el movimiento registrado hoy aunque last_executed_date esté atrasado', () => {
    const flow = calculateMonthFlow([{ amount: 100000, currency: 'ARS', type: 'expense',
      transaction_date: '2026-09-14T09:00:00Z', is_recurring: true, recurring_rule_id: rent.id }], [rent], now, toArs);
    expect(flow.spentARS).toBe(100000);
    expect(flow.projectedSpendARS).toBe(100000);
  });
  it('respeta la marca de ejecución de hoy sin volver a proyectar la regla', () => {
    expect(remainingOccurrences({ ...rent, last_executed_date: '2026-09-14' }, now)).toBe(0);
  });
});
