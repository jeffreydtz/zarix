import { describe, it, expect } from 'vitest';
import {
  isTransactionCurrency,
  coerceTransactionCurrency,
  TRANSACTION_CURRENCIES,
} from '@/lib/constants/transaction-currencies';

describe('isTransactionCurrency', () => {
  it('accepts the allowed currencies (case/whitespace insensitive)', () => {
    expect(isTransactionCurrency('ARS')).toBe(true);
    expect(isTransactionCurrency('USD')).toBe(true);
    expect(isTransactionCurrency('EUR')).toBe(true);
    expect(isTransactionCurrency('ars')).toBe(true);
    expect(isTransactionCurrency(' usd ')).toBe(true);
  });

  it('rejects unsupported currencies and nullish values', () => {
    expect(isTransactionCurrency('GBP')).toBe(false);
    expect(isTransactionCurrency('BTC')).toBe(false);
    expect(isTransactionCurrency('')).toBe(false);
    expect(isTransactionCurrency(null)).toBe(false);
    expect(isTransactionCurrency(undefined)).toBe(false);
  });
});

describe('coerceTransactionCurrency', () => {
  it('normalizes allowed currencies to uppercase', () => {
    expect(coerceTransactionCurrency('usd')).toBe('USD');
    expect(coerceTransactionCurrency(' eur ')).toBe('EUR');
    expect(coerceTransactionCurrency('ARS')).toBe('ARS');
  });

  it('falls back to ARS for unsupported or missing values', () => {
    expect(coerceTransactionCurrency('GBP')).toBe('ARS');
    expect(coerceTransactionCurrency('')).toBe('ARS');
    expect(coerceTransactionCurrency(null)).toBe('ARS');
    expect(coerceTransactionCurrency(undefined)).toBe('ARS');
  });
});

describe('TRANSACTION_CURRENCIES', () => {
  it('is exactly ARS, USD, EUR', () => {
    expect([...TRANSACTION_CURRENCIES]).toEqual(['ARS', 'USD', 'EUR']);
  });
});
