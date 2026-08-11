import { describe, it, expect } from 'vitest';
import { formatAmountForInput } from '@/lib/evaluate-simple-amount-expression';

describe('formatAmountForInput', () => {
  // Table-driven: [input, expected]. Expected values derived from running the code.
  const cases: Array<[number, string]> = [
    [1234.56, '1234.56'],
    [1234.5, '1234.5'],
    [1000, '1000'],
    [1000.0, '1000'],
    [0, '0'],
    [-0, '0'],
    [1.1, '1.1'],
    [1.99, '1.99'],
    [0.1, '0.1'],
    [-5.5, '-5.5'],
    [99.9, '99.9'],
    // Rounding to 2 decimals (banker's-agnostic JS Math.round semantics):
    [1.005, '1'], // 1.005*100 === 100.4999... -> rounds down to 100 -> 1
    [2.675, '2.68'],
    [0.005, '0.01'],
    [3.999, '4'], // rounds up to integer
    [0.001, '0'], // rounds to zero
  ];

  for (const [input, expected] of cases) {
    it(`${input} -> "${expected}"`, () => {
      expect(formatAmountForInput(input)).toBe(expected);
    });
  }

  it('returns empty string for non-finite values', () => {
    expect(formatAmountForInput(NaN)).toBe('');
    expect(formatAmountForInput(Infinity)).toBe('');
    expect(formatAmountForInput(-Infinity)).toBe('');
  });

  it('never leaves trailing zeros', () => {
    expect(formatAmountForInput(2.5).endsWith('0')).toBe(false);
    expect(formatAmountForInput(2.5)).toBe('2.5');
  });
});
