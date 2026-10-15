import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ user: { id: 'u1', email: 'synthetic@example.invalid' } as { id: string; email: string } | null, rows: {} as Record<string, Record<string, unknown>[]>, fail: '', queries: [] as { table: string; filter?: string; from?: number }[] }));
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({
  auth: { getUser: async () => ({ data: { user: mocks.user } }) },
  from: (table: string) => {
    const record: { table: string; filter?: string; from?: number } = { table }; mocks.queries.push(record);
    const query = {
      select: () => query, eq: (key: string, value: string) => { record.filter = `${key}=${value}`; return query; },
      or: (value: string) => { record.filter = value; return query; }, order: () => query,
      range: async (from: number, to: number) => { record.from = from; return { data: (mocks.rows[table] || []).slice(from, to + 1), error: mocks.fail === table ? new Error('synthetic database failure') : null }; },
      single: async () => ({ data: { default_currency: 'ARS', timezone: 'UTC' }, error: mocks.fail === table ? new Error('synthetic profile failure') : null }),
    }; return query;
  },
}) }));
import { GET } from '@/app/api/export/backup/route';
beforeEach(() => { mocks.user = { id: 'u1', email: 'synthetic@example.invalid' }; mocks.rows = {}; mocks.fail = ''; mocks.queries = []; });
describe('personal data export scope and pagination', () => {
  it('exports beyond API page size for all five tables and labels recovery exclusions', async () => {
    for (const table of ['accounts', 'transactions', 'categories', 'budgets', 'investments']) mocks.rows[table] = Array.from({ length: 1001 }, (_, id) => ({ id: String(id), user_id: 'u1' }));
    const response = await GET(); const body = await response.json();
    expect(response.status).toBe(200); expect(body.scope).toBe('personal-data-export');
    expect(body.recoveryCoverage).toEqual({ schema: false, auth: false, storage: false, completeSystem: false });
    for (const table of Object.keys(mocks.rows)) expect(body.data[table]).toHaveLength(1001);
    expect(mocks.queries.filter(q => q.table !== 'users').every(q => q.filter?.includes('u1'))).toBe(true);
  });
  it('fails closed instead of downloading partial rows when a table errors', async () => { mocks.fail = 'budgets'; expect((await GET()).status).toBe(500); });
  it('requires normal authenticated session before any database query', async () => { mocks.user = null; expect((await GET()).status).toBe(401); expect(mocks.queries).toHaveLength(0); });
});
