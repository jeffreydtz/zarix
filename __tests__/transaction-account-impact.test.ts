import { describe, it, expect } from 'vitest';
import type { TransactionWithCategory } from '@/lib/services/transactions';
import {
  impactInAccountCurrency,
  aggregateOriginalByCurrency,
  sumImpactInAccountCurrency,
} from '@/lib/transaction-account-impact';

function makeTx(overrides: Partial<TransactionWithCategory>): TransactionWithCategory {
  return {
    id: 't1',
    user_id: 'u1',
    type: 'expense',
    account_id: 'A',
    destination_account_id: null,
    amount: 0,
    currency: 'ARS',
    amount_in_account_currency: 0,
    exchange_rate: null,
    category_id: null,
    description: null,
    notes: null,
    tags: null,
    transaction_date: '2026-01-01T12:00:00.000Z',
    receipt_url: null,
    location: null,
    is_recurring: false,
    recurring_rule_id: null,
    installment_number: null,
    installment_total: null,
    installment_group_id: null,
    created_at: '2026-01-01T12:00:00.000Z',
    updated_at: '2026-01-01T12:00:00.000Z',
    ...overrides,
  };
}

describe('impactInAccountCurrency — source account', () => {
  it('expense is negative in account currency', () => {
    const tx = makeTx({ account_id: 'A', type: 'expense', amount: 500, amount_in_account_currency: 500 });
    expect(impactInAccountCurrency(tx, 'A', { accountCurrency: 'ARS' })).toBe(-500);
  });

  it('income is positive in account currency', () => {
    const tx = makeTx({ account_id: 'A', type: 'income', amount: 500, amount_in_account_currency: 500 });
    expect(impactInAccountCurrency(tx, 'A', { accountCurrency: 'ARS' })).toBe(500);
  });

  it('transfer out is always negative (abs of ain)', () => {
    const tx = makeTx({ account_id: 'A', type: 'transfer', amount_in_account_currency: 300 });
    expect(impactInAccountCurrency(tx, 'A')).toBe(-300);
    const txNeg = makeTx({ account_id: 'A', type: 'transfer', amount_in_account_currency: -300 });
    expect(impactInAccountCurrency(txNeg, 'A')).toBe(-300);
  });

  it('adjustment keeps its sign (can be negative)', () => {
    const pos = makeTx({ account_id: 'A', type: 'adjustment', amount_in_account_currency: 200 });
    expect(impactInAccountCurrency(pos, 'A')).toBe(200);
    const neg = makeTx({ account_id: 'A', type: 'adjustment', amount_in_account_currency: -200 });
    expect(impactInAccountCurrency(neg, 'A')).toBe(-200);
  });

  it('applies fx correction on a foreign expense with legacy 1:1 rate', () => {
    const tx = makeTx({
      account_id: 'A',
      type: 'expense',
      currency: 'USD',
      amount: 10,
      exchange_rate: 1,
      amount_in_account_currency: 10,
    });
    const out = impactInAccountCurrency(tx, 'A', {
      accountCurrency: 'ARS',
      fx: { usdToArs: 1000, eurArs: 1100 },
    });
    expect(out).toBe(-10000);
  });

  it('uses tx.account.currency when accountCurrency option is absent', () => {
    const tx = makeTx({
      account_id: 'A',
      type: 'expense',
      currency: 'ARS',
      amount: 250,
      amount_in_account_currency: 250,
      account: { name: 'Caja', currency: 'ARS' },
    });
    expect(impactInAccountCurrency(tx, 'A')).toBe(-250);
  });
});

describe('impactInAccountCurrency — destination account', () => {
  it('transfer in credits amount * exchange_rate', () => {
    const tx = makeTx({
      account_id: 'A',
      destination_account_id: 'B',
      type: 'transfer',
      amount: 100,
      exchange_rate: 2,
    });
    expect(impactInAccountCurrency(tx, 'B')).toBe(200);
  });

  it('transfer in with null exchange_rate uses rate 1', () => {
    const tx = makeTx({
      account_id: 'A',
      destination_account_id: 'B',
      type: 'transfer',
      amount: 100,
      exchange_rate: null,
    });
    expect(impactInAccountCurrency(tx, 'B')).toBe(100);
  });
});

describe('impactInAccountCurrency — unrelated', () => {
  it('returns 0 when the account is neither source nor destination', () => {
    const tx = makeTx({ account_id: 'A', type: 'expense', amount: 500, amount_in_account_currency: 500 });
    expect(impactInAccountCurrency(tx, 'Z')).toBe(0);
  });
});

describe('sumImpactInAccountCurrency', () => {
  it('sums signed impacts across a mixed ledger', () => {
    const txs = [
      makeTx({ account_id: 'A', type: 'income', amount: 1000, amount_in_account_currency: 1000 }),
      makeTx({ account_id: 'A', type: 'expense', amount: 400, amount_in_account_currency: 400 }),
      makeTx({ account_id: 'A', type: 'transfer', amount_in_account_currency: 100 }),
    ];
    // +1000 - 400 - 100 = 500
    expect(sumImpactInAccountCurrency(txs, 'A', { accountCurrency: 'ARS' })).toBe(500);
  });
});

describe('aggregateOriginalByCurrency', () => {
  it('groups original amounts by currency with entry/exit signs', () => {
    const txs = [
      makeTx({ account_id: 'A', type: 'expense', currency: 'ARS', amount: 100 }),
      makeTx({ account_id: 'A', type: 'income', currency: 'ARS', amount: 300 }),
      makeTx({ account_id: 'A', type: 'expense', currency: 'USD', amount: 20 }),
    ];
    const agg = aggregateOriginalByCurrency(txs, 'A');
    expect(agg.ARS).toBe(200); // +300 - 100
    expect(agg.USD).toBe(-20);
  });

  it('credits a transfer destination in the destination account currency', () => {
    const tx = makeTx({
      account_id: 'A',
      destination_account_id: 'B',
      type: 'transfer',
      currency: 'USD',
      amount: 50,
      exchange_rate: 2,
      destination_account: { name: 'Dest', currency: 'ARS' },
    });
    const agg = aggregateOriginalByCurrency([tx], 'B');
    expect(agg.ARS).toBe(100); // 50 * 2
  });
});
