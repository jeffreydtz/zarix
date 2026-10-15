/** Fits the documented source/restore/load PostgREST max_rows=1000. */
export const SUPABASE_READ_PAGE_SIZE = 1000;

/**
 * Complete an explicitly ordered read with a fresh builder for every range.
 * Any failed page rejects the whole read; callers never receive a partial sum.
 * Range pagination is not a transaction snapshot under concurrent mutations.
 */
export async function readAllPages<T>(buildPage: (from: number, to: number) => PromiseLike<{
  data: T[] | null;
  error: unknown;
}>): Promise<T[]> {
  const pageSize = SUPABASE_READ_PAGE_SIZE;
  const rows: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await buildPage(from, from + pageSize - 1);
    if (error) throw error;
    const page = data ?? [];
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
}
