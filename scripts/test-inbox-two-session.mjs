// Two-connection PostgreSQL: overlapping anonymous reserves must wait on the
// real JS lock (user+amount+currency+direction) and flag the later row.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { inboxDedupeLockKey } from '../lib/inbox-dedupe-lock-key.ts';
import { ids, postgresServerAvailable, withTwoSessionPostgres } from './lib/two-session-postgres.mjs';

if (!postgresServerAvailable()) {
  console.error('PostgreSQL server binaries are required for the two-session inbox test.');
  process.exit(1);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function rowJson({ merchant, accountId, fingerprint }) {
  return JSON.stringify({
    amount: 77,
    currency: 'ARS',
    merchant,
    direction: 'expense',
    source: 'wallet',
    status: 'pending',
    fingerprint,
    account_id: accountId,
    request_canonical: '',
  });
}

function servicePreamble() {
  return `SET TIME ZONE 'UTC'; SET ROLE service_role; SELECT set_config('request.jwt.claims','{"role":"service_role"}',true), set_config('request.jwt.claim.role','service_role',true);`;
}

function lockSql(lockKey) {
  return `SELECT pg_advisory_xact_lock(hashtextextended(${sqlLiteral(`${ids.a}:inbox-dedupe:${lockKey}`)}, 0));`;
}

function reserveCall(lockKey, ingest, row) {
  return `SELECT reserve_pending_inbox_item(${sqlLiteral(ids.a)}, ${sqlLiteral(lockKey)}, ${sqlLiteral(ingest)}, false, 900000, ${sqlLiteral(row)}::jsonb);`;
}

function parseFlagged(query) {
  return query(
    `SELECT id, merchant, possible_duplicate_of IS NOT NULL AS flagged, status FROM pending_inbox_items WHERE user_id='${ids.a}' AND amount=77 ORDER BY created_at, id`
  )
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [id, merchant, flaggedFlag, status] = line.split('|');
      return { id, merchant, flagged: flaggedFlag === 't', status };
    });
}

function sawAdvisoryWait(query) {
  const text = query(
    `SELECT wait_event_type, wait_event FROM pg_stat_activity WHERE datname=current_database() AND query ILIKE '%reserve_pending_inbox_item%' AND query NOT ILIKE '%pg_stat_activity%'`
  );
  return /Lock\|advisory|advisory/i.test(text);
}

async function runOverlap({ query, parallelSql, lockKey, first, second }) {
  const holder = parallelSql(
    `${servicePreamble()} BEGIN; ${lockSql(lockKey)} ${reserveCall(lockKey, first.ingest, first.row)} SELECT pg_sleep(2); COMMIT;`
  );
  await sleep(250);
  const waiter = parallelSql(`${servicePreamble()} ${reserveCall(lockKey, second.ingest, second.row)}`);
  let waited = false;
  const deadline = Date.now() + 4000;
  while (Date.now() < deadline) {
    if (sawAdvisoryWait(query)) {
      waited = true;
      break;
    }
    await sleep(50);
  }
  const [left, right] = await Promise.all([holder, waiter]);
  assert.equal(left.status, 0, left.stderr || left.stdout);
  assert.equal(right.status, 0, right.stderr || right.stdout);
  const rows = parseFlagged(query);
  return { waited, rows };
}

const payload = { amount: 77, currency: 'ARS', direction: 'expense' };
const lockKey = inboxDedupeLockKey(ids.a, payload, '');

const result = await withTwoSessionPostgres(async ({ query, parallelSql }) => {
  const accountOnly = await runOverlap({
    query,
    parallelSql,
    lockKey,
    first: {
      ingest: randomUUID(),
      row: rowJson({ merchant: 'Merchant Alpha', accountId: ids.accountA, fingerprint: 'fp-alpha' }),
    },
    second: {
      ingest: randomUUID(),
      row: rowJson({ merchant: 'Merchant Beta', accountId: ids.accountA, fingerprint: 'fp-beta' }),
    },
  });
  assert.equal(accountOnly.rows.length, 2, 'account-only overlap should insert two rows');
  assert.equal(accountOnly.rows.filter((row) => row.flagged).length, 1);
  assert.ok(accountOnly.waited, 'session 2 must wait on Lock:advisory for account-only overlap');
  query(`DELETE FROM pending_inbox_items WHERE user_id='${ids.a}' AND amount=77`);

  const merchantOnly = await runOverlap({
    query,
    parallelSql,
    lockKey,
    first: {
      ingest: randomUUID(),
      row: rowJson({ merchant: 'Shared Café', accountId: ids.accountA, fingerprint: 'fp-merchant-a' }),
    },
    second: {
      ingest: randomUUID(),
      row: rowJson({ merchant: 'Shared Café', accountId: ids.usdA, fingerprint: 'fp-merchant-b' }),
    },
  });
  assert.equal(merchantOnly.rows.length, 2, 'merchant-only overlap should insert two rows');
  assert.equal(merchantOnly.rows.filter((row) => row.flagged).length, 1);
  assert.ok(merchantOnly.waited, 'session 2 must wait on Lock:advisory for merchant-only overlap');
  query(`DELETE FROM pending_inbox_items WHERE user_id='${ids.a}' AND amount=77`);

  const definition = query(
    `SELECT pg_get_functiondef(p.oid) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='reserve_pending_inbox_item'`
  );
  assert.match(definition, /pg_advisory_xact_lock/);
  const unlocked = definition
    .replace(/PERFORM\s+pg_advisory_xact_lock\s*\([\s\S]*?\);/, '-- lock removed')
    .replace(
      /IF NOT COALESCE\(p_client_keyed, false\) THEN\s+lookback/,
      'PERFORM pg_advisory_lock_shared(8675309);\n  IF NOT COALESCE(p_client_keyed, false) THEN\n    lookback'
    );
  assert.doesNotMatch(unlocked, /pg_advisory_xact_lock/);
  assert.match(unlocked, /pg_advisory_lock_shared/);
  query(`CREATE OR REPLACE ${unlocked.replace(/^CREATE(?:\s+OR\s+REPLACE)?\s+/i, '')}`);

  const barrier = parallelSql('SELECT pg_advisory_lock(8675309); SELECT pg_sleep(4); SELECT pg_advisory_unlock(8675309);');
  await sleep(200);
  const sleepReserve = (merchant, ingest) =>
    `${servicePreamble()} ${reserveCall(lockKey, ingest, rowJson({ merchant, accountId: ids.accountA, fingerprint: `fp-mutant-${merchant}` }))}`;
  const waiting = Promise.all([
    parallelSql(sleepReserve('Mutant Alpha', randomUUID())),
    parallelSql(sleepReserve('Mutant Beta', randomUUID())),
  ]);
  const waitDeadline = Date.now() + 3000;
  let sharedWaiters = 0;
  while (Date.now() < waitDeadline) {
    const locks = query(
      `SELECT count(*) FROM pg_locks WHERE locktype='advisory' AND objid=8675309 AND granted=false`
    );
    sharedWaiters = Number(locks || 0);
    if (sharedWaiters >= 2) break;
    await sleep(50);
  }
  assert.ok(sharedWaiters >= 2, `mutant sessions should queue on the shared barrier, got ${sharedWaiters}`);
  const [mutA, mutB] = await waiting;
  const barrierResult = await barrier;
  assert.equal(mutA.status, 0, mutA.stderr || mutA.stdout);
  assert.equal(mutB.status, 0, mutB.stderr || mutB.stdout);
  assert.equal(barrierResult.status, 0, barrierResult.stderr || barrierResult.stdout);
  const mutantRows = parseFlagged(query);
  assert.equal(mutantRows.length, 2);
  assert.equal(
    mutantRows.filter((row) => row.flagged).length,
    0,
    'negative control: without the advisory lock both overlapping rows stay unflagged'
  );

  return {
    accountWaited: accountOnly.waited,
    merchantWaited: merchantOnly.waited,
    accountFlagged: accountOnly.rows.find((row) => row.flagged)?.merchant,
    merchantFlagged: merchantOnly.rows.find((row) => row.flagged)?.merchant,
    mutantUnflagged: mutantRows.length,
  };
});

console.log(
  JSON.stringify(
    {
      status: 'PASS',
      passed: 3,
      total: 3,
      suite: 'inbox-two-session',
      lockKeySource: 'lib/inbox-dedupe-lock-key.ts',
      ...result,
    },
    null,
    2
  )
);
