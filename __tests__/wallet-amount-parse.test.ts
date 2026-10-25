import { describe, expect, it } from 'vitest';
import { parseAmountFromText, parseWalletPayload, parseWalletText } from '@/lib/integrations/wallet-parse';

const CASES: Array<{ input: string; amount: number | null; ambiguous?: boolean; direction?: 'expense' | 'income' }> = [
  { input: '$ 12.500', amount: 12500 },
  { input: '$12.500', amount: 12500 },
  { input: 'ARS 1.250', amount: 1250 },
  { input: '$1,234.56', amount: 1234.56 },
  { input: 'US$ 1,234.56', amount: 1234.56 },
  { input: 'Compra de $1.250,50 en Ejemplo Café', amount: 1250.5 },
  { input: '-1.234,56', amount: 1234.56, direction: 'income' },
  { input: 'Devolución $1.250,00', amount: 1250, direction: 'income' },
  { input: 'tarjeta terminada en 4321 por $ 5.000,00 en COTO', amount: 5000 },
  { input: 'Visa terminada en 1111 $ 12.500', amount: 12500 },
  { input: 'USD 10.50', amount: 10.5 },
  { input: '1.250.000', amount: 1250000 },
  { input: '12,50', amount: 12.5 },
  { input: '12.50', amount: 12.5 },
  { input: 'ARS 99', amount: 99 },
  { input: 'reintegro ARS 800', amount: 800, direction: 'income' },
  { input: 'sin monto', amount: null },
  { input: '1.250', amount: 1250, ambiguous: true },
  { input: 'EUR 1.234,56', amount: 1234.56 },
  { input: '$ 0', amount: null },
];

describe('wallet amount parser (table)', () => {
  it.each(CASES)('$input', ({ input, amount, ambiguous, direction }) => {
    const parsed = parseAmountFromText(input);
    expect(parsed.amount).toBe(amount);
    if (ambiguous != null) expect(parsed.ambiguous).toBe(ambiguous);
    if (direction) expect(parsed.direction).toBe(direction);
    if (amount === 5000 || amount === 12500) {
      expect(parsed.amount).not.toBe(4321);
      expect(parsed.amount).not.toBe(1111);
    }
  });

  it('does not auto-pick card last-4 when a currency amount exists', () => {
    const parsed = parseWalletText('Compra con tarjeta terminada en 4321 por $ 5.000,00 en COTO');
    expect(parsed.amount).toBe(5000);
    expect(parsed.amountAmbiguous).toBe(false);
  });

  it('JSON numeric amount is not ambiguous; missing currency falls back to text', () => {
    const parsed = parseWalletPayload({
      json: { amount: 1250, merchant: 'Ejemplo Café', rawText: 'USD 1250 Ejemplo' },
    });
    expect(parsed.amount).toBe(1250);
    expect(parsed.amountAmbiguous).toBe(false);
    expect(parsed.currency).toBe('USD');
  });

  it('does not treat tarjeta de crédito as a refund', () => {
    const parsed = parseAmountFromText('Compra con tarjeta de crédito $5.000 COTO');
    expect(parsed.direction).toBe('expense');
    expect(parsed.amount).toBe(5000);
    const long = parseWalletText('Compra con tarjeta de crédito por $5.000,00 en COTO');
    expect(long.direction).toBe('expense');
    expect(long.amount).toBe(5000);
  });

  it('keeps real credit/refund words as income', () => {
    expect(parseAmountFromText('crédito $1.000 devolución').direction).toBe('income');
  });

  it('marks explicit GBP unsupported instead of coercing to ARS', () => {
    const parsed = parseWalletPayload({ json: { amount: 100, currency: 'GBP', merchant: 'Shop' } });
    expect(parsed.currencyUnsupported).toBe(true);
    expect(parsed.currency).toBe('GBP');
    expect(parsed.amount).toBe(100);
    expect(parsed.amountAmbiguous).toBe(true);
  });

  it('invalid JSON amount falls back to text and is ambiguous (no auto-confirm)', () => {
    const foo = parseWalletPayload({
      json: { amount: 'foo', rawText: 'USD 1.234' },
    });
    expect(foo.amount).not.toBeNull();
    expect(foo.amountAmbiguous).toBe(true);

    const zero = parseWalletPayload({
      json: { amount: 0, rawText: '1.250' },
    });
    expect(zero.amount).toBe(1250);
    expect(zero.amountAmbiguous).toBe(true);
  });
});
