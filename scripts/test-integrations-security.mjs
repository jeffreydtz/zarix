// Isolated PGlite only. Synthetic fixture users, never a real account.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { asRole, bootDatabase, ids, seedDatabase } from './lib/test-isolated-database.mjs';
const digest = (value) => createHash('sha256').update(String(value ?? '')).digest('hex');

const results = [];
async function test(name, fn) {
  try { await fn(); results.push({ name, status: 'PASS' }); }
  catch (error) { results.push({ name, status: 'FAIL', error: error.message, code: error.code }); }
}
async function rejects(fn, codes = ['42501']) {
  let error;
  try { await fn(); } catch (e) { error = e; }
  assert.ok(error, 'Expected rejection');
  assert.ok(codes.includes(error.code), `Expected ${codes.join('/')} got ${error.code}: ${error.message}`);
}
const queryAs = (db, role, user, sql, values = []) => asRole(db, role, user, tx => tx.query(sql, values));
const owner = (db, sql, values = []) => queryAs(db, 'authenticated', ids.a, sql, values);
const other = (db, sql, values = []) => queryAs(db, 'authenticated', ids.b, sql, values);
const service = (db, sql, values = []) => queryAs(db, 'service_role', null, sql, values);

const SYNTHETIC_GEMINI = 'synthetic-gemini-key-not-real';
const SYNTHETIC_BOT = 'synthetic-bot-token-not-real';

const { db } = await bootDatabase();
try {
  await seedDatabase(db);

  await test('vault helpers fail closed without vault and never keep a plaintext backup table', async () => {
    await db.query('UPDATE users SET gemini_api_key=$2, telegram_bot_token=$3 WHERE id=$1', [ids.a, SYNTHETIC_GEMINI, SYNTHETIC_BOT]);
    await assert.rejects(() => db.query('SELECT zarix_vault.vault_available() AS v'));
    await assert.rejects(() => db.query('SELECT zarix_vault.store_user_secret($1,$2,$3)', [ids.a, 'gemini_api_key', SYNTHETIC_GEMINI]));
    const backup = await db.query("SELECT 1 FROM information_schema.tables WHERE table_schema='zarix_vault' AND table_name='user_secret_backup'");
    assert.equal(backup.rows.length, 0);
    const src = (await db.query("SELECT pg_get_functiondef(oid) AS def FROM pg_proc WHERE proname IN ('store_user_secret','read_user_secret')")).rows.map(r => r.def).join('\n');
    assert.equal(src.includes('envelope:v0'), false);
    assert.equal(src.includes('zarix-pglite-synthetic-key-not-for-production'), false);
    const still = (await db.query('SELECT gemini_api_key FROM users WHERE id=$1', [ids.a])).rows[0];
    assert.equal(digest(still.gemini_api_key), digest(SYNTHETIC_GEMINI));
    const leaked = JSON.stringify(results).includes(SYNTHETIC_GEMINI) || JSON.stringify(results).includes(SYNTHETIC_BOT);
    assert.equal(leaked, false);
  });

  await test('decrypt lives outside public and execute is revoked', async () => {
    const pub = await db.query("SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='decrypt_user_secret'");
    assert.equal(pub.rows.length, 0);
  });

  await service(db, "INSERT INTO personal_access_tokens(user_id,name,token_prefix,token_hash,scopes) VALUES($1,'Token A','zrxp_aaaaaa','bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',ARRAY['read','ingest'])", [ids.a]);
  await service(db, "INSERT INTO personal_access_tokens(user_id,name,token_prefix,token_hash,scopes) VALUES($1,'Token B','zrxp_bbbbbb','cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',ARRAY['read'])", [ids.b]);
  await service(db, "INSERT INTO pending_inbox_items(user_id,amount,currency,merchant,status,fingerprint,source) VALUES($1,10,'ARS','Sintético A','pending','fp-a','wallet')", [ids.a]);
  await service(db, "INSERT INTO pending_inbox_items(user_id,amount,currency,merchant,status,fingerprint,source) VALUES($1,11,'ARS','Sintético B','pending','fp-b','wallet')", [ids.b]);
  await service(db, "INSERT INTO wallet_card_account_maps(user_id,card_name_normalized,account_id) VALUES($1,'visa a',$2)", [ids.a, ids.accountA]);
  await service(db, "INSERT INTO integration_audit_log(user_id,action,source) VALUES($1,'token.create','web')", [ids.a]);

  await test('owner lists only own tokens without hash column', async () => {
    const rows = (await owner(db, 'SELECT id, name, token_prefix FROM personal_access_tokens ORDER BY name')).rows;
    assert.deepEqual(rows.map(r => r.name), ['Token A']);
    await rejects(() => owner(db, 'SELECT token_hash FROM personal_access_tokens'));
  });

  await test('other tenant cannot read or revoke A tokens', async () => {
    assert.equal((await other(db, 'SELECT id FROM personal_access_tokens')).rows.length, 1);
    await rejects(() => other(db, "UPDATE personal_access_tokens SET revoked_at=now() WHERE user_id=$1 RETURNING id", [ids.a]));
  });

  await test('authenticated cannot insert tokens or audit rows', async () => {
    await rejects(() => owner(db, "INSERT INTO personal_access_tokens(user_id,name,token_prefix,token_hash,scopes) VALUES($1,'Token X','zrxp_xxxxxx','dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',ARRAY['read'])", [ids.a]));
    await rejects(() => owner(db, "INSERT INTO integration_audit_log(user_id,action,source) VALUES($1,'token.create','web')", [ids.a]));
  });

  await test('pending inbox and card maps are owner scoped', async () => {
    assert.deepEqual((await owner(db, 'SELECT merchant FROM pending_inbox_items')).rows.map(r => r.merchant), ['Sintético A']);
    assert.equal((await other(db, "UPDATE pending_inbox_items SET merchant='no' WHERE user_id=$1 RETURNING id", [ids.a])).rows.length, 0);
    assert.equal((await other(db, 'SELECT card_name_normalized FROM wallet_card_account_maps')).rows.length, 0);
  });

  await test('audit is readable by owner and not writable', async () => {
    assert.equal((await owner(db, 'SELECT action FROM integration_audit_log')).rows.length, 1);
    assert.equal((await other(db, 'SELECT action FROM integration_audit_log')).rows.length, 0);
    await rejects(() => owner(db, 'DELETE FROM integration_audit_log'));
  });

  await test('anon cannot read new integration tables', async () => {
    for (const table of ['personal_access_tokens', 'pending_inbox_items', 'wallet_card_account_maps', 'integration_audit_log']) {
      await rejects(() => queryAs(db, 'anon', null, `SELECT * FROM ${table}`));
    }
  });

  await test('secret functions are not executable by clients', async () => {
    await rejects(() => owner(db, "SELECT zarix_vault.encrypt_secret('x')"));
    await rejects(() => queryAs(db, 'anon', null, "SELECT zarix_vault.decrypt_secret('x')"));
    await rejects(() => owner(db, "SELECT public.zarix_vault_read($1,'gemini_api_key')", [ids.a]));
    await rejects(() => owner(db, "SELECT zarix_vault.read_user_secret($1,'gemini_api_key')", [ids.a]));
  });

  await test('authenticated cannot write secret columns', async () => {
    await rejects(() => owner(db, "UPDATE users SET gemini_api_key='x' WHERE id=$1", [ids.a]));
    await rejects(() => owner(db, "UPDATE users SET telegram_bot_token='x' WHERE id=$1", [ids.a]));
    await rejects(() => owner(db, "UPDATE users SET gemini_api_key_enc='x' WHERE id=$1", [ids.a]));
  });

  await test('concurrent pending confirm claims exactly once', async () => {
    const item = (await service(db, "SELECT id FROM pending_inbox_items WHERE user_id=$1 AND merchant='Sintético A'", [ids.a])).rows[0];
    const [a, b] = await Promise.all([
      service(db, 'SELECT id FROM claim_pending_inbox_item($1,$2)', [ids.a, item.id]),
      service(db, 'SELECT id FROM claim_pending_inbox_item($1,$2)', [ids.a, item.id]),
    ]);
    assert.equal(a.rows.length + b.rows.length, 1);
    const status = (await service(db, 'SELECT status FROM pending_inbox_items WHERE id=$1', [item.id])).rows[0].status;
    assert.equal(status, 'confirming');
    const second = (await service(db, 'SELECT id FROM claim_pending_inbox_item($1,$2)', [ids.a, item.id])).rows;
    assert.equal(second.length, 0);
  });
} finally {
  await db.close();
}

const passed = results.filter(r => r.status === 'PASS').length;
const report = { status: passed === results.length ? 'PASS' : 'FAIL', passed, total: results.length, results };
console.log(JSON.stringify(report, null, 2));
if (report.status !== 'PASS') process.exitCode = 1;
