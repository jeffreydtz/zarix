// Actual handlers + PostgreSQL WASM migrations/RLS. The query adapter and Auth
// identities substitute PostgREST/GoTrue; this is not a native HTTP/browser run.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { PGlite, type Transaction } from '@electric-sql/pglite';
import { uuid_ossp } from '@electric-sql/pglite/contrib/uuid_ossp';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { asRole, bootstrapSources, ids, platformSql } from '../scripts/lib/test-isolated-database.mjs';

const auth = vi.hoisted(() => ({ id: '' as string | null, error: null as unknown, databaseError: null as unknown, createClient: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createClient: auth.createClient }));
import { GET, PUT } from '@/app/api/user/preferences/route';
import { getPresentationPreferences } from '@/lib/services/presentation-preferences';

let db: PGlite;
let directory: string;
let originalFinances: unknown;
const operations: Array<{ owner: string | null; table: string; columns: string; update?: unknown; id?: unknown }> = [];

function sessionClient(owner: string | null): any {
  return {
    auth: { getUser: async () => ({ data: { user: owner ? { id: owner } : null }, error: auth.error }) },
    from(table: string) {
      const operation = { owner, table, columns: '', update: undefined as Record<string, unknown> | undefined, id: undefined as unknown };
      operations.push(operation);
      const builder = {
        select(columns: string) { operation.columns = columns; return builder; },
        eq(column: string, value: unknown) { expect(column).toBe('id'); operation.id = value; return builder; },
        update(values: Record<string, unknown>) { operation.update = values; return builder; },
        async single() {
          expect(table).toBe('users');
          expect(operation.columns).toBe('default_currency, net_worth_widget_visible');
          if (auth.databaseError) return { data: null, error: auth.databaseError };
          try {
            const result = await asRole(db, 'authenticated', owner, async (tx: Transaction) => {
              if (!operation.update) {
                return tx.query(`SELECT default_currency,net_worth_widget_visible FROM users WHERE id=$1`, [operation.id]);
              }
              const keys = Object.keys(operation.update);
              expect(keys.every(key => ['default_currency', 'net_worth_widget_visible'].includes(key))).toBe(true);
              return tx.query(`UPDATE users SET ${keys.map((key, index) => `${key}=$${index + 1}`).join(',')}
                WHERE id=$${keys.length + 1} RETURNING default_currency,net_worth_widget_visible`,
              [...Object.values(operation.update), operation.id]);
            });
            return { data: result.rows[0] ?? null, error: null };
          } catch (error) { return { data: null, error }; }
        },
      };
      return builder;
    },
  };
}

function request(body?: unknown, formOwner?: string) {
  return new Request('http://localhost/api/user/preferences', body === undefined ? {} : {
    method: 'PUT', body: JSON.stringify(body),
    headers: formOwner === undefined ? {} : { 'X-Preferences-Owner': formOwner },
  });
}
async function finances() {
  return (await db.query<{ value: unknown }>(`SELECT jsonb_build_object(
    'accounts',(SELECT jsonb_agg(to_jsonb(a) ORDER BY id) FROM accounts a),
    'transactions',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM transactions t),
    'investments',(SELECT jsonb_agg(to_jsonb(i) ORDER BY id) FROM investments i),
    'history',(SELECT jsonb_agg(to_jsonb(n) ORDER BY id) FROM net_worth_snapshots n)) AS value`)).rows[0].value;
}

beforeAll(async () => {
  directory = await mkdtemp(path.join(os.tmpdir(), 'zarix-preferences-'));
  db = await PGlite.create(directory, { extensions: { uuid_ossp, pg_trgm } });
  await db.exec(platformSql);
  for (const source of await bootstrapSources()) await db.exec(source.sql);
  await db.query('INSERT INTO auth.users(id,email) VALUES($1,$2),($3,$4)', [ids.a, 'preferences-a@zarix.invalid', ids.b, 'preferences-b@zarix.invalid']);
  await db.query(`INSERT INTO accounts(id,user_id,name,type,currency) VALUES
    ($1,$2,'ARS fixture','bank','ARS'),($3,$2,'USD fixture','bank','USD'),($4,$5,'Other owner','bank','ARS')`,
  [ids.accountA, ids.a, ids.usdA, ids.accountB, ids.b]);
  await db.query(`INSERT INTO transactions(user_id,type,account_id,amount,currency,amount_in_account_currency)
    VALUES($1,'adjustment',$2,120000,'ARS',120000),($1,'adjustment',$3,100,'USD',100)`, [ids.a, ids.accountA, ids.usdA]);
  await db.query(`INSERT INTO net_worth_snapshots(user_id,snapshot_date,liquid_usd,investments_usd,total_usd,total_ars_blue,blue_ars_per_usd)
    VALUES($1,'2026-10-06',200,0,200,240000,1200)`, [ids.a]);
  originalFinances = await finances();
}, 25_000);
beforeEach(async () => {
  auth.id = ids.a; auth.error = null; auth.databaseError = null; operations.length = 0;
  auth.createClient.mockImplementation(async () => sessionClient(auth.id));
  await db.query("UPDATE users SET default_currency='ARS',net_worth_widget_visible=true");
});
afterAll(async () => {
  if (db && !db.closed) await db.close();
  if (directory) await rm(directory, { recursive: true, force: true });
});

describe('RF14 persisted owner preferences', () => {
  it('CP2-11: survives database reopen/new session client, keeping originals120000/100 and other owner unchanged', async () => {
    const beforeB = (await db.query<{ value: unknown }>('SELECT to_jsonb(u) AS value FROM users u WHERE id=$1', [ids.b])).rows[0].value;
    expect(await (await GET(request())).json()).toEqual({ default_currency: 'ARS', net_worth_widget_visible: true });
    const response = await PUT(request({ default_currency: 'USD', net_worth_widget_visible: false }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ default_currency: 'USD', net_worth_widget_visible: false });
    await db.close();
    db = await PGlite.create(directory, { extensions: { uuid_ossp, pg_trgm } });
    auth.createClient.mockImplementation(async () => sessionClient(ids.a));
    expect(await (await GET(request())).json()).toEqual({ default_currency: 'USD', net_worth_widget_visible: false });
    expect(await getPresentationPreferences(ids.a)).toEqual({ default_currency: 'USD', net_worth_widget_visible: false });
    expect((await db.query('SELECT currency,balance FROM accounts WHERE user_id=$1 ORDER BY currency', [ids.a])).rows)
      .toEqual([{ currency: 'ARS', balance: '120000.00000000' }, { currency: 'USD', balance: '100.00000000' }]);
    expect((await db.query<{ value: unknown }>('SELECT to_jsonb(u) AS value FROM users u WHERE id=$1', [ids.b])).rows[0].value).toEqual(beforeB);
    expect(await finances()).toEqual(originalFinances);
    expect(operations.every(operation => operation.owner === ids.a && operation.id === ids.a)).toBe(true);
  }, 25_000);

  it.each([
    { default_currency: 'ZZZ', net_worth_widget_visible: false }, { default_currency: 'usd', net_worth_widget_visible: true },
    { default_currency: 'ARS', net_worth_widget_visible: 'false' },
    { default_currency: 'USD', net_worth_widget_visible: false, user_id: ids.b },
    { default_currency: 'ARS', id: ids.b, net_worth_widget_visible: false },
    { default_currency: 'USD' }, { net_worth_widget_visible: false },
    { default_currency: 'USD', net_worth_widget_visible: true, widgets: { nonexistent: true } },
    { default_currency: 'ARS', net_worth_widget_visible: true, status: 'ACTIVE' }, {}, null,
  ])('CP2-12: rejects invalid or foreign preference input atomically: %j', async body => {
    const before = (await db.query<{ value: unknown }>('SELECT jsonb_agg(to_jsonb(u) ORDER BY id) AS value FROM users u')).rows[0].value;
    expect((await PUT(request(body))).status).toBe(400);
    expect(operations).toEqual([]);
    expect((await db.query<{ value: unknown }>('SELECT jsonb_agg(to_jsonb(u) ORDER BY id) AS value FROM users u')).rows[0].value).toEqual(before);
    expect(await finances()).toEqual(originalFinances);
  });

  it('CP2-12: the real users RLS and column grants also deny another owner, anon and invalid direct currencies', async () => {
    expect((await asRole(db, 'authenticated', ids.a, (tx: Transaction) => tx.query(
      'SELECT default_currency,net_worth_widget_visible FROM users WHERE id=$1', [ids.b]))).rows).toEqual([]);
    expect((await asRole(db, 'authenticated', ids.a, (tx: Transaction) => tx.query(
      'UPDATE users SET net_worth_widget_visible=false WHERE id=$1 RETURNING id', [ids.b]))).rows).toEqual([]);
    await expect(asRole(db, 'anon', null, (tx: Transaction) => tx.query('SELECT net_worth_widget_visible FROM users'))).rejects.toMatchObject({ code: '42501' });
    await expect(asRole(db, 'authenticated', ids.a, (tx: Transaction) => tx.query(
      "UPDATE users SET default_currency='ZZZ' WHERE id=$1", [ids.a]))).rejects.toMatchObject({ code: '23514' });
    expect(await getPresentationPreferences(ids.a)).toEqual({ default_currency: 'ARS', net_worth_widget_visible: true });
    expect(await finances()).toEqual(originalFinances);
  });

  it('CP3-17: independent owner reloads read only their saved base/widget without changing financial history', async () => {
    await PUT(request({ default_currency: 'USD', net_worth_widget_visible: false }));
    auth.id = ids.b;
    expect(await (await GET(request())).json()).toEqual({ default_currency: 'ARS', net_worth_widget_visible: true });
    auth.id = ids.a;
    expect(await (await GET(request())).json()).toEqual({ default_currency: 'USD', net_worth_widget_visible: false });
    expect(await finances()).toEqual(originalFinances);
  });
  it('CP2-12: an old tab owned by A cannot save its settings after the browser session switches to B', async () => {
    auth.id = ids.b;
    const before = (await db.query<{ value: unknown }>('SELECT jsonb_agg(to_jsonb(u) ORDER BY id) AS value FROM users u')).rows[0].value;
    const rejected = await PUT(request({ default_currency: 'USD', net_worth_widget_visible: false }, ids.a));
    expect(rejected.status).toBe(403);
    expect(await rejected.json()).toEqual({ error: 'La sesión cambió. Recargá Configuración antes de guardar.' });
    expect(operations).toEqual([]);
    expect((await db.query<{ value: unknown }>('SELECT jsonb_agg(to_jsonb(u) ORDER BY id) AS value FROM users u')).rows[0].value).toEqual(before);
    expect(await finances()).toEqual(originalFinances);
  });
  it('accepts a matching form owner while retaining normal authenticated clients without this optional header', async () => {
    expect((await PUT(request({ default_currency: 'USD', net_worth_widget_visible: false }, ids.a))).status).toBe(200);
    expect((await PUT(request({ default_currency: 'ARS', net_worth_widget_visible: true }))).status).toBe(200);
    expect(operations.every(operation => operation.owner === ids.a && operation.id === ids.a)).toBe(true);
  });

  it('requires a verified session and distinguishes unavailable Auth from rejection', async () => {
    auth.id = null;
    expect((await GET(request())).status).toBe(401);
    expect((await PUT(request({ default_currency: 'USD' }))).status).toBe(401);
    auth.error = new Error('synthetic auth unavailable');
    expect((await GET(request())).status).toBe(503);
    expect(operations).toEqual([]);
  });
  it('does not present defaults or successful persistence when the database is unavailable', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      auth.databaseError = new Error('synthetic private DB relation detail');
      const read = await GET(request());
      const write = await PUT(request({ default_currency: 'USD', net_worth_widget_visible: false }));
      expect(read.status).toBe(500); expect(write.status).toBe(500);
      expect(await read.json()).toEqual({ error: 'Ocurrió un error procesando la solicitud.' });
      expect(await write.json()).toEqual({ error: 'Ocurrió un error procesando la solicitud.' });
      auth.databaseError = null;
      expect(await getPresentationPreferences(ids.a)).toEqual({ default_currency: 'ARS', net_worth_widget_visible: true });
      expect(await finances()).toEqual(originalFinances);
    } finally { log.mockRestore(); }
  });
  it('preserves unsupported legacy configuration until the owner explicitly saves both valid preferences', async () => {
    // Setup an existing value from before this migration; do not weaken the
    // production trigger or normalize it as a side effect of another setting.
    await db.exec('ALTER TABLE users DISABLE TRIGGER trigger_validate_presentation_currency');
    try { await db.query("UPDATE users SET default_currency='EUR' WHERE id=$1", [ids.a]); }
    finally { await db.exec('ALTER TABLE users ENABLE TRIGGER trigger_validate_presentation_currency'); }
    const before = (await db.query<{ value: unknown }>('SELECT to_jsonb(u) AS value FROM users u WHERE id=$1', [ids.a])).rows[0].value;
    expect((await PUT(request({ net_worth_widget_visible: false }))).status).toBe(400);
    expect((await db.query<{ value: unknown }>('SELECT to_jsonb(u) AS value FROM users u WHERE id=$1', [ids.a])).rows[0].value).toEqual(before);
    const response = await PUT(request({ default_currency: 'USD', net_worth_widget_visible: false }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ default_currency: 'USD', net_worth_widget_visible: false });
    expect(await finances()).toEqual(originalFinances);
  });
});
