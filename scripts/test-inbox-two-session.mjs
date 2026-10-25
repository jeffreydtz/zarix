// Two-connection PostgreSQL: overlapping anonymous reserves that match by account
// but not merchant must serialize on user+amount+currency+direction.
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { ids, postgresServerAvailable, withTwoSessionPostgres } from './lib/two-session-postgres.mjs';

if (!postgresServerAvailable()) {
  console.error('PostgreSQL server binaries are required for the two-session inbox test.');
  process.exit(1);
}

const lockKey = createHash('sha256')
  .update(`${ids.a}|expense|77|ARS`)
  .digest('hex');

const row = (merchant) =>
  JSON.stringify({
    amount: 77,
    currency: 'ARS',
    merchant,
    direction: 'expense',
    source: 'wallet',
    status: 'pending',
    fingerprint: `fp-${merchant}`,
    account_id: ids.accountA,
    request_canonical: '',
  }).replaceAll("'", "''");

const reserveSql = (merchant, ingest) =>
  `SET TIME ZONE 'UTC'; SET ROLE service_role; SELECT set_config('request.jwt.claims','{"role":"service_role"}',true), set_config('request.jwt.claim.role','service_role',true); BEGIN; SELECT pg_sleep(0.4); SELECT reserve_pending_inbox_item('${ids.a}','${lockKey}','${ingest}',false,900000,'${row(merchant)}'::jsonb); COMMIT;`;

const { one, two, flagged } = await withTwoSessionPostgres(async ({ query, parallelSql }) => {
  const firstId = randomUUID();
  const secondId = randomUUID();
  const started = Date.now();
  const [left, right] = await Promise.all([
    parallelSql(reserveSql('Merchant Alpha', firstId)),
    parallelSql(reserveSql('Merchant Beta', secondId)),
  ]);
  assert.equal(left.status, 0, left.stderr || left.stdout);
  assert.equal(right.status, 0, right.stderr || right.stdout);
  const elapsed = Date.now() - started;
  const rows = query(
    `SELECT id, merchant, possible_duplicate_of IS NOT NULL AS flagged, status FROM pending_inbox_items WHERE user_id='${ids.a}' AND amount=77 ORDER BY created_at, id`
  )
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [id, merchant, flaggedFlag, status] = line.split('|');
      return { id, merchant, flagged: flaggedFlag === 't', status };
    });
  return { one: left, two: right, flagged: rows, elapsed };
});

assert.equal(flagged.length, 2);
assert.equal(flagged.filter((row) => row.flagged).length, 1);
assert.equal(flagged.filter((row) => !row.flagged).length, 1);
assert.ok(flagged.every((row) => row.status === 'pending'));
assert.notEqual(flagged[0].merchant, flagged[1].merchant);

console.log(
  JSON.stringify(
    {
      status: 'PASS',
      passed: 1,
      total: 1,
      suite: 'inbox-two-session',
      possibleDuplicate: flagged.find((row) => row.flagged)?.merchant,
      original: flagged.find((row) => !row.flagged)?.merchant,
    },
    null,
    2
  )
);
