// Test-only Supabase platform fixture. This is PostgreSQL WASM, not GoTrue/PostgREST.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { uuid_ossp } from '@electric-sql/pglite/contrib/uuid_ossp';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const snapshotSource = 'supabase/baselines/20261009000000_preverification_snapshot.sql';
export const baselineCommit = 'ed894431968775dba1d9ba01df99d9a442407865';
// This reconstructed prehistory supplies core objects absent from migration
// history. Every historical and new migration then executes unchanged in order.
export const baselineSource = 'supabase/baselines/pre_20260401_fresh_install.sql';
export const ids = {
  a: '11111111-1111-4111-8111-111111111111', b: '22222222-2222-4222-8222-222222222222',
  accountA: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', accountB: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1',
  usdA: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', categoryA: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3',
  categoryB: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb3', investmentA: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4',
  investmentB: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb4', groupA: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa5',
  groupB: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb5', memberA: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa6',
  guestA: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa7', memberB: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb6',
  tokenA: 'a'.repeat(32), tokenB: 'b'.repeat(32),
};
export const platformSql = `
CREATE ROLE anon NOLOGIN NOSUPERUSER NOBYPASSRLS;
CREATE ROLE authenticated NOLOGIN NOSUPERUSER NOBYPASSRLS;
CREATE ROLE service_role NOLOGIN NOSUPERUSER BYPASSRLS;
CREATE SCHEMA auth;
CREATE SCHEMA extensions;
CREATE EXTENSION "uuid-ossp" WITH SCHEMA extensions;
CREATE EXTENSION pg_trgm WITH SCHEMA extensions;
SET search_path=public,extensions;
CREATE TABLE auth.users (id uuid PRIMARY KEY, email text UNIQUE, raw_user_meta_data jsonb DEFAULT '{}');
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
 SELECT coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''),
 nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid
$$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
 SELECT coalesce(nullif(current_setting('request.jwt.claim.role', true), ''),
 nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
$$;
GRANT USAGE ON SCHEMA public, auth, extensions TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.uid(), auth.role() TO anon, authenticated, service_role;
`;
export async function emptyDatabase({ legacyGrants = false } = {}) {
  const db = await PGlite.create({ extensions: { uuid_ossp, pg_trgm } });
  await db.exec(platformSql);
  if (legacyGrants) await db.exec(`
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
  `);
  return db;
}
export const digest = data => createHash('sha256').update(data).digest('hex');
export async function source(relative) {
  const sql = await fs.readFile(path.join(root, relative), 'utf8');
  return { path: relative, sha256: digest(sql), sql };
}
export async function bootstrapSources(options = {}) {
  const migrations = (await fs.readdir(path.join(root, 'supabase/migrations')))
    .filter(name => name.endsWith('.sql') && (options.includeNew !== false || name <= '20261015172339_preserve_transfer_destination_amount.sql'))
    .sort();
  return Promise.all([baselineSource, ...migrations.map(n => `supabase/migrations/${n}`)].map(source));
}
export async function bootDatabase(options = {}) {
  const db = await emptyDatabase(options);
  const manifest = [];
  try {
    for (const file of options.sourceFiles ?? await bootstrapSources(options)) {
      await db.exec(file.sql);
      manifest.push({ path: file.path, sha256: file.sha256 });
    }
    return { db, manifest };
  } catch (error) { await db.close(); throw error; }
}
export async function asRole(db, role, userId, fn) {
  if (!['anon', 'authenticated', 'service_role'].includes(role)) throw new Error('Unsupported test role');
  return db.transaction(async tx => {
    await tx.exec(`SET LOCAL ROLE ${role}`);
    await tx.query("SELECT set_config('request.jwt.claims',$1,true),set_config('request.jwt.claim.sub',$2,true),set_config('request.jwt.claim.role',$3,true)",
      [JSON.stringify({ role, ...(userId ? { sub: userId } : {}) }), userId || '', role]);
    return fn(tx);
  });
}
export async function seedDatabase(db) {
  await db.query('INSERT INTO auth.users(id,email) VALUES ($1,$2),($3,$4)',
    [ids.a, 'test-a@zarix.invalid', ids.b, 'test-b@zarix.invalid']);
  await db.query(`INSERT INTO accounts(id,user_id,name,type,currency,balance) VALUES
    ($1,$2,'Cuenta sintética A','bank','ARS',10000),($3,$4,'Cuenta sintética B','bank','ARS',5000),
    ($5,$2,'Cuenta sintética USD','bank','USD',100)`, [ids.accountA, ids.a, ids.accountB, ids.b, ids.usdA]);
  await db.query(`INSERT INTO categories(id,user_id,name,type) VALUES ($1,$2,'Categoría A','expense'),($3,$4,'Categoría B','expense')`,
    [ids.categoryA, ids.a, ids.categoryB, ids.b]);
  await db.query(`INSERT INTO investments(id,user_id,account_id,type,name,quantity,purchase_price,purchase_currency,purchase_date)
    VALUES ($1,$2,$3,'stock_us','Posición A',10,20,'USD','2026-10-01'),($4,$5,$6,'stock_us','Posición B',5,30,'USD','2026-10-01')`,
    [ids.investmentA, ids.a, ids.accountA, ids.investmentB, ids.b, ids.accountB]);
  await db.query(`INSERT INTO shared_groups(id,owner_user_id,name,share_token) VALUES ($1,$2,'Grupo A',$3),($4,$5,'Grupo B',$6)`,
    [ids.groupA, ids.a, ids.tokenA, ids.groupB, ids.b, ids.tokenB]);
  await db.query(`INSERT INTO shared_group_members(id,group_id,user_id,display_name) VALUES
    ($1,$2,$3,'Miembro A'),($4,$2,NULL,'Invitado sintético'),($5,$6,$7,'Miembro B')`,
    [ids.memberA, ids.groupA, ids.a, ids.guestA, ids.memberB, ids.groupB, ids.b]);
}
export async function catalog(db) {
  const tables = (await db.query(`SELECT c.relname AS name,c.relrowsecurity AS rls,c.relforcerowsecurity AS force_rls
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' ORDER BY 1`)).rows;
  const policies = (await db.query(`SELECT tablename,policyname,roles,cmd,qual,with_check FROM pg_policies WHERE schemaname='public' ORDER BY tablename,policyname`)).rows;
  const functions = (await db.query(`SELECT p.oid::regprocedure::text AS signature,p.prosecdef AS security_definer,p.proconfig AS settings,
    has_function_privilege('anon',p.oid,'EXECUTE') AS anon_execute,
    has_function_privilege('authenticated',p.oid,'EXECUTE') AS authenticated_execute,
    has_function_privilege('service_role',p.oid,'EXECUTE') AS service_execute,pg_get_functiondef(p.oid) AS definition
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.prolang IN (SELECT oid FROM pg_language WHERE lanname IN ('sql','plpgsql')) ORDER BY 1`)).rows;
  const views = (await db.query(`SELECT relname AS name,reloptions,pg_get_viewdef(oid) AS definition FROM pg_class WHERE relkind='v' AND relnamespace='public'::regnamespace ORDER BY 1`)).rows;
  const indexes = (await db.query(`SELECT tablename,indexname,indexdef FROM pg_indexes WHERE schemaname='public' ORDER BY tablename,indexname`)).rows;
  const constraints = (await db.query(`SELECT conrelid::regclass::text AS relation,conname,contype,convalidated,pg_get_constraintdef(oid) AS definition
    FROM pg_constraint WHERE connamespace='public'::regnamespace ORDER BY relation,conname`)).rows;
  const columns = (await db.query(`SELECT c.relname AS relation,a.attname AS name,format_type(a.atttypid,a.atttypmod) AS type,a.attnotnull,
    a.attacl::text[] AS acl,pg_get_expr(d.adbin,d.adrelid) AS default_value FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid
    LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE c.relnamespace='public'::regnamespace
    AND c.relkind IN ('r','v') AND a.attnum>0 AND NOT a.attisdropped ORDER BY c.relname,a.attnum`)).rows;
  const grants = (await db.query(`SELECT relname,relacl::text[] AS acl FROM pg_class WHERE relnamespace='public'::regnamespace AND relkind IN ('r','v','S') ORDER BY relname`)).rows;
  const triggers = (await db.query(`SELECT c.relname AS relation,t.tgname,t.tgenabled,pg_get_triggerdef(t.oid) AS definition FROM pg_trigger t
    JOIN pg_class c ON c.oid=t.tgrelid WHERE c.relnamespace='public'::regnamespace AND NOT t.tgisinternal ORDER BY c.relname,t.tgname`)).rows;
  return { tables, policies, functions, views, indexes, constraints, columns, grants, triggers };
}
