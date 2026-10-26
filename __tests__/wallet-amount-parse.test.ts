import { describe, expect, it } from 'vitest';
import {
  isWalletTimestampFresh,
  parseAmountFromText,
  parseWalletPayload,
  parseWalletText,
  parseWalletTimestamp,
} from '@/lib/integrations/wallet-parse';

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

  it('parses structured amount "1250" as 1250 without the card last-4 heuristic', () => {
    const asString = parseWalletPayload({
      json: { amount: '1250', currency: 'ARS', merchant: 'Ejemplo Café' },
    });
    const asNumber = parseWalletPayload({
      json: { amount: 1250, currency: 'ARS', merchant: 'Ejemplo Café' },
    });
    expect(asString.amount).toBe(1250);
    expect(asString.amountAmbiguous).toBe(false);
    expect(asNumber.amount).toBe(1250);
    expect(asString.amount).toBe(asNumber.amount);
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

  it('keeps a date-only YYYY-MM-DD as a Cordoba civil date, not midnight UTC', () => {
    const civil = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Argentina/Cordoba',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
    const parsed = parseWalletPayload({
      json: { amount: 18, currency: 'ARS', merchant: 'Café', date: civil },
    });
    expect(parsed.occurredAt).toBe(civil);
    expect(parsed.occurredAt).not.toBe(new Date(`${civil}T00:00:00.000Z`).toISOString());
  });

  it('rejects GBP (and £) in free text so it cannot auto-confirm as ARS', () => {
    const text = parseWalletText('Compra GBP 100 en COTO con tarjeta Visa');
    expect(text.currencyUnsupported).toBe(true);
    expect(text.currency).toBe('GBP');
    expect(text.amountAmbiguous).toBe(true);
    const payload = parseWalletPayload({ text: 'Compra GBP 100 en COTO con tarjeta Visa' });
    expect(payload.currencyUnsupported).toBe(true);
    expect(payload.currency).not.toBe('ARS');
    const sterling = parseWalletText('Compra £50 en Shop');
    expect(sterling.currencyUnsupported).toBe(true);
    expect(sterling.currency).toBe('GBP');
  });

  it('does not round JSON amounts with more than two decimals', () => {
    const raw = '{"amount":40.129,"currency":"ARS","merchant":"Café"}';
    const excess = parseWalletPayload({
      json: JSON.parse(raw) as Record<string, unknown>,
      rawJson: raw,
    });
    expect(excess.amount).toBeNull();
    expect(excess.amountAmbiguous).toBe(true);
    expect(excess.amount).not.toBe(40.13);
    const millRaw = '{"amount":1.005,"currency":"ARS","merchant":"Café"}';
    const mill = parseWalletPayload({
      json: JSON.parse(millRaw) as Record<string, unknown>,
      rawJson: millRaw,
    });
    expect(mill.amount).toBeNull();
    expect(mill.amount).not.toBe(1);
    const asString = parseWalletPayload({
      json: { amount: '40.129', currency: 'ARS', merchant: 'Café' },
      rawJson: '{"amount":"40.129","currency":"ARS","merchant":"Café"}',
    });
    expect(asString.amount).toBeNull();
    expect(asString.amountAmbiguous).toBe(true);
  });

  it('keeps large ARS amounts with cents from the raw JSON token', () => {
    const raw = '{"amount":1048576.37,"currency":"ARS","merchant":"Alquiler"}';
    const parsed = parseWalletPayload({
      json: JSON.parse(raw) as Record<string, unknown>,
      rawJson: raw,
    });
    expect(parsed.amount).toBe(1048576.37);
    expect(parsed.amountAmbiguous).toBe(false);
    const million = parseWalletPayload({
      json: { amount: 1234567.89, currency: 'ARS', merchant: 'Alquiler' },
      rawJson: '{"amount":1234567.89,"currency":"ARS","merchant":"Alquiler"}',
    });
    expect(million.amount).toBe(1234567.89);
  });

  it('invalid JSON amount falls back to text and is ambiguous (no auto-confirm)', () => {
    const foo = parseWalletPayload({
      json: { amount: 'foo', rawText: 'USD 1.234' },
    });
    expect(foo.amountAmbiguous).toBe(true);
    expect(foo.amount).not.toBe(1.23);

    const zero = parseWalletPayload({
      json: { amount: 0, rawText: '1.250' },
    });
    expect(zero.amount).toBe(1250);
    expect(zero.amountAmbiguous).toBe(true);
  });

  it('parks the full malformed token and ignores dates/times', () => {
    const cases: Array<{ input: string; note: string }> = [
      { input: 'Compra $ .5 en COTO con tarjeta Visa', note: 'leading decimal' },
      { input: 'Compra $ 1_000 en COTO con tarjeta Visa', note: 'underscore' },
      { input: 'Compra $ 1.2.3 en COTO con tarjeta Visa', note: 'extra dots' },
      { input: 'Compra 25/10 12:30 en COTO con tarjeta Visa', note: 'date/time' },
      { input: 'Compra $ 1.250,501 en COTO con tarjeta Visa', note: 'three fractional digits' },
      { input: 'Compra $ 1.250.50 en COTO con tarjeta Visa', note: 'broken thousands' },
    ];
    for (const { input } of cases) {
      const parsed = parseAmountFromText(input);
      expect(parsed.amount, input).toBeNull();
      expect(parsed.amount, input).not.toBe(5);
      expect(parsed.amount, input).not.toBe(1);
      expect(parsed.amount, input).not.toBe(1.2);
      expect(parsed.amount, input).not.toBe(25);
      expect(parsed.amount, input).not.toBe(1250.5);
      expect(parsed.amount, input).not.toBe(1250);
    }
    expect(parseAmountFromText('Compra 25/10 12:30 en COTO').ambiguous).toBe(false);
    expect(parseAmountFromText('Compra $ .5 en COTO').ambiguous).toBe(true);
  });

  it('parks exponent and hex text tokens instead of auto-confirming 1 or 16', () => {
    const exponent = parseAmountFromText('Compra $ 1e3 en COTO con tarjeta Visa');
    expect(exponent.amount).toBeNull();
    expect(exponent.amount).not.toBe(1);
    expect(exponent.amount).not.toBe(1000);
    expect(exponent.ambiguous).toBe(true);
    const payload = parseWalletPayload({ text: 'Compra $ 1e3 en COTO' });
    expect(payload.amount).toBeNull();
    expect(payload.amountAmbiguous).toBe(true);
    const hex = parseAmountFromText('Compra $ 0x10 en COTO');
    expect(hex.amount).toBeNull();
    expect(hex.amount).not.toBe(16);
    expect(hex.ambiguous).toBe(true);
  });

  it('parks conflicting JSON amount aliases regardless of casing or value type', () => {
    const montoConflict = '{"amount":2,"monto":1000,"currency":"ARS","merchant":"Café"}';
    const parsedMonto = parseWalletPayload({
      json: JSON.parse(montoConflict) as Record<string, unknown>,
      rawJson: montoConflict,
    });
    expect(parsedMonto.amount).toBeNull();
    expect(parsedMonto.amount).not.toBe(2);
    expect(parsedMonto.amount).not.toBe(1000);
    expect(parsedMonto.amountAmbiguous).toBe(true);
    const dupNull = '{"amount":2,"amount":null,"importe":1000,"currency":"ARS","merchant":"Café"}';
    const parsedDup = parseWalletPayload({
      json: JSON.parse(dupNull) as Record<string, unknown>,
      rawJson: dupNull,
    });
    expect(parsedDup.amount).toBeNull();
    expect(parsedDup.amount).not.toBe(2);
    expect(parsedDup.amount).not.toBe(1000);
    expect(parsedDup.amountAmbiguous).toBe(true);
    const mixed = '{"Amount":2,"importe":1000,"currency":"ARS","merchant":"Café"}';
    const parsedMixed = parseWalletPayload({
      json: JSON.parse(mixed) as Record<string, unknown>,
      rawJson: mixed,
    });
    expect(parsedMixed.amount).toBeNull();
    expect(parsedMixed.amountAmbiguous).toBe(true);
    const upper = '{"AMOUNT":2,"value":1000,"currency":"ARS","merchant":"Café"}';
    const parsedUpper = parseWalletPayload({
      json: JSON.parse(upper) as Record<string, unknown>,
      rawJson: upper,
    });
    expect(parsedUpper.amount).toBeNull();
    expect(parsedUpper.amountAmbiguous).toBe(true);
  });

  it('uses the top-level JSON amount and parks duplicate top-level keys', () => {
    const nestedRaw = '{"metadata":{"amount":2},"amount":1000,"currency":"ARS","merchant":"Café"}';
    const nested = parseWalletPayload({
      json: JSON.parse(nestedRaw) as Record<string, unknown>,
      rawJson: nestedRaw,
    });
    expect(nested.amount).toBe(1000);
    expect(nested.amount).not.toBe(2);
    expect(nested.amountAmbiguous).toBe(false);
    const dupRaw = '{"amount":1,"amount":2,"currency":"ARS","merchant":"Café"}';
    const dup = parseWalletPayload({
      json: JSON.parse(dupRaw) as Record<string, unknown>,
      rawJson: dupRaw,
    });
    expect(dup.amount).toBeNull();
    expect(dup.amountAmbiguous).toBe(true);
    expect(dup.amountDuplicate).toBe(true);
  });

  it('parses round-11 formats, Kael AR formats, and still parks the round-10 set', () => {
    const nbsp1250 = `$ 1\u00a0250`;
    const nbspCents = `$\u00a01.250,50`;
    const round11: Array<{
      input: string;
      amount: number | null;
      ambiguous?: boolean;
      currency?: string;
      direction?: 'expense' | 'income';
    }> = [
      { input: '$ 1.250,50', amount: 1250.5 },
      { input: '$1250', amount: 1250 },
      { input: '$ 1.250', amount: 1250 },
      { input: 'USD 12,50', amount: 12.5, currency: 'USD' },
      { input: 'US$ 12.50', amount: 12.5, currency: 'USD' },
      { input: 'ARS 1.234,5', amount: 1234.5 },
      { input: '$ 0,99', amount: 0.99 },
      { input: '$ 1.000.000', amount: 1_000_000 },
      { input: nbsp1250, amount: 1250 },
      { input: nbspCents, amount: 1250.5 },
      { input: '$ 1.250,50 en COTO', amount: 1250.5 },
      { input: '$1250 en COTO', amount: 1250 },
      { input: '$ 1.500\nen COTO\nVisa Ejemplo', amount: 1500 },
      { input: 'Monto: $ 1.500', amount: 1500 },
      { input: 'Total: ARS 1.234,56', amount: 1234.56 },
      { input: 'Importe: 1.500,00', amount: 1500 },
      { input: 'Monto:$1500', amount: 1500 },
      { input: 'Monto:\n$ 1.500', amount: 1500 },
      { input: 'Monto:\t$ 1.500', amount: 1500 },
      { input: '$ 1.500,00.', amount: 1500 },
      { input: '$1.500,00,', amount: 1500 },
      { input: '$ 1.500.-', amount: 1500 },
      { input: '$ 1.500...', amount: 1500 },
      { input: '$ 1.250,50.', amount: 1250.5 },
      { input: '$ 1.250.', amount: 1250 },
      { input: 'US$ 12.50.', amount: 12.5, currency: 'USD' },
      { input: 'ARS 1.234,5.', amount: 1234.5 },
      { input: '$ 1.000.000.', amount: 1_000_000 },
      { input: '$ 0,99.', amount: 0.99 },
      { input: 'USD 12,50.', amount: 12.5, currency: 'USD' },
      { input: 'US$ 12.50,', amount: 12.5, currency: 'USD' },
      { input: '$1250.', amount: 1250 },
      { input: '$1500,', amount: 1500 },
      { input: '$1500.-', amount: 1500 },
      { input: '$ 1.500 cuota 1/3', amount: 1500 },
      { input: '$ 1.500/mes', amount: 1500 },
      { input: '$ 1.500 / 3 cuotas', amount: 1500 },
      { input: '1/2', amount: null },
      { input: '$ 1/2', amount: null },
      { input: 'Monto: $ 1.500 en COTO. Saldo disponible $ 20.000', amount: 1500 },
      { input: 'Tarjeta Visa 1234. Monto: $ 1.500', amount: 1500 },
      { input: 'Compra $ 0,99.', amount: 0.99 },
      { input: 'Compra $ 12,50.', amount: 12.5 },
      { input: 'Compra USD 12,50.', amount: 12.5, currency: 'USD' },
      { input: 'Compra US$ 12.50,', amount: 12.5, currency: 'USD' },
      { input: 'Compra $1250,50. en COTO', amount: 1250.5 },
    ];
    for (const { input, amount, ambiguous, currency, direction } of round11) {
      const parsed = parseAmountFromText(input);
      expect(parsed.amount, input).toBe(amount);
      if (amount != null) expect(parsed.ambiguous, input).toBe(ambiguous ?? false);
      if (ambiguous != null) expect(parsed.ambiguous, input).toBe(ambiguous);
      if (direction) expect(parsed.direction, input).toBe(direction);
      if (currency) expect(parseWalletText(input).currency, input).toBe(currency);
    }
    expect(parseAmountFromText('Monto: $ 1.500 en COTO. Saldo disponible $ 20.000').amount).not.toBe(20000);
    expect(parseAmountFromText('Tarjeta Visa 1234. Monto: $ 1.500').amount).not.toBe(1234);
    expect(parseAmountFromText('Compra $ 0,99.').amount).not.toBe(99);
    expect(parseAmountFromText('Compra $ 12,50.').amount).not.toBe(1250);
    expect(parseAmountFromText('Compra $1250,50. en COTO').amount).not.toBe(125050);

    const kaelAr: Array<{
      input: string;
      amount: number;
      currency?: string;
      direction?: 'expense' | 'income';
      ambiguous?: boolean;
    }> = [
      { input: '$ 12.345.678,90', amount: 12345678.9 },
      { input: '$12.345.678,90', amount: 12345678.9 },
      { input: '1.250,50 ARS', amount: 1250.5 },
      { input: 'ARS 1.250,50', amount: 1250.5 },
      { input: 'Pagaste $ 3.500', amount: 3500 },
      { input: 'Compra $ 1.250 en COTO', amount: 1250 },
      { input: '25/10 12:30 Pagaste $ 1.250,50', amount: 1250.5 },
      { input: 'US$ 10', amount: 10, currency: 'USD' },
      { input: 'US$ 12.50', amount: 12.5, currency: 'USD' },
      { input: 'USD 12,50', amount: 12.5, currency: 'USD' },
      { input: '-$ 500', amount: 500, direction: 'income' },
      { input: '-$1.234,56', amount: 1234.56, direction: 'income' },
      { input: '$ 0,99', amount: 0.99 },
      { input: '$ 1.000.000', amount: 1_000_000 },
      { input: '$ 1.234,5', amount: 1234.5 },
      { input: '$ 1.500.-', amount: 1500 },
      { input: '$ 12.500', amount: 12500 },
      { input: 'U$S 10', amount: 10, currency: 'USD' },
      { input: '$1.250,00', amount: 1250 },
      { input: 'ARS 99', amount: 99 },
      { input: '$ 1.250,50.', amount: 1250.5 },
      { input: 'Transferiste $ 8.000', amount: 8000 },
      { input: 'Débito automático $ 2.450,30', amount: 2450.3 },
    ];
    expect(kaelAr).toHaveLength(23);
    for (const { input, amount, currency, direction, ambiguous } of kaelAr) {
      const parsed = parseAmountFromText(input);
      expect(parsed.amount, input).toBe(amount);
      expect(parsed.ambiguous, input).toBe(ambiguous ?? false);
      expect(parsed.direction, input).toBe(direction ?? 'expense');
      if (currency) expect(parseWalletText(input).currency, input).toBe(currency);
    }

    const round10Park = [
      'Compra $ .5 en COTO con tarjeta Visa',
      'Compra $ 1_000 en COTO con tarjeta Visa',
      'Compra $ 1.2.3 en COTO con tarjeta Visa',
      'Compra 25/10 12:30 en COTO con tarjeta Visa',
      'Compra $ 1.250,501 en COTO con tarjeta Visa',
      'Compra $ 1.250.50 en COTO con tarjeta Visa',
    ];
    for (const input of round10Park) {
      const parsed = parseAmountFromText(input);
      expect(parsed.amount, input).toBeNull();
      expect(parsed.amount, input).not.toBe(5);
      expect(parsed.amount, input).not.toBe(1);
      expect(parsed.amount, input).not.toBe(1.2);
      expect(parsed.amount, input).not.toBe(25);
      expect(parsed.amount, input).not.toBe(1250.5);
      expect(parsed.amount, input).not.toBe(1250);
    }
  });

  it('parses old timestamps for identity and applies freshness only separately', () => {
    const iso = '2025-09-01T12:00:00.000Z';
    expect(parseWalletTimestamp(iso)).toBe(iso);
    expect(isWalletTimestampFresh(iso, Date.parse('2026-10-24T12:00:00.000Z'))).toBe(false);
    const parsed = parseWalletPayload({
      json: { amount: 18, currency: 'ARS', merchant: 'Café', timestamp: iso },
    });
    expect(parsed.occurredAt).toBe(iso);
  });
});
