import { NextRequest, NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import { createClient } from '@/lib/supabase/server';
import { parseCSVFile } from '@/lib/import/csv';
import { parseIolPortfolioTable } from '@/lib/broker-import/iol-portfolio';
import { investmentsService } from '@/lib/services/investments';
import { accountsService } from '@/lib/services/accounts';
import { errorResponse } from '@/lib/api-handler';
import { randomUUID } from 'node:crypto';

export const dynamic = 'force-dynamic';

const MAX_IMPORT_FILE_BYTES = 4 * 1024 * 1024;

async function tableFromUpload(file: File): Promise<{ headers: string[]; rows: string[][] }> {
  const name = (file.name || '').toLowerCase();
  const buf = Buffer.from(await file.arrayBuffer());
  if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
    const sheet = wb.worksheets[0];
    if (!sheet) return { headers: [], rows: [] };
    const matrix: string[][] = [];
    sheet.eachRow((row) => {
      const values = Array.isArray(row.values) ? row.values.slice(1) : [];
      matrix.push(values.map((v) => (v == null ? '' : String(v))));
    });
    if (matrix.length === 0) return { headers: [], rows: [] };
    return { headers: matrix[0], rows: matrix.slice(1) };
  }
  return parseCSVFile(buf.toString('utf8'));
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const formData = await req.formData();
    const file = formData.get('file');
    const accountId = String(formData.get('accountId') || '');
    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json({ error: 'Subí un CSV o Excel de Mi Portafolio (IOL)' }, { status: 400 });
    }
    if (file.size > MAX_IMPORT_FILE_BYTES) {
      return NextResponse.json({ error: 'El archivo es demasiado grande' }, { status: 400 });
    }
    if (!accountId) {
      return NextResponse.json({ error: 'Elegí la cuenta de broker destino' }, { status: 400 });
    }

    const accounts = await accountsService.listInvestmentAccounts(user.id);
    if (!accounts.some((a) => a.id === accountId)) {
      return NextResponse.json({ error: 'Cuenta de inversión no encontrada' }, { status: 404 });
    }

    const table = await tableFromUpload(file);
    const parsed = parseIolPortfolioTable(table.headers, table.rows);
    const created: Array<{ id: string; ticker: string }> = [];
    const failed: Array<{ ticker: string; reason: string }> = [];

    for (const holding of parsed.holdings) {
      try {
        const row = await investmentsService.create({
          requestId: randomUUID(),
          userId: user.id,
          accountId,
          type: holding.type,
          ticker: holding.ticker,
          name: holding.name,
          quantity: holding.quantity,
          purchasePrice: holding.purchasePrice,
          purchaseCurrency: holding.purchaseCurrency,
          purchaseDate: holding.purchaseDate,
          marketCurrency: holding.marketCurrency,
          paymentCurrency: holding.paymentCurrency,
          isManualPrice: holding.lastPrice != null,
          currentPrice: holding.lastPrice ?? undefined,
        });
        created.push({ id: row.id, ticker: holding.ticker });
      } catch (err) {
        failed.push({
          ticker: holding.ticker,
          reason: err instanceof Error ? err.message : 'No se pudo crear',
        });
      }
    }

    return NextResponse.json({
      imported: created.length,
      skipped: parsed.skipped.length,
      failed: failed.length,
      created,
      skippedRows: parsed.skipped.slice(0, 50),
      failedRows: failed.slice(0, 50),
    });
  } catch (error: unknown) {
    console.error('IOL investment import error:', error);
    return errorResponse(error);
  }
}
