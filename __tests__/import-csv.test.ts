import { describe, expect, it } from 'vitest';
import { parseCSVFile } from '@/lib/import/csv';

describe('financial CSV import', () => {
  it('preserves exported descriptions with newlines, commas and escaped quotes', () => {
    const description = 'Compra, con "detalle"\nsegunda línea';
    const quote = (value: string) => `"${value.replace(/"/g, '""')}"`;
    const text = `Fecha,Tipo,Monto,Cuenta,Descripción\r\n2026-10-06,Gasto,25,Caja,${quote(description)}\r\n2026-10-07,Ingreso,50,Caja,Otro\r\n`;
    const result = parseCSVFile(text);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]).toEqual(['2026-10-06', 'Gasto', '25', 'Caja', description]);
    expect(result.rows[1][2]).toBe('50');
  });

  it('keeps CRLF and leading/trailing spaces inside quoted text intact', () => {
    expect(parseCSVFile('Fecha;Monto;Descripción\n2026-10-06;12,50;"  uno\r\ndos  "').rows)
      .toEqual([['2026-10-06', '12,50', '  uno\r\ndos  ']]);
  });

  it('handles UTF-8 BOM and empty lines without creating financial rows', () => {
    expect(parseCSVFile('\uFEFFFecha,Monto\r\n\r\n2026-10-06,10\r\n').headers)
      .toEqual(['Fecha', 'Monto']);
    expect(parseCSVFile('Fecha,Monto\n\n2026-10-06,10\n\n').rows).toHaveLength(1);
  });

  it('rejects an unfinished quoted cell instead of silently importing a partial row', () => {
    expect(() => parseCSVFile('Fecha,Monto,Descripción\n2026-10-06,10,"incompleto\n'))
      .toThrow('sin cerrar');
  });
});
