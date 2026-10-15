// Real PostgreSQL WASM and synthetic roles only; never connects to a server.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import ts from 'typescript';
import { asRole, bootDatabase, bootstrapSources, digest, ids, root, seedDatabase } from './lib/test-isolated-database.mjs';

const migration = 'supabase/migrations/20261015072636_audit_transaction_deletions.sql';
const withoutAudit = process.argv.includes('--without-audit');
const sourceFiles = (await bootstrapSources()).filter(file => !withoutAudit || file.path !== migration);
const sources = [...sourceFiles.map(({ path, sha256 }) => ({ path, sha256 })), ...await Promise.all([
  'scripts/test-transaction-deletion-audit.mjs', 'scripts/lib/test-isolated-database.mjs', 'types/supabase-generated.ts',
].map(async file => ({ path: file, sha256: digest(await fs.readFile(path.join(root, file))) })))];
const report = {
  runAt: new Date().toISOString(), mode: withoutAudit ? 'before-without-audit' : 'after',
  scope: 'CP1-08 exact SQL1500 fixture plus role/grant/RLS/atomicity regressions in isolated PGlite; synthetic Auth claims, no GoTrue/PostgREST/native/runtime/provider acceptance.',
  sources, results: [],
};
let checks;
const check = (name, actual, expected) => { checks.push({ name, actual, expected }); assert.deepEqual(actual, expected, name); };
async function test(profile, name, fn) {
  checks = [];
  try { await fn(); report.results.push({ profile, name, status: 'PASS', assertions: checks }); }
  catch (error) { report.results.push({ profile, name, status: 'FAIL', assertions: checks, error: { type: error.name, code: error.code ?? null, rawMessagePublished: false } }); }
}
async function denied(name, fn) {
  let code;
  try { await fn(); } catch (error) { code = error.code; }
  check(name, code ?? null, '42501');
}
for (const legacyGrants of [false, true]) {
  const profile = legacyGrants ? 'legacy-default-grants' : 'explicit-grants-only';
  const { db } = await bootDatabase({ legacyGrants, sourceFiles });
  try {
    report.engine ||= (await db.query('SELECT version() AS version')).rows[0].version;
    await seedDatabase(db);
    const owner = fn => asRole(db, 'authenticated', ids.a, fn);
    const normal = (role, userId, query, args = []) => asRole(db, role, userId, tx => tx.query(query, args));
    const balance = async () => Number((await db.query('SELECT balance FROM accounts WHERE id=$1', [ids.accountA])).rows[0].balance);
    const insert = async (amount, user = ids.a, account = ids.accountA) => (await normal('authenticated', user,
      `INSERT INTO transactions(user_id,type,account_id,amount,currency,amount_in_account_currency,description,notes,tags,transaction_date)
       VALUES($1,'expense',$2,$3,'ARS',$3,'Synthetic deleted movement','Original note',ARRAY['audit-fixture'],'2026-10-06T12:00:00Z') RETURNING to_jsonb(transactions.*) AS previous_row`, [user, account, amount])).rows[0].previous_row;
    const audit = async (user = ids.a) => (await normal('authenticated', user, 'SELECT * FROM transaction_deletion_audit ORDER BY deleted_at,id')).rows;
    let original;
    await test(profile, 'CP1-08 expense1500 delete restores10000 and retains exact OLD identity and actor', async () => {
      check('Fresh account balance', await balance(), 10000);
      original = await insert(1500);
      check('Expense balance before DELETE', await balance(), 8500);
      const deletion = await normal('authenticated', ids.a, 'DELETE FROM transactions WHERE id=$1 RETURNING id', [original.id]);
      check('DELETE returned exactly one original ID', deletion.rows.map(row => row.id), [original.id]);
      check('Balance after DELETE', await balance(), 10000);
      check('Operational movement absent', (await normal('authenticated', ids.a, 'SELECT id FROM transactions WHERE id=$1', [original.id])).rows, []);
      const rows = await audit();
      check('Exactly one owner audit event', rows.length, 1);
      check('Deleted transaction identity', rows[0].transaction_id, original.id);
      check('Original owner retained', rows[0].user_id, ids.a);
      check('Actual authenticated actor', rows[0].actor_id, ids.a);
      check('Actual request SQL role', rows[0].actor_role, 'authenticated');
      // Read OLD through PostgreSQL JSONB before comparing; date/NUMERIC encoding
      // is then the same as to_jsonb(OLD), not a JS date/number reconstruction.
      check('Full previous row unchanged', rows[0].previous_row, original);
      check('Deletion event timestamp present', Number.isFinite(Date.parse(rows[0].deleted_at)), true);
    });
    if (withoutAudit) continue;
    await test(profile, 'RLS hides another owner audit and rejects a cross-owner DELETE', async () => {
      check('Other user cannot read A audit', await audit(ids.b), []);
      const foreign = await insert(25, ids.b, ids.accountB);
      check('A cannot delete B movement', (await normal('authenticated', ids.a, 'DELETE FROM transactions WHERE id=$1 RETURNING id', [foreign.id])).rows, []);
      check('Cross-owner attempt produces no B audit', await audit(ids.b), []);
      check('Foreign movement intact', (await normal('authenticated', ids.b, 'SELECT id FROM transactions WHERE id=$1', [foreign.id])).rows.map(row => row.id), [foreign.id]);
      await normal('authenticated', ids.b, 'DELETE FROM transactions WHERE id=$1', [foreign.id]);
      check('A still reads only its own event', (await audit()).map(row => row.user_id), [ids.a]);
    });
    await test(profile, 'Only the internal trigger can write audit rows, including legacy defaults', async () => {
      for (const role of ['authenticated', 'service_role']) {
        await denied(role + ' cannot fabricate an event', () => normal(role, role === 'authenticated' ? ids.a : null,
          `INSERT INTO transaction_deletion_audit(transaction_id,user_id,actor_role,previous_row) VALUES($1,$2,'forged','{}')`, [randomUUID(), ids.a]));
        await denied(role + ' cannot UPDATE audit', () => normal(role, role === 'authenticated' ? ids.a : null, "UPDATE transaction_deletion_audit SET actor_role='forged'"));
        await denied(role + ' cannot DELETE audit', () => normal(role, role === 'authenticated' ? ids.a : null, 'DELETE FROM transaction_deletion_audit'));
        await denied(role + ' cannot TRUNCATE audit', () => normal(role, role === 'authenticated' ? ids.a : null, 'TRUNCATE transaction_deletion_audit'));
        await denied(role + ' cannot execute the private trigger function', () => normal(role, role === 'authenticated' ? ids.a : null, 'SELECT transaction_audit_private.record_transaction_deletion()'));
      }
      await denied('Anonymous audit read denied', () => normal('anon', null, 'SELECT * FROM transaction_deletion_audit'));
      const definition = (await db.query(`SELECT p.prosecdef,p.proconfig,
        has_function_privilege('anon',p.oid,'EXECUTE') AS anon,
        has_function_privilege('authenticated',p.oid,'EXECUTE') AS authenticated,
        has_function_privilege('service_role',p.oid,'EXECUTE') AS service_role
        FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
        WHERE n.nspname='transaction_audit_private' AND p.proname='record_transaction_deletion'`)).rows[0];
      check('Privileged function has no client EXECUTE', definition, { prosecdef: true, proconfig: ['search_path=pg_catalog, pg_temp'], anon: false, authenticated: false, service_role: false });
    });
    await test(profile, 'DELETE retry over an absent movement does not append another audit', async () => {
      const before = await audit();
      check('Repeated DELETE affects zero rows', (await normal('authenticated', ids.a, 'DELETE FROM transactions WHERE id=$1 RETURNING id', [original.id])).rows, []);
      check('Existing audit remains exact', await audit(), before);
    });
    await test(profile, 'Rolling back DELETE also rolls back its audit and balance reversal', async () => {
      const movement = await insert(70), before = await audit();
      try { await owner(async tx => { await tx.query('DELETE FROM transactions WHERE id=$1', [movement.id]); throw new Error('intentional synthetic rollback'); }); } catch (error) { assert.equal(error.message, 'intentional synthetic rollback'); }
      check('Original expense remains after rollback', (await normal('authenticated', ids.a, 'SELECT id FROM transactions WHERE id=$1', [movement.id])).rows.map(row => row.id), [movement.id]);
      check('Expense balance remains after rollback', await balance(), 9930);
      check('No rolled-back audit event persists', await audit(), before);
      await normal('authenticated', ids.a, 'DELETE FROM transactions WHERE id=$1', [movement.id]);
    });
    await test(profile, 'An audit INSERT failure aborts the whole deletion', async () => {
      const movement = await insert(40), before = await audit();
      await db.exec('ALTER TABLE transaction_deletion_audit ADD CONSTRAINT synthetic_audit_failure CHECK (false) NOT VALID');
      let code;
      try { await normal('authenticated', ids.a, 'DELETE FROM transactions WHERE id=$1', [movement.id]); } catch (error) { code = error.code; }
      check('Audit constraint failure surfaces', code, '23514');
      check('Expense balance not reversed on failure', await balance(), 9960);
      check('Original movement remains on failure', (await normal('authenticated', ids.a, 'SELECT id FROM transactions WHERE id=$1', [movement.id])).rows.map(row => row.id), [movement.id]);
      check('No audit partial effect', await audit(), before);
      await db.exec('ALTER TABLE transaction_deletion_audit DROP CONSTRAINT synthetic_audit_failure');
      await normal('authenticated', ids.a, 'DELETE FROM transactions WHERE id=$1', [movement.id]);
    });
    await test(profile, 'Backend without a session is explicit, never impersonates the owner', async () => {
      const movement = await insert(20);
      await normal('service_role', null, 'DELETE FROM transactions WHERE id=$1', [movement.id]);
      const event = (await audit()).find(row => row.transaction_id === movement.id);
      check('Backend actor remains null', event.actor_id, null);
      check('Backend role recorded', event.actor_role, 'service_role');
      check('Backend event still has the original owner', event.user_id, ids.a);
      check('Balance restored', await balance(), 10000);
    });
    await test(profile, 'Public audit types match actual PostgreSQL columns, nullability and defaults', async () => {
      const columns = (await db.query(`SELECT column_name,udt_name,is_nullable,column_default IS NOT NULL AS has_default
        FROM information_schema.columns WHERE table_schema='public' AND table_name='transaction_deletion_audit' ORDER BY column_name`)).rows;
      check('Exact audit catalog', columns, [
        { column_name: 'actor_id', udt_name: 'uuid', is_nullable: 'YES', has_default: false },
        { column_name: 'actor_role', udt_name: 'text', is_nullable: 'NO', has_default: false },
        { column_name: 'deleted_at', udt_name: 'timestamptz', is_nullable: 'NO', has_default: true },
        { column_name: 'id', udt_name: 'uuid', is_nullable: 'NO', has_default: true },
        { column_name: 'previous_row', udt_name: 'jsonb', is_nullable: 'NO', has_default: false },
        { column_name: 'transaction_id', udt_name: 'uuid', is_nullable: 'NO', has_default: false },
        { column_name: 'user_id', udt_name: 'uuid', is_nullable: 'NO', has_default: false },
      ]);
      const source = ts.createSourceFile('supabase-generated.ts', await fs.readFile(path.join(root, 'types/supabase-generated.ts'), 'utf8'), ts.ScriptTarget.Latest, true);
      const member = (node, name) => node?.members?.find(field => field.name?.getText(source).replaceAll('"', '') === name)?.type;
      const database = source.statements.find(node => ts.isTypeAliasDeclaration(node) && node.name.text === 'Database');
      const table = member(member(member(database.type, 'public'), 'Tables'), 'transaction_deletion_audit');
      const fields = name => member(table, name).members.map(field => ({ name: field.name.getText(source).replaceAll('"', ''), type: field.type.getText(source), optional: Boolean(field.questionToken) }));
      const expectedTypes = { actor_id: 'string | null', actor_role: 'string', deleted_at: 'string', id: 'string', previous_row: 'NonNullable<Json>', transaction_id: 'string', user_id: 'string' };
      for (const variant of ['Row', 'Insert', 'Update']) check(variant + ' types reflect the SQL catalog', fields(variant), columns.map(column => ({ name: column.column_name, type: expectedTypes[column.column_name], optional: variant === 'Update' || (variant === 'Insert' && (column.has_default || column.is_nullable === 'YES')) })));
      check('No FK erases audit identity', member(table, 'Relationships').getText(source), '[]');
    });
  } finally { await db.close(); }
}
report.sourceStable = (await Promise.all(sources.map(async file => digest(await fs.readFile(path.join(root, file.path))) === file.sha256))).every(Boolean);
report.passed = report.results.filter(result => result.status === 'PASS').length;
report.total = report.results.length;
report.status = report.passed === report.total && report.sourceStable ? 'PASS' : 'FAIL';
const output = process.argv.find(arg => arg.startsWith('--output='))?.slice('--output='.length);
if (output) await fs.writeFile(output, JSON.stringify(report, null, 2) + '\n');
else console.log(JSON.stringify(report, null, 2));
console.log(JSON.stringify({ status: report.status, mode: report.mode, passed: report.passed, total: report.total, sourceStable: report.sourceStable }));
if (report.status !== 'PASS') process.exitCode = 1;
