import { NextRequest, NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import { createClient } from '@/lib/supabase/server';
import { parseCSVFile } from '@/lib/import/csv';
import {
  excelWorksheetToIolTable,
  iolHoldingToCreateInput,
  iolImportRequestId,
  parseIolPortfolioTable,
  type IolCell,
  type IolNumberFormat,
} from '@/lib/broker-import/iol-portfolio';
import { investmentsService } from '@/lib/services/investments';
import { accountsService } from '@/lib/services/accounts';
import { ApiError, errorResponse } from '@/lib/api-handler';

export const dynamic = 'force-dynamic';

const MAX_IMPORT_FILE_BYTES = 4 * 1024 * 1024;

async function tableFromUpload(file: File): Promise<{ headers: string[]; rows: IolCell[][] }> {
  const name = (file.name || '').toLowerCase();
  const buf = Buffer.from(await file.arrayBuffer());
  if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
    const sheet = wb.worksheets[0];
    if (!sheet) return { headers: [], rows: [] };
    return excelWorksheetToIolTable(sheet);
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
    const numberFormatRaw = String(formData.get('numberFormat') || '').trim();
    const numberFormat: IolNumberFormat | undefined =
      numberFormatRaw === 'es-AR' || numberFormatRaw === 'decimal' ? numberFormatRaw : undefined;
    const parsed = parseIolPortfolioTable(table.headers, table.rows, { numberFormat });
    if (parsed.needsNumberFormat) {
      return NextResponse.json({
        status: 'needs-format-confirmation',
        imported: 0,
        skipped: 0,
        updated: 0,
        conflicts: 0,
        failed: 0,
        ambiguousColumns: parsed.ambiguousColumns ?? [],
      });
    }
    const created: Array<{ id: string; ticker: string }> = [];
    const failed: Array<{ ticker: string; reason: string }> = [];
    const conflicts: Array<{ ticker: string; reason: string }> = [];

    for (const [index, holding] of parsed.holdings.entries()) {
      try {
        const row = await investmentsService.create({
          requestId: iolImportRequestId(user.id, accountId, holding, index),
          userId: user.id,
          ...iolHoldingToCreateInput(holding, accountId),
        });
        created.push({ id: row.id, ticker: holding.ticker });
      } catch (err) {
        if (err instanceof ApiError && err.status === 409) {
          conflicts.push({
            ticker: holding.ticker,
            reason: 'updated/conflict: la posición ya existe con otro precio o cantidad',
          });
          continue;
        }
        failed.push({
          ticker: holding.ticker,
          reason: err instanceof Error ? err.message : 'No se pudo crear',
        });
      }
    }

    return NextResponse.json({
      imported: created.length,
      skipped: parsed.skipped.length,
      updated: conflicts.length,
      conflicts: conflicts.length,
      failed: failed.length,
      created,
      skippedRows: parsed.skipped.slice(0, 50),
      conflictRows: conflicts.slice(0, 50),
      failedRows: failed.slice(0, 50),
    });
  } catch (error: unknown) {
    console.error('IOL investment import error:', error);
    return errorResponse(error);
  }
}
