import { describe, expect, it } from 'vitest';
import {
  extractJsonNumberToken,
  extractTopLevelJsonAmount,
  formatCents,
  hasAtMostTwoMoneyDecimals,
  integerCentsFromToken,
  moneyAmountFromToken,
  rawJsonHasInvalidMoney,
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

  it('rejects exponent notation instead of parking the mantissa as 1.00', () => {
    expect(extractJsonNumberToken('{"amount":1e2}')).toBe('1e2');
    expect(extractJsonNumberToken('{"amount":1E2}')).toBe('1E2');
    expect(extractJsonNumberToken('{"amount":1.0e2}')).toBe('1.0e2');
    expect(extractJsonNumberToken('{"amount":1e-2}')).toBe('1e-2');
    expect(extractJsonNumberToken('{"amount":"1e2"}')).toBe('1e2');
    expect(integerCentsFromToken('1e2')).toBeNull();
    expect(integerCentsFromToken('1E2')).toBeNull();
    expect(integerCentsFromToken(extractJsonNumberToken('{"amount":1e2}')!)).toBeNull();
    expect(hasAtMostTwoMoneyDecimals('1e2')).toBe(false);
    expect(hasAtMostTwoMoneyDecimals(1e21)).toBe(false);
    expect(moneyAmountFromToken('1e2')).toBeNull();
    expect(moneyAmountFromToken('1e2')).not.toBe(1);
    expect(JSON.parse('{"amount":1e2}').amount).toBe(100);
    expect(integerCentsFromToken('0x10')).toBeNull();
    expect(integerCentsFromToken('1e3')).toBeNull();
    expect(moneyAmountFromToken('1e-2')).toBeNull();
  });

  it('reads only the top-level amount and ignores nested metadata.amount', () => {
    const nested = '{"metadata":{"amount":2},"amount":1000}';
    expect(extractTopLevelJsonAmount(nested)).toEqual({ token: '1000', duplicate: false });
    expect(extractJsonNumberToken(nested)).toBe('1000');
    expect(extractJsonNumberToken(nested)).not.toBe('2');
    expect(rawJsonHasInvalidMoney(nested)).toBe(false);
  });

  it('treats duplicate top-level amount keys as ambiguous', () => {
    const dup = '{"amount":1,"amount":2}';
    expect(extractTopLevelJsonAmount(dup).duplicate).toBe(true);
    expect(integerCentsFromToken(extractJsonNumberToken(dup)!)).toBeNull();
    expect(rawJsonHasInvalidMoney(dup)).toBe(true);
  });

  it('rejects exponent and hex money tokens on REST/MCP-shaped JSON', () => {
    expect(rawJsonHasInvalidMoney('{"amount":1e3}')).toBe(true);
    expect(rawJsonHasInvalidMoney('{"amount":1e-2}')).toBe(true);
    expect(rawJsonHasInvalidMoney('{"amount":"0x10"}')).toBe(true);
    expect(
      rawJsonHasInvalidMoney(
        '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"create_transaction","arguments":{"amount":1e3}}}'
      )
    ).toBe(true);
    expect(rawJsonHasInvalidMoney('{"amount":1000}')).toBe(false);
  });
});
