import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import { validateXlsxArchive } from '@/lib/xlsx-limits';
import { errorResponse } from '@/lib/api-handler';

async function workbookBuffer(padding?: string): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet('Movimientos');
  sheet.addRow(['Fecha', 'Monto', 'Cuenta']);
  sheet.addRow(['2026-09-01', 1250, padding ?? 'Caja']);
  const bytes = Buffer.from(await wb.xlsx.writeBuffer());
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

describe('XLSX bounded import', () => {
  it('accepts a normal workbook that remains readable by ExcelJS', async () => {
    const buffer = await workbookBuffer();
    await expect(validateXlsxArchive(buffer)).resolves.toBeUndefined();
    const parsed = new ExcelJS.Workbook();
    await parsed.xlsx.load(buffer);
    expect(parsed.worksheets[0].getCell('B2').value).toBe(1250);
  });
  it('rejects highly compressed oversized XML before ExcelJS loads it', async () => {
    const buffer = await workbookBuffer('A'.repeat(9 * 1024 * 1024));
    expect(buffer.byteLength).toBeLessThan(100_000);
    await expect(validateXlsxArchive(buffer)).rejects.toThrow('límites');
  });
  it('rejects malformed archives', async () => {
    await expect(validateXlsxArchive(new ArrayBuffer(50))).rejects.toThrow('ZIP');
    const error = await validateXlsxArchive(new ArrayBuffer(50)).catch(e => e);
    expect(errorResponse(error).status).toBe(400);
  });
});
