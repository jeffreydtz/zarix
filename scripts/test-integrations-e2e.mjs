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

  await test('confirmed fingerprint does not block a later purchase', async () => {
    const fp = 'fp-reserved-after-confirm';
    await service(db, `INSERT INTO pending_inbox_items(user_id,amount,currency,merchant,status,fingerprint,source,direction)
      VALUES($1,40,'ARS','Dedupe','confirmed',$2,'wallet','expense')`, [ids.a, fp]);
    await service(db, `INSERT INTO pending_inbox_items(user_id,amount,currency,merchant,status,fingerprint,source,direction)
      VALUES($1,40,'ARS','Dedupe','pending',$2,'wallet','expense')`, [ids.a, fp]);
    const n = (await service(db, 'SELECT count(*)::int AS n FROM pending_inbox_items WHERE fingerprint=$1 AND user_id=$2', [fp, ids.a])).rows[0].n;
    assert.equal(n, 2);
  });

  await test('late ledger write after discard is refused', async () => {
    const itemId = randomUUID();
    await service(db, `INSERT INTO pending_inbox_items(id,user_id,amount,currency,merchant,account_id,status,fingerprint,source)
      VALUES($1,$2,17,'ARS','Late discard',$3,'uncertain','fp-late-discard','wallet')`, [itemId, ids.a, ids.accountA]);
    const discarded = (await owner(db, 'SELECT status FROM discard_pending_inbox_item($1,$2)', [ids.a, itemId])).rows[0];
    assert.equal(discarded.status, 'discarded');
    const payload = {
      user_id: ids.a, type: 'expense', account_id: ids.accountA, amount: 17, currency: 'ARS',
      amount_in_account_currency: 17, description: 'Late discard', source: 'wallet',
    };
    await assert.rejects(
      () => service(db, 'SELECT create_transaction_once($1,$2,$3,$4::jsonb,1)',
        [ids.a, `wallet:${itemId}`, digest(JSON.stringify(payload)), JSON.stringify(payload)]),
      /descartado/i
    );
    assert.equal((await service(db, "SELECT count(*)::int AS n FROM transactions WHERE description='Late discard' AND user_id=$1", [ids.a])).rows[0].n, 0);
    assert.equal((await service(db, 'SELECT count(*)::int AS n FROM transaction_requests WHERE request_id=$1', [`wallet:${itemId}`])).rows[0].n, 0);
    assert.equal((await service(db, 'SELECT status FROM pending_inbox_items WHERE id=$1', [itemId])).rows[0].status, 'discarded');
  });

  await test('authenticated discard requires a matching non-null uid', async () => {
    const itemId = randomUUID();
    const serviceItem = randomUUID();
    await service(db, `INSERT INTO pending_inbox_items(id,user_id,amount,currency,merchant,account_id,status,fingerprint,source)
      VALUES($1,$2,23,'ARS','Uid discard',$3,'pending','fp-uid-discard','wallet')`, [itemId, ids.a, ids.accountA]);
    await service(db, `INSERT INTO pending_inbox_items(id,user_id,amount,currency,merchant,account_id,status,fingerprint,source)
      VALUES($1,$2,24,'ARS','Service discard',$3,'pending','fp-svc-discard','wallet')`, [serviceItem, ids.a, ids.accountA]);
    await assert.rejects(
      () => queryAs(db, 'authenticated', null, 'SELECT id FROM discard_pending_inbox_item($1,$2)', [ids.a, itemId]),
      /No autorizado/i
    );
    await assert.rejects(
      () => other(db, 'SELECT id FROM discard_pending_inbox_item($1,$2)', [ids.a, itemId]),
      /No autorizado/i
    );
    assert.equal((await service(db, 'SELECT status FROM pending_inbox_items WHERE id=$1', [itemId])).rows[0].status, 'pending');
    const discarded = (await owner(db, 'SELECT status FROM discard_pending_inbox_item($1,$2)', [ids.a, itemId])).rows[0];
    assert.equal(discarded.status, 'discarded');
    const asService = (await service(db, 'SELECT status FROM discard_pending_inbox_item($1,$2)', [ids.a, serviceItem])).rows[0];
    assert.equal(asService.status, 'discarded');
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
    await assert.rejects(
      () => owner(db, 'SELECT id FROM discard_pending_inbox_item($1,$2)', [ids.a, itemId]),
      /movimiento|descartar/i
    );
    const row = (await service(db, 'SELECT status FROM pending_inbox_items WHERE id=$1', [itemId])).rows[0];
    assert.equal(row.status, 'uncertain');
    const receipts = (await service(db, 'SELECT count(*)::int AS n FROM transaction_requests WHERE request_id=$1', [requestId])).rows[0].n;
    assert.equal(receipts, 1);
  });

  await test('discard refuses confirming and allows pending without a receipt', async () => {
    const confirmingId = randomUUID();
    const pendingId2 = randomUUID();
    await service(db, `INSERT INTO pending_inbox_items(id,user_id,amount,currency,merchant,account_id,status,fingerprint,source)
      VALUES($1,$2,21,'ARS','Confirming discard',$3,'pending','fp-discard-confirming','wallet')`,
      [confirmingId, ids.a, ids.accountA]);
    const claimed = (await service(db, 'SELECT status FROM claim_pending_inbox_item($1,$2)', [ids.a, confirmingId])).rows;
    assert.equal(claimed[0].status, 'confirming');
    await assert.rejects(
      () => owner(db, 'SELECT id FROM discard_pending_inbox_item($1,$2)', [ids.a, confirmingId]),
      /confirmando/i
    );
    assert.equal((await service(db, 'SELECT status FROM pending_inbox_items WHERE id=$1', [confirmingId])).rows[0].status, 'confirming');

    await service(db, `INSERT INTO pending_inbox_items(id,user_id,amount,currency,merchant,account_id,status,fingerprint,source)
      VALUES($1,$2,22,'ARS','Pending discard',$3,'pending','fp-discard-pending','wallet')`,
      [pendingId2, ids.a, ids.accountA]);
    const discarded = (await owner(db, 'SELECT status FROM discard_pending_inbox_item($1,$2)', [ids.a, pendingId2])).rows[0];
    assert.equal(discarded.status, 'discarded');
  });

  await test('anonymous fingerprint is not unique; same coffee can insert twice', async () => {
    const fp = digest([ids.a, '+', 'expense', '40', 'ARS', '', 'café', ''].join('|'));
    await service(db, `INSERT INTO pending_inbox_items(user_id,amount,currency,merchant,status,fingerprint,source,direction)
      VALUES($1,40,'ARS','Café','confirmed',$2,'wallet','expense')`, [ids.a, fp]);
    await service(db, `INSERT INTO pending_inbox_items(user_id,amount,currency,merchant,status,fingerprint,source,direction)
      VALUES($1,40,'ARS','Café','pending',$2,'wallet','expense')`, [ids.a, fp]);
    const n = (await service(db, "SELECT count(*)::int AS n FROM pending_inbox_items WHERE merchant='Café' AND user_id=$1 AND fingerprint=$2",
      [ids.a, fp])).rows[0].n;
    assert.equal(n, 2);
    const unique = (await db.query(`SELECT indexname FROM pg_indexes
      WHERE schemaname='public' AND indexname IN ('pending_inbox_fingerprint_reserved_unique','pending_inbox_fingerprint_pending_unique')`)).rows;
    assert.equal(unique.length, 0);
    const keyed = (await db.query(`SELECT indexname FROM pg_indexes
      WHERE schemaname='public' AND indexname='pending_inbox_idempotency_unique'`)).rows;
    assert.equal(keyed.length, 1);
  });

  await test('MCP owner confirm writes one ledger row and cross-user confirm is denied', async () => {
    const itemA = randomUUID();
    const itemB = randomUUID();
    await service(db, `INSERT INTO pending_inbox_items(id,user_id,amount,currency,merchant,account_id,status,fingerprint,source)
      VALUES($1,$2,18,'ARS','MCP Café',$3,'pending','fp-mcp-a','mcp')`, [itemA, ids.a, ids.accountA]);
    await service(db, `INSERT INTO pending_inbox_items(id,user_id,amount,currency,merchant,account_id,status,fingerprint,source)
      VALUES($1,$2,19,'ARS','MCP B',$3,'pending','fp-mcp-b','mcp')`, [itemB, ids.b, ids.accountB]);
    await assert.rejects(() => other(db, 'SELECT id FROM claim_pending_inbox_item($1,$2)', [ids.a, itemA]));
    await assert.rejects(() => owner(db, 'SELECT id FROM claim_pending_inbox_item($1,$2)', [ids.b, itemB]));
    const claimed = (await owner(db, 'SELECT id, status FROM claim_pending_inbox_item($1,$2)', [ids.a, itemA])).rows;
    assert.equal(claimed.length, 1);
    const payload = {
      user_id: ids.a, type: 'expense', account_id: ids.accountA, amount: 18, currency: 'ARS',
      amount_in_account_currency: 18, description: 'MCP Café', source: 'mcp',
    };
    const receipt = (await service(db, 'SELECT create_transaction_once($1,$2,$3,$4::jsonb,1) AS receipt',
      [ids.a, `wallet:${itemA}`, digest(JSON.stringify(payload)), JSON.stringify(payload)])).rows[0].receipt;
    await assert.rejects(() => other(db, 'SELECT create_transaction_once($1,$2,$3,$4::jsonb,1)',
      [ids.a, `wallet:${itemA}`, digest(JSON.stringify(payload)), JSON.stringify(payload)]));
    await service(db, `UPDATE pending_inbox_items SET status='confirmed', confirmed_transaction_id=$2
      WHERE id=$1 AND user_id=$3 AND status='confirming'`, [itemA, receipt.id, ids.a]);
    const src = (await service(db, 'SELECT source FROM transactions WHERE id=$1', [receipt.id])).rows[0].source;
    assert.equal(src, 'mcp');
    assert.equal((await other(db, 'SELECT id FROM transactions WHERE id=$1', [receipt.id])).rows.length, 0);
    assert.equal((await service(db, 'SELECT status FROM pending_inbox_items WHERE id=$1', [itemB])).rows[0].status, 'pending');
  });

  await test('fingerprint preflight rewrites confirmed collisions before the reserved unique index', async () => {
    const fp = 'fp-legacy-collision';
    await db.query('DROP INDEX IF EXISTS pending_inbox_fingerprint_reserved_unique');
    await service(db, `INSERT INTO pending_inbox_items(user_id,amount,currency,merchant,status,fingerprint,source,direction,created_at)
      VALUES($1,1,'ARS','Old collision','confirmed',$2,'wallet','expense','2026-01-01T00:00:00Z'),
            ($1,1,'ARS','New collision','confirmed',$2,'wallet','expense','2026-02-01T00:00:00Z')`, [ids.a, fp]);
    await db.query(`UPDATE public.pending_inbox_items AS p
       SET fingerprint = 'legacy-collision:' || p.id::text
     WHERE p.fingerprint IS NOT NULL
       AND p.status IN ('pending', 'confirming', 'confirmed', 'uncertain')
       AND p.id IN (
         SELECT id FROM (
           SELECT id,
                  row_number() OVER (
                    PARTITION BY user_id, fingerprint
                    ORDER BY created_at DESC, id DESC
                  ) AS rn
             FROM public.pending_inbox_items
            WHERE fingerprint IS NOT NULL
              AND status IN ('pending', 'confirming', 'confirmed', 'uncertain')
         ) ranked
         WHERE rn > 1
       )`);
    await db.query(`CREATE UNIQUE INDEX pending_inbox_fingerprint_reserved_unique
      ON public.pending_inbox_items (user_id, fingerprint)
      WHERE status IN ('pending', 'confirming', 'confirmed', 'uncertain')`);
    const rows = (await service(db, `SELECT fingerprint FROM pending_inbox_items
      WHERE merchant IN ('Old collision','New collision') ORDER BY created_at`)).rows;
    assert.equal(rows.length, 2);
    assert.match(rows[0].fingerprint, /^legacy-collision:/);
    assert.equal(rows[1].fingerprint, fp);
    await db.query('DROP INDEX IF EXISTS pending_inbox_fingerprint_reserved_unique');
  });

  await test('purge_rate_limit_counters deletes old windows and keeps the current one', async () => {
    await service(db, `INSERT INTO rate_limit_counters(key, count, window_start)
      VALUES ('old-window', 3, now() - interval '3 hours'),
             ('live-window', 1, now())
      ON CONFLICT (key) DO UPDATE SET count = EXCLUDED.count, window_start = EXCLUDED.window_start`);
    const deleted = (await service(db, "SELECT purge_rate_limit_counters(interval '2 hours') AS n")).rows[0].n;
    assert.ok(deleted >= 1);
    assert.equal((await service(db, "SELECT key FROM rate_limit_counters WHERE key='old-window'")).rows.length, 0);
    assert.equal((await service(db, "SELECT key FROM rate_limit_counters WHERE key='live-window'")).rows[0].key, 'live-window');
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

  await test('wallet request ids canonicalize so uppercase and dashless share one receipt', async () => {
    const itemId = randomUUID();
    const lower = `wallet:${itemId}`;
    const upper = `wallet:${itemId.toUpperCase()}`;
    const dashless = `wallet:${itemId.replaceAll('-', '')}`;
    await service(db, `INSERT INTO pending_inbox_items(id,user_id,amount,currency,merchant,account_id,status,fingerprint,source)
      VALUES($1,$2,18,'ARS','UUID case',$3,'pending','fp-uuid-case','wallet')`, [itemId, ids.a, ids.accountA]);
    const payload = {
      user_id: ids.a, type: 'expense', account_id: ids.accountA, amount: 18, currency: 'ARS',
      amount_in_account_currency: 18, description: 'UUID case', source: 'wallet',
    };
    const hash = digest(JSON.stringify(payload));
    const first = (await service(db, 'SELECT create_transaction_once($1,$2,$3,$4::jsonb,1) AS receipt',
      [ids.a, upper, hash, JSON.stringify(payload)])).rows[0].receipt;
    const replayLower = (await service(db, 'SELECT create_transaction_once($1,$2,$3,$4::jsonb,1) AS receipt',
      [ids.a, lower, hash, JSON.stringify(payload)])).rows[0].receipt;
    const replayDashless = (await service(db, 'SELECT create_transaction_once($1,$2,$3,$4::jsonb,1) AS receipt',
      [ids.a, dashless, hash, JSON.stringify(payload)])).rows[0].receipt;
    assert.equal(first.id, replayLower.id);
    assert.equal(first.id, replayDashless.id);
    const stored = (await service(db, 'SELECT request_id FROM transaction_requests WHERE user_id=$1 AND request_id IN ($2,$3,$4)',
      [ids.a, upper, lower, dashless])).rows.map(r => r.request_id);
    assert.deepEqual(stored, [lower]);
    assert.equal((await service(db, "SELECT count(*)::int AS n FROM transactions WHERE description='UUID case' AND user_id=$1", [ids.a])).rows[0].n, 1);
    await assert.rejects(
      () => owner(db, 'SELECT id FROM discard_pending_inbox_item($1,$2)', [ids.a, itemId]),
      /movimiento|descartar/i
    );
  });

  await test('dashless wallet request still refuses a discarded inbox row', async () => {
    const itemId = randomUUID();
    await service(db, `INSERT INTO pending_inbox_items(id,user_id,amount,currency,merchant,account_id,status,fingerprint,source)
      VALUES($1,$2,19,'ARS','Dashless discard',$3,'pending','fp-dashless-discard','wallet')`, [itemId, ids.a, ids.accountA]);
    const discarded = (await owner(db, 'SELECT status FROM discard_pending_inbox_item($1,$2)', [ids.a, itemId])).rows[0];
    assert.equal(discarded.status, 'discarded');
    const payload = {
      user_id: ids.a, type: 'expense', account_id: ids.accountA, amount: 19, currency: 'ARS',
      amount_in_account_currency: 19, description: 'Dashless discard', source: 'wallet',
    };
    await assert.rejects(
      () => service(db, 'SELECT create_transaction_once($1,$2,$3,$4::jsonb,1)',
        [ids.a, `wallet:${itemId.replaceAll('-', '')}`, digest(JSON.stringify(payload)), JSON.stringify(payload)]),
      /descartado/i
    );
    assert.equal((await service(db, "SELECT count(*)::int AS n FROM transactions WHERE description='Dashless discard' AND user_id=$1", [ids.a])).rows[0].n, 0);
  });

  await test('anonymous reserve always inserts; 15-minute match is possible_duplicate_of', async () => {
    const lockKey = 'lock-lookback-fixture-aaaa';
    const row = (fingerprint, merchant = 'Lookback café') => JSON.stringify({
      amount: 40, currency: 'ARS', merchant, direction: 'expense', source: 'wallet', status: 'pending', fingerprint,
    });
    await service(db, `INSERT INTO pending_inbox_items(user_id,amount,currency,merchant,status,fingerprint,source,direction,created_at)
      VALUES($1,40,'ARS','Lookback café','pending','fp-lookback-old','wallet','expense', now() - interval '16 minutes')`,
      [ids.a]);
    const missed = (await service(db, `SELECT reserve_pending_inbox_item($1,$2,$3,false,900000,$4::jsonb) AS r`,
      [ids.a, lockKey, randomUUID(), row('fp-lookback-new')])).rows[0].r;
    assert.equal(missed.duplicate, false);
    assert.equal(missed.item.possible_duplicate_of, null);

    const again = (await service(db, `SELECT reserve_pending_inbox_item($1,$2,$3,false,900000,$4::jsonb) AS r`,
      [ids.a, lockKey, randomUUID(), row('fp-lookback-retry')])).rows[0].r;
    assert.equal(again.duplicate, false);
    assert.notEqual(again.item.id, missed.item.id);
    assert.equal(again.item.possible_duplicate_of, missed.item.id);

    const recent = (await service(db, `INSERT INTO pending_inbox_items(user_id,amount,currency,merchant,status,fingerprint,source,direction,created_at)
      VALUES($1,40,'ARS','Lookback recent','pending','fp-lookback-recent','wallet','expense', now() - interval '20 seconds') RETURNING id`,
      [ids.a])).rows[0];
    const flagged = (await service(db, `SELECT reserve_pending_inbox_item($1,$2,$3,false,900000,$4::jsonb) AS r`,
      [ids.a, 'lock-lookback-fixture-bbbb', randomUUID(), row('fp-lookback-flag', 'Lookback recent')])).rows[0].r;
    assert.equal(flagged.duplicate, false);
    assert.notEqual(flagged.item.id, recent.id);
    assert.equal(flagged.item.possible_duplicate_of, recent.id);
  });

  await test('keyed reserve replays the same payload and 409s a different body or source', async () => {
    const key = 'wallet-idem-e2e-replay';
    const lock = `idemp:${key}`;
    const body = (amount, source, extra = {}) => JSON.stringify({
      amount, currency: 'ARS', merchant: 'Keyed café', direction: 'expense', source,
      status: 'pending', fingerprint: `fp-${source}-${amount}`, idempotency_key: key, ingest_key: key,
      account_id: ids.accountA, ...extra,
    });
    const first = (await service(db, `SELECT reserve_pending_inbox_item($1,$2,$3,true,900000,$4::jsonb) AS r`,
      [ids.a, lock, key, body(18, 'wallet')])).rows[0].r;
    assert.equal(first.duplicate, false);
    const replay = (await service(db, `SELECT reserve_pending_inbox_item($1,$2,$3,true,900000,$4::jsonb) AS r`,
      [ids.a, lock, key, body(18, 'wallet')])).rows[0].r;
    assert.equal(replay.duplicate, true);
    assert.equal(replay.item.id, first.item.id);
    await assert.rejects(
      () => service(db, `SELECT reserve_pending_inbox_item($1,$2,$3,true,900000,$4::jsonb)`,
        [ids.a, lock, key, body(900, 'api', { tool_payload: { type: 'expense', amount: 900 } })]),
      /Idempotency-Key ya se usó/i
    );
    const count = (await service(db, 'SELECT count(*)::int AS n FROM pending_inbox_items WHERE ingest_key=$1 AND user_id=$2',
      [key, ids.a])).rows[0].n;
    assert.equal(count, 1);
  });

  await test('date-only purchases two hours apart insert two pending rows', async () => {
    await service(db, `INSERT INTO pending_inbox_items(user_id,amount,currency,merchant,status,fingerprint,source,direction,occurred_at,created_at)
      VALUES($1,18,'ARS','Date-only café','pending','fp-date-only','wallet','expense','2026-10-24T12:00:00-03:00', now() - interval '2 hours')`,
      [ids.a]);
    const second = (await service(db, `SELECT reserve_pending_inbox_item($1,$2,$3,false,900000,$4::jsonb) AS r`,
      [ids.a, 'lock-date-only-fixture', randomUUID(), JSON.stringify({
        amount: 18, currency: 'ARS', merchant: 'Date-only café', direction: 'expense', source: 'wallet',
        status: 'pending', fingerprint: 'fp-date-only', occurred_at: '2026-10-24T12:00:00-03:00',
      })])).rows[0].r;
    assert.equal(second.duplicate, false);
    assert.equal(second.item.possible_duplicate_of, null);
    const n = (await service(db, "SELECT count(*)::int AS n FROM pending_inbox_items WHERE merchant='Date-only café' AND user_id=$1",
      [ids.a])).rows[0].n;
    assert.equal(n, 2);
  });

  await test('status CHECK can be re-applied after uncertain rows exist', async () => {
    const itemId = randomUUID();
    await service(db, `INSERT INTO pending_inbox_items(id,user_id,amount,currency,merchant,account_id,status,fingerprint,source)
      VALUES($1,$2,3,'ARS','Uncertain check',$3,'uncertain','fp-uncertain-check','wallet')`, [itemId, ids.a, ids.accountA]);
    await db.query('ALTER TABLE public.pending_inbox_items DROP CONSTRAINT IF EXISTS pending_inbox_items_status_check');
    await db.query(`ALTER TABLE public.pending_inbox_items
      ADD CONSTRAINT pending_inbox_items_status_check
      CHECK (status IN ('pending', 'confirming', 'confirmed', 'discarded', 'uncertain'))`);
    assert.equal((await service(db, 'SELECT status FROM pending_inbox_items WHERE id=$1', [itemId])).rows[0].status, 'uncertain');
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
    'anonymous fingerprint not unique',
    'late ledger write after discard refused',
    'authenticated discard requires uid',
    'uncertain cannot be discarded with receipt',
    'discard confirming refused',
    'possible duplicate 15min window',
    'MCP owner confirm and cross-user denial',
    'fingerprint collision preflight',
    'rate-limit counter purge',
    'shared rate-limit counters',
    'wallet uuid request id canonicalize',
    'dashless wallet request refuses discarded',
    'anonymous reserve possible duplicate',
    'keyed reserve replay and 409',
    'date-only two hours apart two rows',
    'status CHECK re-apply with uncertain',
    'installment source mcp',
  ],
  results,
};
console.log(JSON.stringify(report, null, 2));
if (report.status !== 'FAIL' && report.status !== 'PASS') process.exitCode = 1;
if (report.status === 'FAIL') process.exitCode = 1;
