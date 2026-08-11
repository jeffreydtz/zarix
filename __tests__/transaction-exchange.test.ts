import { describe, it, expect } from 'vitest';
import type { TransactionWithCategory } from '@/lib/services/transactions';
import {
  normalizeCurrency,
  approximateCrossRate,
  effectiveAmountInAccountCurrencyForMovement,
} from '@/lib/transaction-exchange';

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

describe('normalizeCurrency', () => {
  it('uppercases and trims', () => {
    expect(normalizeCurrency(' usd ')).toBe('USD');
    expect(normalizeCurrency('eur')).toBe('EUR');
  });
  it('defaults to ARS for null/undefined/empty', () => {
    expect(normalizeCurrency(null)).toBe('ARS');
    expect(normalizeCurrency(undefined)).toBe('ARS');
    expect(normalizeCurrency('')).toBe('ARS');
  });
});

describe('approximateCrossRate', () => {
  const fx = { usdToArs: 1000, eurArs: 1100 }; // eurUsd = 1.1

  it('returns 1 for same currency (case-insensitive)', () => {
    expect(approximateCrossRate('ARS', 'ARS', fx)).toBe(1);
    expect(approximateCrossRate('usd', 'USD', fx)).toBe(1);
  });

  it('computes the full USD/ARS/EUR matrix', () => {
    expect(approximateCrossRate('USD', 'ARS', fx)).toBe(1000);
    expect(approximateCrossRate('ARS', 'USD', fx)).toBeCloseTo(1 / 1000, 12);
    expect(approximateCrossRate('EUR', 'ARS', fx)).toBe(1100);
    expect(approximateCrossRate('ARS', 'EUR', fx)).toBeCloseTo(1 / 1100, 12);
    expect(approximateCrossRate('EUR', 'USD', fx)).toBeCloseTo(1.1, 12);
    expect(approximateCrossRate('USD', 'EUR', fx)).toBeCloseTo(1 / 1.1, 12);
  });

  it('guards against an invalid USD->ARS base rate', () => {
    expect(approximateCrossRate('USD', 'ARS', { usdToArs: 0, eurArs: 1100 })).toBeNull();
    expect(approximateCrossRate('USD', 'ARS', { usdToArs: -5, eurArs: 1100 })).toBeNull();
    expect(approximateCrossRate('USD', 'ARS', { usdToArs: NaN, eurArs: 1100 })).toBeNull();
  });

  it('returns null for EUR conversions when eurArs is missing/invalid', () => {
    const noEur = { usdToArs: 1000, eurArs: 0 };
    expect(approximateCrossRate('EUR', 'ARS', noEur)).toBeNull();
    expect(approximateCrossRate('ARS', 'EUR', noEur)).toBeNull();
    // eurUsd cannot be derived, so EUR<->USD also null
    expect(approximateCrossRate('EUR', 'USD', noEur)).toBeNull();
    expect(approximateCrossRate('USD', 'EUR', noEur)).toBeNull();
  });

  it('returns null for unknown currency pairs', () => {
    expect(approximateCrossRate('GBP', 'ARS', fx)).toBeNull();
    expect(approximateCrossRate('USD', 'BRL', fx)).toBeNull();
  });
});

describe('effectiveAmountInAccountCurrencyForMovement', () => {
  const fx = { usdToArs: 1000, eurArs: 1100 };

  it('returns |amount_in_account_currency| when currencies match', () => {
    const tx = makeTx({ currency: 'ARS', amount: 100, amount_in_account_currency: 1000 });
    expect(effectiveAmountInAccountCurrencyForMovement(tx, 'ARS')).toBe(1000);
  });

  it('returns ain when the original amount is ~zero', () => {
    const tx = makeTx({ currency: 'USD', amount: 0, amount_in_account_currency: 500 });
    expect(effectiveAmountInAccountCurrencyForMovement(tx, 'ARS')).toBe(500);
  });

  it('trusts a valid stored exchange_rate that matches ain', () => {
    const tx = makeTx({
      currency: 'USD',
      amount: 10,
      exchange_rate: 1000,
      amount_in_account_currency: 10000,
    });
    expect(effectiveAmountInAccountCurrencyForMovement(tx, 'ARS')).toBe(10000);
  });

  it('recomputes from rate when ain looks like the foreign amount', () => {
    const tx = makeTx({
      currency: 'USD',
      amount: 10,
      exchange_rate: 1000,
      amount_in_account_currency: 10, // stored wrong (== foreign amount)
    });
    expect(effectiveAmountInAccountCurrencyForMovement(tx, 'ARS')).toBe(10000);
  });

  it('treats exchange_rate === 1 across different currencies as absent (uses fx)', () => {
    const tx = makeTx({
      currency: 'USD',
      amount: 10,
      exchange_rate: 1, // invalid legacy 1:1 between distinct currencies
      amount_in_account_currency: 10,
    });
    expect(effectiveAmountInAccountCurrencyForMovement(tx, 'ARS', fx)).toBe(10000);
  });

  it('falls back to ain when suspicious but no fx is provided', () => {
    const tx = makeTx({
      currency: 'USD',
      amount: 10,
      exchange_rate: 1,
      amount_in_account_currency: 10,
    });
    expect(effectiveAmountInAccountCurrencyForMovement(tx, 'ARS')).toBe(10);
  });

  it('keeps a plausible stored ain when no rate and not suspicious', () => {
    const tx = makeTx({
      currency: 'USD',
      amount: 10,
      exchange_rate: null,
      amount_in_account_currency: 10000, // ratio 1000, plausible USD->ARS
    });
    expect(effectiveAmountInAccountCurrencyForMovement(tx, 'ARS')).toBe(10000);
  });
});
