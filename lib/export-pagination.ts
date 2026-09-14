import { ApiError } from '@/lib/api-handler';

export const EXPORT_PAGE_SIZE = 1000;
const MAX_ROWS = 100_000;
const MAX_BYTES = 32 * 1024 * 1024;

export function checkExportDeadline(signal: AbortSignal) {
  if (signal.aborted) throw new ApiError('La exportación tardó demasiado. Intentá nuevamente o exportá por períodos.', 504);
}

/** Shared raw dataset budget; formatting can make the final response larger. */
export function createExportBudget() {
  const signal = AbortSignal.timeout(45_000);
  let rows = 0;
  let bytes = 0;
  return {
    signal,
    add(batch: unknown[]) {
      rows += batch.length;
      bytes += Buffer.byteLength(JSON.stringify(batch), 'utf8');
      if (rows > MAX_ROWS || bytes > MAX_BYTES) {
        throw new ApiError('La exportación supera el límite de 100.000 registros o 32 MiB. Exportá por períodos o solicitá un respaldo asistido.', 413);
      }
    },
  };
}

/** Fetch callbacks must scope every page to the authenticated user and order by id ASC. */
export async function collectExportRows<T extends { id: string }>(
  fetchPage: (after: string | undefined, signal: AbortSignal) => PromiseLike<{ data: T[] | null; error: unknown }>,
  budget: ReturnType<typeof createExportBudget>,
): Promise<T[]> {
  const rows: T[] = [];
  let after: string | undefined;
  for (;;) {
    checkExportDeadline(budget.signal);
    const { data, error } = await fetchPage(after, budget.signal);
    checkExportDeadline(budget.signal);
    if (error) throw error;
    if (!data) throw new Error('Export query returned no dataset');
    if (data.length === 0) return rows;
    // Refuse a broken cursor rather than loop forever or return duplicated records.
    for (const row of data) {
      if (!row.id || (after !== undefined && row.id <= after)) throw new Error('Export cursor did not advance');
      after = row.id;
    }
    budget.add(data);
    rows.push(...data);
    // A short page may be PostgREST's configured max_rows, not the end of the data.
  }
}
