import { describe, it, expect } from 'vitest';
import { formatAmountForInput } from '@/lib/evaluate-simple-amount-expression';
import { moneyAmountFromToken } from '@/lib/money-amount';
import { sanitizeAmountInput } from '@/lib/sanitize-amount-input';

describe('sanitizeAmountInput', () => {
  // Table-driven: [input, expected, note]
  const cases: Array<[string, string, string]> = [
    ['1.234,56', '1234,56', 'AR locale: dots are thousands, last comma is decimal'],
    ['1,234.56', '1234.56', 'US locale: last dot is decimal, commas stripped'],
    ['1.234.567', '1234.567', 'multiple dots -> last is decimal separator'],
    ['1.000.000,00', '1000000,00', 'millions AR locale'],
    ['$1.000,50 ARS', '1000,50', 'strips currency symbol and letters'],
    ['abc123', '123', 'letters stripped, no separator left'],
    ['100', '100', 'plain integer, no separator'],
    ['12,5', '12,5', 'single comma decimal preserved'],
    ['12.5', '12.5', 'single dot decimal preserved'],
    ['', '', 'empty stays empty'],
    ['1.234,', '1234,', 'trailing comma kept as (empty) decimal part'],
    [',', ',', 'lone comma: nothing before, comma kept'],
    ['.', '.', 'lone dot kept'],
    ['-50', '-50', 'minus sign is preserved so submit can reject it'],
    ['1e3', '1e3', 'exponent kept so the money parser can reject it'],
    ['0x10', '0x10', 'hex kept so the money parser can reject it'],
    ['  1 000,25 ', '1000,25', 'spaces stripped'],
  ];

  for (const [input, expected, note] of cases) {
    it(`"${input}" -> "${expected}" (${note})`, () => {
      expect(sanitizeAmountInput(input)).toBe(expected);
    });
  }

  it('is idempotent on already-normalized values', () => {
    const once = sanitizeAmountInput('1.234,56');
    expect(sanitizeAmountInput(once)).toBe(once);
  });

  it('keeps calculator 10−60 as -50 so submit shows a validation error', () => {
    const applied = sanitizeAmountInput(formatAmountForInput(10 - 60));
    expect(applied).toBe('-50');
    expect(moneyAmountFromToken(applied)).toBe(-50);
    expect(moneyAmountFromToken(applied)).not.toBe(50);
  });
});
