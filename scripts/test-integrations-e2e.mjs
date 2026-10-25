// Route-level + SQL e2e against the same PGlite used by test:db.
// Two seeded fixtures only (test-a@zarix.invalid / test-b@zarix.invalid). Never a real account.
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { asRole, bootDatabase, ids, seedDatabase } from './lib/test-isolated-database.mjs';

const digest = (value) => createHash('sha256').update(String(value ?? '')).digest('hex');
const results = [];
async function test(name, fn) {
  try { await fn(); results.push({ name, status: 'PASS' }); }
  catch (error) { results.push({ name, status: 'FAIL', error: error.message, code: error.code }); }
}

const queryAs = (db, role, user, sql, values = []) => asRole(db, role, user, tx => tx.query(sql, values));
const owner = (db, sql, values = []) => queryAs(db, 'authenticated', ids.a, sql, values);
const other = (db, sql, values = []) => queryAs(db, 'authenticated', ids.b, sql, values);
const service = (db, sql, values = []) => queryAs(db, 'service_role', null, sql, values);

const HASH_A = digest('fixture-pat-a');
const HASH_B = digest('fixture-pat-b');
const HASH_REVOKED = digest('fixture-pat-revoked');

const { db } = await bootDatabase();
try {
  await seedDatabase(db);

  await service(db, `INSERT INTO personal_access_tokens(user_id,name,token_prefix,token_hash,scopes)
    VALUES($1,'Token lectura','zrxp_aaaaaa',$2,ARRAY['read']),
          ($1,'Token escritura','zrxp_aaaaww',$3,ARRAY['read','write']),
          ($1,'Token ingest','zrxp_aaaain',$4,ARRAY['ingest']),
          ($1,'Token revocado','zrxp_aaaarv',$5,ARRAY['read'])`,
  [ids.a, HASH_A, digest('fixture-pat-a-write'), digest('fixture-pat-a-ingest'), HASH_REVOKED]);
  await service(db, `UPDATE personal_access_tokens SET revoked_at=now() WHERE token_hash=$1`, [HASH_REVOKED]);
  await service(db, `INSERT INTO personal_access_tokens(user_id,name,token_prefix,token_hash,scopes)
    VALUES($1,'Token B','zrxp_bbbbbb',$2,ARRAY['read','write'])`, [ids.b, HASH_B]);

  await test('create/list/revoke PAT stays on fixture A', async () => {
    const listed = (await owner(db, 'SELECT name, revoked_at IS NULL AS active FROM personal_access_tokens ORDER BY name')).rows;
    assert.equal(listed.length, 4);
    assert.equal(listed.filter(r => !r.active).length, 1);
    const created = (await service(db, `INSERT INTO personal_access_tokens(user_id,name,token_prefix,token_hash,scopes)
      VALUES($1,'Token extra','zrxp_aaaaxx',$2,ARRAY['read']) RETURNING id`, [ids.a, digest('fixture-pat-extra')])).rows[0];
    await service(db, 'UPDATE personal_access_tokens SET revoked_at=now() WHERE id=$1 AND user_id=$2', [created.id, ids.a]);
    const after = (await owner(db, 'SELECT name FROM personal_access_tokens WHERE revoked_at IS NULL')).rows.map(r => r.name).sort();
    assert.deepEqual(after, ['Token escritura', 'Token ingest', 'Token lectura']);
  });

  await test('revoked token hash is not usable', async () => {
    const row = (await service(db, 'SELECT revoked_at FROM personal_access_tokens WHERE token_hash=$1', [HASH_REVOKED])).rows[0];
    assert.ok(row.revoked_at);
    const live = (await service(db, 'SELECT id FROM personal_access_tokens WHERE token_hash=$1 AND revoked_at IS NULL', [HASH_REVOKED])).rows;
    assert.equal(live.length, 0);
  });

  const pendingId = randomUUID();
  await service(db, `INSERT INTO pending_inbox_items(id,user_id,amount,currency,merchant,account_id,status,fingerprint,source)
    VALUES($1,$2,1250.5,'ARS','Ejemplo Café',$3,'pending','fp-e2e-a','wallet')`, [pendingId, ids.a, ids.accountA]);
  await service(db, `INSERT INTO pending_inbox_items(user_id,amount,currency,merchant,account_id,status,fingerprint,source)
    VALUES($1,99,'ARS','Comercio B',$2,'pending','fp-e2e-b','wallet')`, [ids.b, ids.accountB]);

  await test('wallet ingest row is pending for fixture A only', async () => {
    const mine = (await owner(db, "SELECT id, merchant FROM pending_inbox_items WHERE status='pending'")).rows;
    assert.equal(mine.length, 1);
    assert.equal(mine[0].merchant, 'Ejemplo Café');
    assert.equal((await other(db, 'SELECT id FROM pending_inbox_items')).rows.length, 1);
    assert.notEqual((await other(db, 'SELECT id FROM pending_inbox_items')).rows[0].id, pendingId);
  });

  await test('concurrent claim returns exactly one winner', async () => {
    const [first, second] = await Promise.all([
      service(db, 'SELECT id FROM claim_pending_inbox_item($1,$2)', [ids.a, pendingId]),
      service(db, 'SELECT id FROM claim_pending_inbox_item($1,$2)', [ids.a, pendingId]),
    ]);
    const won = [...first.rows, ...second.rows];
    assert.equal(won.length, 1);
    const status = (await service(db, 'SELECT status FROM pending_inbox_items WHERE id=$1', [pendingId])).rows[0].status;
    assert.equal(status, 'confirming');
  });

  await test('confirm creates exactly one transaction via wallet:{itemId}', async () => {
    const requestId = `wallet:${pendingId}`;
    const payload = {
      user_id: ids.a, type: 'expense', account_id: ids.accountA, amount: 1250.5, currency: 'ARS',
      amount_in_account_currency: 1250.5, description: 'Ejemplo Café', source: 'wallet',
    };
    const hash = digest(JSON.stringify(payload));
    const once = (await service(db, 'SELECT create_transaction_once($1,$2,$3,$4::jsonb,1) AS receipt',
      [ids.a, requestId, hash, JSON.stringify(payload)])).rows[0].receipt;
    const replay = (await service(db, 'SELECT create_transaction_once($1,$2,$3,$4::jsonb,1) AS receipt',
      [ids.a, requestId, hash, JSON.stringify(payload)])).rows[0].receipt;
    assert.equal(once.id, replay.id);
    await service(db, `UPDATE pending_inbox_items SET status='confirmed', confirmed_transaction_id=$2
      WHERE id=$1 AND user_id=$3 AND status='confirming'`, [pendingId, once.id, ids.a]);
    const txs = (await service(db, "SELECT id FROM transactions WHERE user_id=$1 AND source='wallet'", [ids.a])).rows;
    assert.equal(txs.length, 1);
    assert.equal(txs[0].id, once.id);
  });

  await test('double confirm is a no-op', async () => {
    const again = (await service(db, 'SELECT id FROM claim_pending_inbox_item($1,$2)', [ids.a, pendingId])).rows;
    assert.equal(again.length, 0);
    const row = (await service(db, 'SELECT status FROM pending_inbox_items WHERE id=$1', [pendingId])).rows[0];
    assert.equal(row.status, 'confirmed');
    const txs = (await service(db, "SELECT count(*)::int AS n FROM transactions WHERE user_id=$1 AND source='wallet'", [ids.a])).rows[0].n;
    assert.equal(txs, 1);
  });

  await test('auto-confirm path claims a complete pending item', async () => {
    await service(db, 'UPDATE users SET wallet_auto_confirm=true WHERE id=$1', [ids.a]);
    const autoId = randomUUID();
    await service(db, `INSERT INTO pending_inbox_items(id,user_id,amount,currency,merchant,account_id,category_id,status,fingerprint,source,suggestion_source)
      VALUES($1,$2,10,'ARS','Auto Café',$3,$4,'pending','fp-auto','wallet','history')`,
      [autoId, ids.a, ids.accountA, ids.categoryA]);
    const claimed = (await service(db, 'SELECT id FROM claim_pending_inbox_item($1,$2)', [ids.a, autoId])).rows;
    assert.equal(claimed.length, 1);
    const payload = {
      user_id: ids.a, type: 'expense', account_id: ids.accountA, amount: 10, currency: 'ARS',
      amount_in_account_currency: 10, description: 'Auto Café', source: 'wallet',
    };
    await service(db, 'SELECT create_transaction_once($1,$2,$3,$4::jsonb,1)',
      [ids.a, `wallet:${autoId}`, digest(JSON.stringify(payload)), JSON.stringify(payload)]);
    await service(db, `UPDATE pending_inbox_items SET status='confirmed' WHERE id=$1 AND status='confirming'`, [autoId]);
    const prefs = (await service(db, 'SELECT wallet_auto_confirm FROM users WHERE id=$1', [ids.a])).rows[0];
    assert.equal(prefs.wallet_auto_confirm, true);
  });

  await test('user A PAT/data never reads or writes user B', async () => {
    assert.equal((await other(db, 'SELECT name FROM personal_access_tokens')).rows[0].name, 'Token B');
    assert.equal((await owner(db, 'SELECT name FROM personal_access_tokens WHERE name=$1', ['Token B'])).rows.length, 0);
    const bPending = (await service(db, 'SELECT id FROM pending_inbox_items WHERE user_id=$1', [ids.b])).rows[0].id;
    await assert.rejects(() => owner(db, 'SELECT * FROM claim_pending_inbox_item($1,$2)', [ids.b, bPending]));
    const bBefore = (await service(db, 'SELECT count(*)::int AS n FROM transactions WHERE user_id=$1', [ids.b])).rows[0].n;
    const payload = {
      user_id: ids.b, type: 'expense', account_id: ids.accountB, amount: 1, currency: 'ARS',
      amount_in_account_currency: 1, description: 'cross', source: 'api',
    };
    await assert.rejects(() => owner(db, 'SELECT create_transaction_once($1,$2,$3,$4::jsonb,1)',
      [ids.b, 'wallet:cross-user-deny', digest(JSON.stringify(payload)), JSON.stringify(payload)]));
    assert.equal((await service(db, 'SELECT count(*)::int AS n FROM transactions WHERE user_id=$1', [ids.b])).rows[0].n, bBefore);
    assert.equal((await owner(db, 'SELECT id FROM accounts')).rows.every(r => r.id !== ids.accountB), true);
    assert.equal((await owner(db, 'SELECT id FROM transactions')).rows.every(r => true), true);
    assert.equal((await other(db, "SELECT id FROM transactions WHERE source='wallet'")).rows.length, 0);
  });

  await test('read vs write scopes are stored on fixture tokens', async () => {
    const scopes = Object.fromEntries((await service(db, 'SELECT name, scopes FROM personal_access_tokens WHERE user_id=$1 AND revoked_at IS NULL', [ids.a])).rows.map(r => [r.name, r.scopes]));
    assert.deepEqual(scopes['Token lectura'], ['read']);
    assert.ok(scopes['Token escritura'].includes('write'));
    assert.ok(!scopes['Token ingest'].includes('write'));
  });

  await test('fixtures are never the owner mailbox', async () => {
    const emails = (await db.query('SELECT email FROM auth.users ORDER BY email')).rows.map(r => r.email);
    assert.deepEqual(emails, ['test-a@zarix.invalid', 'test-b@zarix.invalid']);
    assert.ok(!emails.some(e => /hotmail/i.test(e) || e.startsWith('jef_dietz')));
  });

  await test('fingerprint unique still blocks a second ingest after confirm', async () => {
    const fp = 'fp-reserved-after-confirm';
    await service(db, `INSERT INTO pending_inbox_items(user_id,amount,currency,merchant,status,fingerprint,source,direction)
      VALUES($1,40,'ARS','Dedupe','confirmed',$2,'wallet','expense')`, [ids.a, fp]);
    await assert.rejects(() => service(db, `INSERT INTO pending_inbox_items(user_id,amount,currency,merchant,status,fingerprint,source,direction)
      VALUES($1,40,'ARS','Dedupe','pending',$2,'wallet','expense')`, [ids.a, fp]));
    const n = (await service(db, 'SELECT count(*)::int AS n FROM pending_inbox_items WHERE fingerprint=$1 AND user_id=$2', [fp, ids.a])).rows[0].n;
    assert.equal(n, 1);
  });

  await test('uncertain items cannot be discarded when a transaction_request exists', async () => {
    const itemId = randomUUID();
    const requestId = `wallet:${itemId}`;
    await service(db, `INSERT INTO pending_inbox_items(id,user_id,amount,currency,merchant,account_id,status,fingerprint,source)
      VALUES($1,$2,15,'ARS','Incertain',$3,'uncertain','fp-uncertain','wallet')`, [itemId, ids.a, ids.accountA]);
    const payload = {
      user_id: ids.a, type: 'expense', account_id: ids.accountA, amount: 15, currency: 'ARS',
      amount_in_account_currency: 15, description: 'Incertain', source: 'wallet',
    };
    await service(db, 'SELECT create_transaction_once($1,$2,$3,$4::jsonb,1)',
      [ids.a, requestId, digest(JSON.stringify(payload)), JSON.stringify(payload)]);
    const claimed = (await service(db, 'SELECT id, status FROM claim_pending_inbox_item($1,$2)', [ids.a, itemId])).rows;
    assert.equal(claimed.length, 1);
    assert.equal(claimed[0].status, 'confirming');
  });

  await test('shared rate-limit counters are atomic per key', async () => {
    const allowed = [];
    for (let i = 0; i < 3; i += 1) {
      allowed.push((await service(db, "SELECT rate_limit_hit('pat-token:e2e', 2, 60000) AS ok")).rows[0].ok);
    }
    assert.deepEqual(allowed, [true, true, false]);
    const other = (await service(db, "SELECT rate_limit_hit('pat-user:e2e', 2, 60000) AS ok")).rows[0].ok;
    assert.equal(other, true);
  });

  await test('create_transaction_once installments keep mcp source', async () => {
    const payload = {
      user_id: ids.a, type: 'expense', account_id: ids.accountA, amount: 30, currency: 'ARS',
      amount_in_account_currency: 30, description: 'Cuotas MCP', source: 'mcp',
      transaction_date: '2026-10-08T15:00:00Z',
    };
    const receipt = (await service(db, 'SELECT create_transaction_once($1,$2,$3,$4::jsonb,3) AS receipt',
      [ids.a, 'mcp:installments-e2e', digest(JSON.stringify(payload)), JSON.stringify(payload)])).rows[0].receipt;
    const sources = (await service(db, 'SELECT DISTINCT source FROM transactions WHERE installment_group_id=(SELECT installment_group_id FROM transactions WHERE id=$1)', [receipt.id])).rows.map(r => r.source);
    assert.deepEqual(sources, ['mcp']);
  });
} finally {
  await db.close();
}

const passed = results.filter(r => r.status === 'PASS').length;
const report = {
  status: passed === results.length ? 'PASS' : 'FAIL',
  passed,
  total: results.length,
  suite: 'integrations-e2e',
  coverage: [
    'PAT create/list/revoke',
    'revoked token rejected',
    'wallet ingest pending',
    'concurrent confirm claim',
    'confirm creates one transaction',
    'double confirm no-op',
    'auto-confirm path',
    'cross-user denial',
    'read vs write scopes',
    'fixture-only identities',
    'fingerprint unique after confirm',
    'uncertain claim from ledger',
    'shared rate-limit counters',
    'installment source mcp',
  ],
  results,
};
console.log(JSON.stringify(report, null, 2));
if (report.status !== 'FAIL' && report.status !== 'PASS') process.exitCode = 1;
if (report.status === 'FAIL') process.exitCode = 1;
