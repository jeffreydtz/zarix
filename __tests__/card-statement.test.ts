import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import CardStatementPanel from '@/components/dashboard/CardStatementPanel';
import {
  chargeInPeriod,
  clampMonthDay,
  dueDateForClosing,
  futureDebtTotals,
  nextClosingOnOrAfter,
  nextNClosings,
  pendingInstallmentsByMonth,
  previousClosingBefore,
  primaryTotal,
  projectCardStatement,
  statementPeriodForClosing,
  type CardCharge,
  type CardStatementAccount,
} from '@/lib/card-statement';
import { transactionToCardCharge } from '@/lib/services/card-statement';
import type { Transaction } from '@/types/database';

const visa: CardStatementAccount = {
  id: 'card-visa',
  name: 'Visa Ejemplo',
  last_4_digits: '1234',
  currency: 'ARS',
  secondary_currency: 'USD',
  is_multicurrency: true,
  closing_day: 15,
  due_day: 25,
};

function charge(partial: Partial<CardCharge> & Pick<CardCharge, 'id' | 'amount' | 'dateISO'>): CardCharge {
  return {
    accountId: visa.id,
    kind: 'charge',
    currency: 'ARS',
    description: 'Compra',
    installmentNumber: null,
    installmentTotal: null,
    installmentGroupId: null,
    ...partial,
  };
}

describe('card statement calendar (Córdoba civil)', () => {
  it('clamps closing day 31 in February', () => {
    expect(clampMonthDay('2026-02-10', 31)).toBe('2026-02-28');
    expect(clampMonthDay('2028-02-01', 31)).toBe('2028-02-29');
  });

  it('picks this month when today is on or before closing day', () => {
    expect(nextClosingOnOrAfter(15, '2026-11-10')).toBe('2026-11-15');
    expect(nextClosingOnOrAfter(15, '2026-11-15')).toBe('2026-11-15');
  });

  it('rolls to next month after closing day', () => {
    expect(nextClosingOnOrAfter(15, '2026-11-16')).toBe('2026-12-15');
  });

  it('builds the statement window as (previous closing, current closing]', () => {
    expect(previousClosingBefore(15, '2026-11-15')).toBe('2026-10-15');
    expect(statementPeriodForClosing(15, '2026-11-15')).toEqual({
      startISO: '2026-10-16',
      endISO: '2026-11-15',
    });
    expect(chargeInPeriod(charge({ id: 'a', amount: 1, dateISO: '2026-10-15' }), '2026-10-16', '2026-11-15')).toBe(false);
    expect(chargeInPeriod(charge({ id: 'b', amount: 1, dateISO: '2026-10-16' }), '2026-10-16', '2026-11-15')).toBe(true);
    expect(chargeInPeriod(charge({ id: 'c', amount: 1, dateISO: '2026-11-15' }), '2026-10-16', '2026-11-15')).toBe(true);
  });

  it('places due date after closing, wrapping the month when due_day <= closing_day', () => {
    expect(dueDateForClosing(25, '2026-11-15')).toBe('2026-11-25');
    expect(dueDateForClosing(10, '2026-11-25')).toBe('2026-12-10');
  });

  it('lists the next N closings', () => {
    expect(nextNClosings(15, '2026-11-16', 3)).toEqual([
      '2026-12-15',
      '2027-01-15',
      '2027-02-15',
    ]);
  });
});

describe('card statement projection', () => {
  const charges: CardCharge[] = [
    charge({ id: 'exp-now', amount: 10000, dateISO: '2026-11-01', description: 'Super' }),
    charge({
      id: 'cuota-2',
      amount: 5000,
      dateISO: '2026-11-10',
      description: 'Frávega',
      installmentNumber: 2,
      installmentTotal: 6,
      installmentGroupId: 'grp-1',
    }),
    charge({
      id: 'cuota-3',
      amount: 5000,
      dateISO: '2026-12-10',
      description: 'Frávega',
      installmentNumber: 3,
      installmentTotal: 6,
      installmentGroupId: 'grp-1',
    }),
    charge({
      id: 'usd',
      amount: 80,
      currency: 'USD',
      dateISO: '2026-11-02',
      description: 'Steam',
    }),
    charge({
      id: 'pago',
      kind: 'payment',
      amount: 2000,
      dateISO: '2026-11-05',
      description: 'Pago',
    }),
  ];

  it('estimates the next statement as cycle charges minus payments, not the full card balance', () => {
    const projection = projectCardStatement(visa, charges, { todayISO: '2026-11-08', cycles: 3 });
    expect(projection.nextClosingISO).toBe('2026-11-15');
    expect(projection.nextDueISO).toBe('2026-11-25');
    expect(projection.nextStatementTotals).toEqual({ ARS: 13000, USD: 80 });
    expect(primaryTotal(projection.nextStatementTotals, 'ARS')).toBe(13000);
    expect(projection.cycles[0]?.isCurrent).toBe(true);
    expect(projection.cycles[1]?.closingISO).toBe('2026-12-15');
    expect(projection.cycles[1]?.totals).toEqual({ ARS: 5000 });
  });

  it('groups remaining installments by month and sums future debt in ARS and USD', () => {
    const projection = projectCardStatement(visa, charges, { todayISO: '2026-11-08', cycles: 3 });
    expect(futureDebtTotals(charges, '2026-11-08')).toEqual({ ARS: 10000 });
    expect(projection.futureDebtTotals).toEqual({ ARS: 10000 });
    expect(pendingInstallmentsByMonth(charges, '2026-11-08').map((row) => row.month)).toEqual([
      '2026-11',
      '2026-12',
    ]);
  });

  it('keeps ARS and USD separate on a bimoneda card', () => {
    const projection = projectCardStatement(visa, charges, { todayISO: '2026-11-08' });
    expect(projection.isMulticurrency).toBe(true);
    expect(projection.nextStatementTotals.ARS).toBe(13000);
    expect(projection.nextStatementTotals.USD).toBe(80);
  });

  it('still lists pending cuotas when the card has no closing day', () => {
    const projection = projectCardStatement(
      { ...visa, closing_day: null, due_day: null },
      charges,
      { todayISO: '2026-11-08' }
    );
    expect(projection.nextClosingISO).toBeNull();
    expect(projection.cycles).toEqual([]);
    expect(projection.pendingByMonth).toHaveLength(2);
  });
});

describe('transactionToCardCharge', () => {
  const base = {
    user_id: 'u1',
    category_id: null,
    notes: null,
    tags: null,
    receipt_url: null,
    location: null,
    is_recurring: false,
    recurring_rule_id: null,
    installment_number: null,
    installment_total: null,
    installment_group_id: null,
    created_at: '2026-11-08T12:00:00Z',
    updated_at: '2026-11-08T12:00:00Z',
    exchange_rate: 1,
  };

  it('maps an expense on the card as a charge and a transfer in as a payment', () => {
    const expense = transactionToCardCharge({
      ...base,
      id: 'tx-1',
      type: 'expense',
      account_id: 'card-visa',
      destination_account_id: null,
      amount: 1500,
      currency: 'ARS',
      amount_in_account_currency: 1500,
      transaction_date: '2026-11-08',
      description: 'Café',
    } as Transaction, 'card-visa');
    expect(expense).toMatchObject({ kind: 'charge', amount: 1500, dateISO: '2026-11-08' });

    const payment = transactionToCardCharge({
      ...base,
      id: 'tx-2',
      type: 'transfer',
      account_id: 'bank-1',
      destination_account_id: 'card-visa',
      amount: 4000,
      currency: 'ARS',
      amount_in_account_currency: 4000,
      destination_amount_in_account_currency: 4000,
      transaction_date: '2026-11-08T12:00:00.000Z',
      description: 'Pago tarjeta',
    } as Transaction, 'card-visa');
    expect(payment).toMatchObject({ kind: 'payment', amount: 4000 });
  });
});

describe('CardStatementPanel', () => {
  it('renders next close/due, future debt and pending installments', () => {
    const statement = projectCardStatement(visa, [
      charge({
        id: 'cuota-2',
        amount: 5000,
        dateISO: '2026-12-10',
        description: 'Frávega',
        installmentNumber: 2,
        installmentTotal: 6,
        installmentGroupId: 'grp-1',
      }),
      charge({ id: 'exp', amount: 12000, dateISO: '2026-11-01' }),
    ], { todayISO: '2026-11-08' });
    const html = renderToStaticMarkup(createElement(CardStatementPanel, { statement }));
    expect(html).toContain('Próximo cierre');
    expect(html).toContain('Vencimiento');
    expect(html).toContain('Deuda futura');
    expect(html).toContain('Cuotas pendientes');
    expect(html).toContain('Frávega');
    expect(html).toContain('mínimo');
  });
});
