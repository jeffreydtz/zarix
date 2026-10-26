import { describe, expect, it } from 'vitest';
import {
  isWalletTimestampFresh,
  parseAmountFromText,
  parseWalletPayload,
  parseWalletText,
  parseWalletTimestamp,
} from '@/lib/integrations/wallet-parse';
import r16MontoRegresion from './fixtures/wallet-r16-monto-regresion.json';
import r17MarkerRegresion from './fixtures/wallet-r17-marker-regresion.json';

const CASES: Array<{ input: string; amount: number | null; ambiguous?: boolean; direction?: 'expense' | 'income' }> = [
  { input: '$ 12.500', amount: 12500, ambiguous: true },
  { input: '$12.500', amount: 12500, ambiguous: true },
  { input: 'ARS 1.250', amount: 1250, ambiguous: true },
  { input: '$1,234.56', amount: 1234.56, ambiguous: true },
  { input: 'US$ 1,234.56', amount: 1234.56, ambiguous: true },
  { input: 'Compra de $1.250,50 en Ejemplo Café', amount: 1250.5, ambiguous: true },
  { input: '-$1.234,56', amount: 1234.56, direction: 'income', ambiguous: true },
  { input: 'Devolución $1.250,00', amount: null, ambiguous: true },
  { input: 'tarjeta terminada en 4321 por $ 5.000,00 en COTO', amount: 5000, ambiguous: true },
  { input: 'Visa terminada en 1111 $ 12.500', amount: 12500, ambiguous: true },
  { input: 'USD 10.50', amount: 10.5, ambiguous: true },
  { input: '1.250.000', amount: null, ambiguous: true },
  { input: '12,50', amount: null, ambiguous: true },
  { input: '12.50', amount: null, ambiguous: true },
  { input: 'ARS 99', amount: 99, ambiguous: true },
  { input: 'reintegro ARS 800', amount: null, ambiguous: true },
  { input: 'sin monto', amount: null },
  { input: '1.250', amount: null, ambiguous: true },
  { input: 'EUR 1.234,56', amount: 1234.56, ambiguous: true },
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
    const parsed = parseWalletText('Pagaste con Visa terminada en 1234 por $ 5.000,00 en COTO S.A.');
    expect(parsed.amount).toBe(5000);
    expect(parsed.amountAmbiguous).toBe(false);
  });

  it('parks JSON amount when rawText claims a non-default currency and JSON omits currency', () => {
    const parsed = parseWalletPayload({
      json: { amount: 1250, merchant: 'Ejemplo Café', rawText: 'USD 1250 Ejemplo' },
    });
    expect(parsed.amount).toBe(1250);
    expect(parsed.amountAmbiguous).toBe(true);
    expect(parsed.currency).toBe('USD');
    expect(parsed.currency).not.toBe('ARS');
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
    const parsed = parseAmountFromText('Pagaste con tarjeta de crédito $5.000 COTO');
    expect(parsed.direction).toBe('expense');
    expect(parsed.amount).toBe(5000);
    expect(parsed.ambiguous).toBe(false);
    const long = parseWalletText('Pagaste con tarjeta de crédito por $5.000,00 en COTO');
    expect(long.direction).toBe('expense');
    expect(long.amount).toBe(5000);
    expect(long.amountAmbiguous).toBe(false);
  });

  it('parks refund wording instead of auto-picking an income amount', () => {
    const parsed = parseAmountFromText('crédito $1.000 devolución');
    expect(parsed.ambiguous).toBe(true);
    const ascii = parseAmountFromText('-$ 500');
    expect(ascii.amount).toBe(500);
    expect(ascii.direction).toBe('income');
    expect(ascii.ambiguous).toBe(true);
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
    expect(zero.amount).toBeNull();
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
    expect(parseAmountFromText('Compra 25/10 12:30 en COTO').amount).toBeNull();
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
      { input: 'Importe: 1.500,00', amount: null, ambiguous: true },
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
      { input: '$ 1.500 cuota 1/3', amount: null, ambiguous: true },
      { input: '$ 1.500/mes', amount: null, ambiguous: true },
      { input: '$ 1.500 / 3 cuotas', amount: null, ambiguous: true },
      { input: '1/2', amount: null },
      { input: '$ 1/2', amount: null },
      { input: 'Monto: $ 1.500 en COTO. Saldo disponible $ 20.000', amount: null, ambiguous: true },
      { input: 'Tarjeta Visa 1234. Monto: $ 1.500', amount: 1500 },
      { input: 'Compra $ 0,99.', amount: 0.99 },
      { input: 'Compra $ 12,50.', amount: 12.5 },
      { input: 'Compra USD 12,50.', amount: 12.5, currency: 'USD' },
      { input: 'Compra US$ 12.50,', amount: 12.5, currency: 'USD' },
      { input: 'Compra $1250,50. en COTO', amount: 1250.5 },
    ];
    const allowlisted =
      /pag[aá]ste|compr[aá]ste|transferiste|abonaste|consumiste|compra\s+aprobada|compra\s+realizada|pago\s+realizado|pago\s+aprobado/i;
    for (const { input, amount, ambiguous, currency, direction } of round11) {
      const parsed = parseAmountFromText(input);
      expect(parsed.amount, input).toBe(amount);
      if (amount != null) {
        expect(parsed.ambiguous, input).toBe(ambiguous ?? !allowlisted.test(input));
      }
      if (ambiguous != null) expect(parsed.ambiguous, input).toBe(ambiguous);
      if (direction) expect(parsed.direction, input).toBe(direction);
      if (currency) expect(parseWalletText(input).currency, input).toBe(currency);
    }
    expect(parseAmountFromText('Monto: $ 1.500 en COTO. Saldo disponible $ 20.000').amount).toBeNull();
    expect(parseAmountFromText('Monto: $ 1.500 en COTO. Saldo disponible $ 20.000').amount).not.toBe(1500);
    expect(parseAmountFromText('Monto: $ 1.500 en COTO. Saldo disponible $ 20.000').amount).not.toBe(20000);
    expect(parseAmountFromText('Tarjeta Visa 1234. Monto: $ 1.500').amount).not.toBe(1234);
    expect(parseAmountFromText('Compra $ 0,99.').amount).not.toBe(99);
    expect(parseAmountFromText('Compra $ 12,50.').amount).not.toBe(1250);
    expect(parseAmountFromText('Compra $1250,50. en COTO').amount).not.toBe(125050);

    const kaelAr: Array<{
      input: string;
      amount: number | null;
      currency?: string;
      direction?: 'expense' | 'income';
      ambiguous?: boolean;
    }> = [
      { input: '$ 12.345.678,90', amount: 12345678.9 },
      { input: '$12.345.678,90', amount: 12345678.9 },
      { input: '1.250,50 ARS', amount: null, ambiguous: true },
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
      const withPhrase = allowlisted.test(input) ? input : `Pagaste ${input}`;
      const exact = parseAmountFromText(withPhrase);
      expect(parsed.amount, input).toBe(amount);
      if (amount != null) expect(parsed.direction, input).toBe(direction ?? 'expense');
      if (direction === 'income' || amount == null) {
        expect(parsed.ambiguous, input).toBe(true);
      } else {
        expect(parsed.ambiguous, input).toBe(ambiguous ?? !allowlisted.test(input));
        expect(exact.amount, withPhrase).toBe(amount);
        expect(exact.ambiguous, withPhrase).toBe(false);
      }
      if (currency && amount != null) expect(parseWalletText(withPhrase).currency, input).toBe(currency);
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

  it('parks round-12 Highs, glued clocks/dates, and prod-preexisting misreads', () => {
    const round12AltoPark = [
      'Saldo a favor $ 200 aplicado. Compra $ 1.500. Restan $ 1.300',
      'Mercado Pago: Pagaste con saldo $ 1.500 en COTO. Gracias por tu compra. Cashback $ 150',
      'Ualá: Pagaste con saldo $ 1.500 en COTO. Consultá todos los detalles en la aplicación. Comisión $ 50',
      'Naranja X: Pagaste con saldo $ 1.500 en COTO. Gracias por elegir nuestra cuenta. Cargo $ 20',
      'Brubank: Pagaste con saldo $ 1.500 en COTO. Tu comprobante ya está disponible. Propina $ 100',
      'Carga de saldo SUBE $ 2.000. La operación se completó correctamente desde tu cuenta. Cargo $ 20',
      'Disponible: $ 20.000. Compra $ 1.500 en COTO. Comprobante emitido. Cargo $ 20',
      'Compra ARS 1500 en COTO. Saldo USD 200',
      'Compra $ 12:30 en COTO',
      'Compra $ 12:30:45 en COTO',
      'Compra $ 2026/10/25 en COTO',
    ];
    const forbiddenAlto = [1300, 150, 50, 20, 100, 200, 1500, 2000, 20000, 12, 2026];
    for (const input of round12AltoPark) {
      const parsed = parseAmountFromText(input);
      expect(parsed.amount, input).toBeNull();
      expect(parsed.ambiguous, input).toBe(true);
      for (const n of forbiddenAlto) expect(parsed.amount, input).not.toBe(n);
    }
    expect(parseWalletText('Compra ARS 1500 en COTO. Saldo USD 200').currency).not.toBe('USD');

    const singleSaldo = parseAmountFromText('Pagaste con saldo $ 1.500 en COTO');
    expect(singleSaldo.amount).toBe(1500);
    expect(singleSaldo.ambiguous).toBe(false);

    expect(parseAmountFromText('$12:30').amount).toBeNull();
    expect(parseAmountFromText('$ 12:30').amount).toBeNull();
    expect(parseAmountFromText('$12:30').amount).not.toBe(12);
    expect(parseAmountFromText('$ 12:30').amount).not.toBe(12);

    const preexistingInvalid = [
      'Compra 25-10-2026 en COTO',
      'Compra 2026-10-25 en COTO',
      'Ticket 00123 COTO',
      'Compra 14 hs en COTO',
      'Compra 10% de descuento en COTO',
      '3 cuotas de $ 500',
      'Compra 3x $500 en COTO',
      'Compra $ −50 en COTO',
      'Compra $ –50 en COTO',
      '$ 1.500 , 50',
      '$ 1.500, 50',
      '$ 1.500 ,50',
      'Compra USD 10 ($ 10) en COTO',
      'Compra $ 10 (USD 10) en COTO',
      'Operación 00123456 en COTO',
      '12 cuotas sin interés de $ 1.000',
    ];
    const forbiddenPre = [25, 10, 2026, 123, 14, 500, 50, 1500, 1000, 123456];
    for (const input of preexistingInvalid) {
      const parsed = parseAmountFromText(input);
      expect(parsed.amount, input).toBeNull();
      expect(parsed.ambiguous, input).toBe(true);
      for (const n of forbiddenPre) expect(parsed.amount, input).not.toBe(n);
    }
    for (const input of [
      'Compra rechazada $ 1.500 en COTO',
      'Compra denegada $ 1.500 en COTO',
      'Pago fallido $ 1.500 en COTO',
      'Anulación de compra $ 1.500 en COTO',
    ]) {
      const parsed = parseAmountFromText(input);
      expect(parsed.ambiguous, input).toBe(true);
    }

    expect(parseAmountFromText('$ 1.50').amount).toBeNull();
    expect(parseAmountFromText('$ 1.50').amount).not.toBe(1.5);
    expect(parseAmountFromText('$ 1.50').amount).not.toBe(150);
    expect(parseAmountFromText('$ 5,').amount).toBe(5);
    expect(parseAmountFromText('$ 5.').amount).toBe(5);
  });

  it('parks round-13 refund, reference-suffix, hygiene, and non-purchase contexts', () => {
    const suggestPark = [
      'Refund $ 50 de Amazon',
      'Reversa de compra $ 1.500',
      'Contracargo $ 1.500',
      'Crédito en tu cuenta $ 1.500',
      'Reverso $ 1.500',
      'Ticket 1234 ARS 1.500',
      'Referencia 1234 USD 50',
      'Operación 456 ARS 1.500,50',
      'Referencia: 321 USD 12.50',
      'Factura 1234 EUR 50',
      'Ticket 1234 U$S 10',
      'Ticket 1234 ARS: 1.500',
      'Saldo disponible $ 1.500',
      'Tu límite es $ 1.500',
      'Available balance $ 1.500',
      'Recibiste $ 1.500 de Juan',
      'Te transfirieron $ 1.500',
      'Cobraste $ 1.500',
      'Compra $ 1500 dólares',
    ];
    for (const input of suggestPark) {
      const parsed = parseAmountFromText(input);
      expect(parsed.ambiguous, input).toBe(true);
      expect(parsed.amount, input).not.toBe(1234);
      expect(parsed.amount, input).not.toBe(456);
      expect(parsed.amount, input).not.toBe(321);
    }
    expect(parseAmountFromText('Ticket 1234 ARS 1.500').amount).toBe(1500);
    expect(parseWalletText('Referencia 1234 USD 50').currency).toBe('USD');
    expect(parseWalletText('Factura 1234 EUR 50').currency).toBe('EUR');

    const nullPark = [
      '$ 1.250 50',
      '$1.250¹50',
      'Compra $ 1\u200b.500',
      `${'x'.repeat(4001)} Compra $ 1.500`,
      'Compra －$ 1.500',
      'Compra $ 1,5 mil',
      'Compra $ 1M',
      'Comprobante https://coto.example/$123',
      'Email $123@example.test',
      'Código AB-$123',
    ];
    for (const input of nullPark) {
      const parsed = parseAmountFromText(input);
      expect(parsed.amount, input).toBeNull();
      expect(parsed.ambiguous, input).toBe(true);
      expect(parsed.amount, input).not.toBe(1);
      expect(parsed.amount, input).not.toBe(123);
      expect(parsed.amount, input).not.toBe(1250);
    }

    expect(parseAmountFromText('Compra USD $10').amount).toBe(10);
    expect(parseAmountFromText('Compra USD $10').ambiguous).toBe(true);
    expect(parseWalletText('Abonaste USD $10').currency).toBe('USD');
    expect(parseWalletText('Abonaste EUR $10').currency).toBe('EUR');
    expect(parseWalletText('Abonaste USD\u00a0$10').currency).toBe('USD');
    expect(parseWalletText('Abonaste USD\n$10').currency).toBe('USD');
    expect(parseWalletText('Pagaste $ 10 US$ en COTO').currency).toBe('USD');
    expect(parseAmountFromText('Abonaste USD $10').ambiguous).toBe(false);
    expect(parseAmountFromText('Compra aprobada US$ 12.50').amount).toBe(12.5);
    expect(parseAmountFromText('Compra aprobada US$ 12.50').ambiguous).toBe(false);
    expect(parseAmountFromText('desde $ 1.500').ambiguous).toBe(true);
    expect(parseAmountFromText('Compra $ 1.500 + IVA').ambiguous).toBe(true);
    expect(parseAmountFromText('Compra $ 1.500 c/u').ambiguous).toBe(true);
    expect(parseAmountFromText('Preautorización $ 1.500').ambiguous).toBe(true);
    expect(parseAmountFromText('Intento de compra $ 1.500').ambiguous).toBe(true);
    expect(parseAmountFromText('Compra no aprobada $ 1.500').ambiguous).toBe(true);
  });

  it('keeps the 30-format table exact cents on Compra / en COTO / trailing-dot variants', () => {
    const nbsp1250 = `$ 1\u00a0250`;
    const nbspCents = `$\u00a01.250,50`;
    const tokens: Array<{ token: string; amount: number; currency?: string }> = [
      { token: '$ 1.250,50', amount: 1250.5 },
      { token: '$1250', amount: 1250 },
      { token: '$ 1.250', amount: 1250 },
      { token: 'USD 12,50', amount: 12.5, currency: 'USD' },
      { token: 'US$ 12.50', amount: 12.5, currency: 'USD' },
      { token: 'ARS 1.234,5', amount: 1234.5 },
      { token: '$ 0,99', amount: 0.99 },
      { token: '$ 1.000.000', amount: 1_000_000 },
      { token: nbsp1250, amount: 1250 },
      { token: nbspCents, amount: 1250.5 },
    ];
    expect(tokens).toHaveLength(10);
    for (const { token, amount, currency } of tokens) {
      for (const input of [`Pagaste ${token}`, `Pagaste ${token} en COTO`, `Pagaste ${token}.`]) {
        const parsed = parseAmountFromText(input);
        expect(parsed.amount, input).toBe(amount);
        expect(parsed.ambiguous, input).toBe(false);
        if (currency) expect(parseWalletText(input).currency, input).toBe(currency);
      }
    }
  });

  it('parks round-14 signed markers, soft hyphen, and completed-template misses', () => {
    for (const input of [
      'Compra referencia 1234 USD -50',
      'Compra referencia 1234 USD +50',
      'Compra referencia 1234 USD (50)',
      'Compra referencia 1234 USD::50',
      'Compra referencia 1234 USD/50',
      'Compra referencia 1234 ARS -1.500',
      'Compra en terminal 1234 ARS -1.500',
      'Compra referencia 1234 U$D -50',
      'Compra referencia 1234 AR$ -50',
      'Pagaste $ 1\u00AD.500',
      'Importe reintegrado $ 800',
      'Total a pagar $ 5.000',
      'Monto mínimo $ 5.000',
      'Pago mínimo $ 5.000',
      'Pago no aprobado $ 800',
      'Compra en https://x.com $ 500',
    ]) {
      const parsed = parseAmountFromText(input);
      expect(parsed.ambiguous, input).toBe(true);
      expect(parsed.amount, input).not.toBe(1234);
    }
    expect(parseAmountFromText('Compra referencia 1234 USD -50').amount).toBeNull();
    const long = parseWalletPayload({
      json: {
        amount: 1500,
        rawText: `Refund $ 1.500\n${'x'.repeat(4050)}\nComercio: COTO\ncon tarjeta Visa`,
      },
    });
    expect(long.amountAmbiguous).toBe(true);
    expect(long.merchant).toBeNull();
    const positives = [
      { input: 'Pagaste $ 3.500', amount: 3500 },
      { input: 'Compraste en COTO por $ 1.250,50', amount: 1250.5 },
      { input: 'Pagaste con Visa terminada en 1234 por $ 5.000,00 en COTO S.A.', amount: 5000 },
      { input: 'Transferiste $ 8.000', amount: 8000 },
      { input: 'Pagaste con saldo $ 1.500 en COTO', amount: 1500 },
      { input: 'Compra aprobada US$ 12.50', amount: 12.5 },
      { input: 'Abonaste USD 10', amount: 10 },
      { input: '25/10 12:30 Pagaste $ 1.250,50', amount: 1250.5 },
    ];
    for (const { input, amount } of positives) {
      const parsed = parseAmountFromText(input);
      expect(parsed.amount, input).toBe(amount);
      expect(parsed.ambiguous, input).toBe(false);
      expect(parsed.amount, input).not.toBe(1234);
    }
  });

  it('reconciles JSON vs rawText cents, currency and sign including suffix markers', () => {
    const park = [
      { amount: 15, rawText: 'Pagaste 15 USD' },
      { amount: 15, rawText: 'Pagaste 15 US$' },
      { monto: 1500, rawText: 'Pagaste -$ 1.500' },
      { monto: 1500, rawText: 'Pagaste $ 0' },
      { monto: 1500, rawText: 'Pagaste $ 15.000' },
      { amount: 1500, currency: 'ARS', rawText: 'Pagaste $ 15.000' },
      { amount: 1500, currency: 'ARS', rawText: 'Pagaste USD 1.500' },
      { amount: 1500, rawText: 'Pagaste USD 15' },
      { amount: 800, rawText: 'Pagaste $ 900' },
      { importe: 1500, rawText: 'Pagaste $ 15.000' },
      { value: '1500', rawText: 'Pagaste $ 15.000' },
      { monto: '1500', rawText: 'Pagaste $ 15.000' },
    ];
    for (const json of park) {
      const parsed = parseWalletPayload({ json });
      expect(parsed.amountAmbiguous, JSON.stringify(json)).toBe(true);
    }
    const match = parseWalletPayload({
      json: { amount: 1500, currency: 'ARS', rawText: 'Pagaste $ 1.500' },
    });
    expect(match.amount).toBe(1500);
    expect(match.amountAmbiguous).toBe(false);
    expect(match.currency).toBe('ARS');
    expect(match.direction).toBe('expense');
  });

  it('parks JSON amount aliases when rawText has no corroborating marked amount', () => {
    const examples = [
      { monto: 15, rawText: 'Compra 1.500,50 en COTO' },
      { monto: 15, rawText: 'Compra aprobada Importe: 1.500,00' },
      { monto: 1500, rawText: 'Pagaste -1500' },
      { monto: 15, rawText: 'Pagaste -15' },
      { monto: 15, rawText: 'Pagaste 0' },
    ];
    for (const json of examples) {
      const parsed = parseWalletPayload({ json });
      expect(parsed.amountAmbiguous, JSON.stringify(json)).toBe(true);
    }
    for (const alias of ['amount', 'importe', 'value', 'monto'] as const) {
      for (const raw of [15, '15'] as const) {
        const parsed = parseWalletPayload({
          json: { [alias]: raw, rawText: 'Compra 1.500,50 en COTO' },
        });
        expect(parsed.amountAmbiguous, `${alias}=${raw}`).toBe(true);
      }
    }
    const structured = parseWalletPayload({
      json: { monto: 1500, currency: 'ARS', merchant: 'COTO' },
    });
    expect(structured.amount).toBe(1500);
    expect(structured.amountAmbiguous).toBe(true);
  });

  it('parks the r16 monto regression corpus (213 payloads) instead of trusting JSON', () => {
    expect(r16MontoRegresion).toHaveLength(213);
    for (const { id, json } of r16MontoRegresion) {
      const parsed = parseWalletPayload({ json: json as Record<string, unknown> });
      expect(parsed.amountAmbiguous, id).toBe(true);
    }
  });

  it('parks AR$/U$D auto-confirm markers and monto-only JSON while still parsing the pending amount', () => {
    const arPrefix = parseAmountFromText('Pagaste AR$ 1.500');
    expect(arPrefix.amount).toBe(1500);
    expect(arPrefix.currency).toBe('ARS');
    expect(arPrefix.ambiguous).toBe(true);

    const usdHead = parseAmountFromText('Pagaste U$D15');
    expect(usdHead.amount).toBe(15);
    expect(usdHead.currency).toBe('USD');
    expect(usdHead.ambiguous).toBe(true);

    const uss = parseAmountFromText('Pagaste U$S 15');
    expect(uss.amount).toBe(15);
    expect(uss.currency).toBe('USD');
    expect(uss.ambiguous).toBe(false);

    const dollar = parseWalletPayload({
      json: { amount: 1500, currency: 'ARS', rawText: 'Pagaste $ 1.500' },
    });
    expect(dollar.amount).toBe(1500);
    expect(dollar.amountAmbiguous).toBe(false);

    const montoEvenWithDollar = parseWalletPayload({
      json: { monto: 1500, currency: 'ARS', rawText: 'Pagaste $ 1.500' },
    });
    expect(montoEvenWithDollar.amount).toBe(1500);
    expect(montoEvenWithDollar.amountAmbiguous).toBe(true);

    const examples = [
      { monto: 1500, rawText: 'Pagaste 15000 en COTO, incluye envío de AR$ 1.500' },
      { monto: 1500, rawText: 'Jamás pagaste AR$ 1.500' },
      { monto: 1500, rawText: 'Pagaste la tercera parte de 1500 ARS' },
    ];
    for (const json of examples) {
      const parsed = parseWalletPayload({ json });
      expect(parsed.amountAmbiguous, JSON.stringify(json)).toBe(true);
    }
    for (const input of [
      'Jamás pagaste AR$ 1.500',
      'Pagaste U$D15 y total 1500',
      'Pagaste AR$ 1.500',
      'Pagaste U$D15',
    ]) {
      expect(parseAmountFromText(input).ambiguous, input).toBe(true);
      expect(parseWalletText(input).amountAmbiguous, input).toBe(true);
    }
  });

  it('parks the r17 AR$/U$D/monto regression corpus (160 payloads)', () => {
    expect(r17MarkerRegresion).toHaveLength(160);
    for (const { id, json } of r17MarkerRegresion) {
      const parsed = parseWalletPayload({ json: json as Record<string, unknown> });
      expect(parsed.amountAmbiguous, id).toBe(true);
    }
  });

  it('keeps r16+r17 auto-confirm a subset of live-main writes (0 HEAD-only autos)', () => {
    const verifiedCorrections: Array<{
      json: Record<string, unknown>;
      amount: number;
      currency: string;
      direction: 'expense' | 'income';
    }> = [];
    const wouldAuto = (parsed: ReturnType<typeof parseWalletPayload>) =>
      !parsed.amountAmbiguous &&
      parsed.amount != null &&
      parsed.direction === 'expense' &&
      !parsed.currencyUnsupported;

    const tally = (rows: Array<{ id: string; json: Record<string, unknown> }>) => {
      let park = 0;
      let auto = 0;
      let verified = 0;
      const violations: string[] = [];
      for (const { id, json } of rows) {
        const parsed = parseWalletPayload({ json });
        if (!wouldAuto(parsed)) {
          park += 1;
          continue;
        }
        auto += 1;
        const listed = verifiedCorrections.find(
          (row) =>
            JSON.stringify(row.json) === JSON.stringify(json) &&
            row.amount === parsed.amount &&
            row.currency === parsed.currency &&
            row.direction === parsed.direction
        );
        if (listed) verified += 1;
        else violations.push(id);
      }
      return { park, auto, verified, violations };
    };

    const r16 = tally(r16MontoRegresion as Array<{ id: string; json: Record<string, unknown> }>);
    const r17 = tally(r17MarkerRegresion as Array<{ id: string; json: Record<string, unknown> }>);
    expect({
      r16Park: r16.park,
      r16Auto: r16.auto,
      r16Verified: r16.verified,
      r16Violations: r16.violations.length,
      r17Park: r17.park,
      r17Auto: r17.auto,
      r17Verified: r17.verified,
      r17Violations: r17.violations.length,
    }).toEqual({
      r16Park: 213,
      r16Auto: 0,
      r16Verified: 0,
      r16Violations: 0,
      r17Park: 160,
      r17Auto: 0,
      r17Verified: 0,
      r17Violations: 0,
    });
  });

  it('parks r15 deny roots, URLs, quotes, unicode splitters, accounting and national currencies', () => {
    const park = [
      'Recordatorio: Pagaste $ 1.500',
      'Recordá Pagaste $ 1.500',
      'Resumen: Pagaste $ 1.500',
      'Aviso: Pagaste $ 1.500',
      'Pagaste $ 1.500 https://banco.test/refund',
      'Pagaste $ 1.500 user@banco.test',
      'Nunca pagaste $ 1.500',
      'no, pagaste $ 1.500',
      '¿Pagaste $ 1.500?',
      'Pagaste $ 1.500?',
      '“Pagaste $ 1.500”',
      '"Pagaste $ 1.500"',
      '«Pagaste $ 1.500»',
      "Pagaste '$ 1.500'",
      'Pagaste la mitad de $ 3.000',
      'Pagaste en COTO, Juan te debe $ 1.500',
      'Pagaste $ 1\u034F.500',
      'Pagaste $ 1\u0085.500',
      'Pagaste $ 1\u2028.500',
      'Pagaste $ 1\u2029.500',
      'Pagaste $1500-',
      'Pagaste ($1500)',
      'Pagaste $1500CR',
      'Pagaste $ 1.500 CR',
      'Pagaste USD 10 dólares canadienses',
      'Pagaste $ 1.500 pesos mexicanos',
      'Pagaste $ 1.500 pesos chilenos',
      'Pagaste $ 1.500 pesos uruguayos',
      'Pagaste USD 10 dólares australianos',
      'Pago de interés $ 1.500',
    ];
    for (const input of park) {
      const parsed = parseAmountFromText(input);
      expect(parsed.ambiguous, input).toBe(true);
      const payload = parseWalletPayload({
        json: { amount: 1500, currency: 'ARS', merchant: 'COTO', rawText: input },
      });
      expect(payload.amountAmbiguous, input).toBe(true);
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
