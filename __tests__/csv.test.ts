import { describe, it, expect } from 'vitest';
import { encodeCsvCell } from '@/lib/csv';

describe('CSV financial export', () => {
  it('keeps embedded quotes, commas and newlines inside a single field', () => {
    expect(encodeCsvCell('Caja","=1+1","extra')).toBe('"Caja"",""=1+1"",""extra"');
    expect(encodeCsvCell('Cuenta "USD"\nPersonal')).toBe('"Cuenta ""USD""\nPersonal"');
  });
  it.each(['=1+1', '+1+1', '-1+1', '@SUM(A1)', '\t=1', '\r=1', '\n=1', '  =1'])('neutralizes spreadsheet formulas: %j', value => {
    expect(encodeCsvCell(value)).toBe(`"'${value}"`);
  });
  it('preserves ordinary names and already literal apostrophes', () => {
    expect(encodeCsvCell("José's cuenta")).toBe('"José\'s cuenta"');
  });
});
