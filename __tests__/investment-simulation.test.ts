import { describe, expect, it } from 'vitest';
import { simulateInvestment } from '@/lib/investment-simulation';

const reference = Object.freeze({ quantity: 6, price: 110, type: 'stock_us' as const, currency: 'USD' });

describe('CU004 A04 simulation contract', () => {
  it('CP4-08 compares 660 USD with a hypothetical 726 USD without changing the reference', () => {
    const result = simulateInvestment(reference, 10);
    expect(result.currentValue).toBe(660);
    expect(result.hypotheticalPrice).toBeCloseTo(121, 10);
    expect(result.hypotheticalValue).toBeCloseTo(726, 10);
    expect(result.currency).toBe('USD');
    expect(result.variationPercent).toBe(10);
    expect(reference).toEqual({ quantity: 6, price: 110, type: 'stock_us', currency: 'USD' });
  });
  it('CP4-09 allows -100% and keeps the real position value', () => {
    expect(simulateInvestment(reference, -100)).toEqual({
      currentPrice: 110, hypotheticalPrice: 0, currentValue: 660,
      hypotheticalValue: 0, currency: 'USD', variationPercent: -100,
    });
  });
  it.each([-100.01, Number.NaN, Infinity, -Infinity])('CP4-09 rejects invalid variation %s', variation => {
    expect(() => simulateInvestment(reference, variation)).toThrow('mayor o igual a -100%');
    expect(reference.price).toBe(110);
    expect(reference.quantity).toBe(6);
  });
  it('uses the documented bond price per VN 100 while preserving the currency', () => {
    const result = simulateInvestment({ quantity: 1000, price: 60000, type: 'bond', currency: 'ARS' }, 10);
    expect(result.currentValue).toBe(600000);
    expect(result.hypotheticalValue).toBeCloseTo(660000);
    expect(result.hypotheticalPrice).toBeCloseTo(66000);
    expect(result.currency).toBe('ARS');
  });
  it.each([null, 0, -1, Number.NaN, Infinity])('does not invent a current price from %s', price => {
    expect(() => simulateInvestment({ ...reference, price }, 10)).toThrow('referencia válidos');
  });
  it.each([0, -1, Number.NaN, Infinity])('rejects unavailable holdings %s', quantity => {
    expect(() => simulateInvestment({ ...reference, quantity }, 10)).toThrow('referencia válidos');
  });
  it('rejects numeric overflow instead of presenting Infinity as money', () => {
    expect(() => simulateInvestment(reference, Number.MAX_VALUE)).toThrow('rango numérico');
  });
});
