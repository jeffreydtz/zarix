import { describe, expect, it } from 'vitest';
import {
  extractJsonNumberToken,
  formatCents,
  hasAtMostTwoMoneyDecimals,
  integerCentsFromToken,
  moneyAmountFromToken,
} from '@/lib/money-amount';

describe('integer cents money check (no float*100)', () => {
  it('accepts large ARS amounts with two cents digits from the raw token', () => {
    expect(integerCentsFromToken('1048576.37')).toBe(BigInt(104857637));
    expect(integerCentsFromToken('1234567.89')).toBe(BigInt(123456789));
    expect(integerCentsFromToken('10000000.37')).toBe(BigInt(1000000037));
    expect(formatCents(integerCentsFromToken('1048576.37')!)).toBe('1048576.37');
    expect(moneyAmountFromToken('1048576.37')).toBe(1048576.37);
  });

  it('rejects more than two fractional digits and never rounds them', () => {
    expect(integerCentsFromToken('40.129')).toBeNull();
    expect(integerCentsFromToken('1.005')).toBeNull();
    expect(integerCentsFromToken('40.1290')).toBeNull();
    expect(moneyAmountFromToken('40.129')).toBeNull();
    expect(hasAtMostTwoMoneyDecimals('40.129')).toBe(false);
    expect(hasAtMostTwoMoneyDecimals('1.005')).toBe(false);
  });

  it('keeps one or two written cents and whole amounts', () => {
    expect(integerCentsFromToken('40.12')).toBe(BigInt(4012));
    expect(integerCentsFromToken('40.1')).toBe(BigInt(4010));
    expect(integerCentsFromToken('40')).toBe(BigInt(4000));
    expect(integerCentsFromToken('1.00')).toBe(BigInt(100));
  });

  it('reads the amount token from the raw JSON body, not from JSON.parse', () => {
    expect(extractJsonNumberToken('{"amount":40.129,"currency":"ARS"}')).toBe('40.129');
    expect(extractJsonNumberToken('{"importe": 1048576.37}')).toBe('1048576.37');
    expect(extractJsonNumberToken('{"amount":"1.005"}')).toBe('1.005');
    expect(integerCentsFromToken(extractJsonNumberToken('{"amount":40.129}')!)).toBeNull();
    expect(integerCentsFromToken(extractJsonNumberToken('{"amount":1234567.89}')!)).toBe(BigInt(123456789));
  });
});
