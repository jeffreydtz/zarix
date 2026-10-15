// Builds the canonical synthetic load fixture in a separate EMPTY local stack.
// It never uses the source/restore ports or deletes/resets existing data.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';
import { bootstrapSources, digest } from './lib/test-isolated-database.mjs';
import { isolatedNativeTargets, isolatedPgEnvironment, isolatedApiFetch } from './lib/test-isolated-native-target.mjs';

const output = path.resolve(process.env.ZARIX_LOAD_SETUP_OUTPUT || '/tmp/zarix-isolated-load-setup');
const fixtureFile = path.resolve(process.env.ZARIX_LOAD_FIXTURE_FILE || '/tmp/zarix-runtime/load-fixture.json');
const report = { startedAt: new Date().toISOString(), status: 'RUNNING', scope: 'Independent empty loopback load stack: native baseline/migration replay, two ordinary synthetic Auth identities and exactly 10 accounts / 5000 movements / 100 manual positions per user. No source or recovery-target mutations.', results: [] };
const literal = value => `'${String(value).replaceAll("'", "''")}'`;
await fs.mkdir(output, { recursive: true, mode: 0o700 });
try {
  assert.equal(process.env.ZARIX_LOAD_SETUP_CONFIRM, 'empty-replica', 'Explicit empty-replica fixture confirmation required');
  const { apiUrl, databaseUrl, database } = isolatedNativeTargets();
  assert.equal(apiUrl.port, '56321', 'Only the separately identified load API is allowed');
  assert.equal(databaseUrl.port, '56322', 'Only the separately identified load database is allowed');
  const pgEnv = isolatedPgEnvironment(databaseUrl), psql = path.join(process.env.ZARIX_PG_BIN || '', 'psql');
  function sql(statement) {
    const command = spawnSync(psql, ['-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-c', statement], { env: pgEnv, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
    assert.equal(command.status, 0, 'Native fixture SQL failed; private stderr is not published');
    return command.stdout.trim();
  }
  const empty = Number(sql("SELECT count(*) FROM pg_tables WHERE schemaname='public'"));
  assert.equal(empty, 0, 'Refusing bootstrap into nonempty public schema');
  assert.equal(Number(sql('SELECT count(*) FROM auth.users')), 0, 'Refusing a load stack with existing Auth identities');
  const files = await bootstrapSources();
  report.sourceManifest = files.map(({ path, sha256 }) => ({ path, sha256 }));
  const bootstrap = path.join(output, 'bootstrap.sql');
  await fs.writeFile(bootstrap, files.map(file => `-- ${file.path} SHA256 ${file.sha256}\n${file.sql}`).join('\n\n'), { mode: 0o600 });
  const replay = spawnSync(psql, ['-X', '-q', '-v', 'ON_ERROR_STOP=1', '-c', 'SET search_path=public,extensions', '-f', bootstrap], { env: pgEnv, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  assert.equal(replay.status, 0, 'Load baseline/migration replay failed; private stderr is not published');
  sql("NOTIFY pgrst,'reload schema'");
  const revision = spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', env: { ...process.env, DEVELOPER_DIR: '/Library/Developer/CommandLineTools' } }).stdout.trim();
  report.revision = revision;
  report.postgres = sql('SELECT version()');
  report.target = { purpose: 'isolated-load-replica', apiOrigin: apiUrl.origin, databaseHost: databaseUrl.hostname, databasePort: databaseUrl.port, databaseName: database };
  const users = [], run = randomUUID().slice(0, 8);
  for (const [index, suffix] of ['a', 'b'].entries()) {
    const email = `zarix-load-${run}-${suffix}@example.invalid`, password = `Synthetic-${randomUUID()}-9a!`;
    const client = createClient(apiUrl.href, process.env.ZARIX_LOCAL_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { fetch: isolatedApiFetch } });
    const signup = await client.auth.signUp({ email, password });
    assert.equal(signup.error, null, 'Normal local signup failed');
    assert.ok(signup.data.session, 'Local email confirmations must be disabled for this synthetic fixture');
    await client.auth.signOut();
    const signed = await client.auth.signInWithPassword({ email, password });
    assert.equal(signed.error, null); assert.equal((await client.auth.getUser()).data.user?.id, signed.data.user.id);
    const id = signed.data.user.id;
    assert.equal(sql(`SELECT email FROM auth.users WHERE id=${literal(id)}`), email, 'Auth and SQL target mismatch');
    users.push({ id, email, password });
    sql(`UPDATE users SET onboarding_done=true,status='ACTIVE',current_period_end='2099-01-01',default_currency='ARS',timezone='Etc/UTC' WHERE id=${literal(id)}`);
    const accounts = Array.from({ length: 10 }, (_, n) => ({ id: randomUUID(), currency: n < 8 ? 'ARS' : 'USD', type: n === 9 ? 'investment' : 'bank', initial: n < 8 ? 100000 * (index + 1) : 100000 }));
    const seed = `BEGIN; SET LOCAL search_path=public,extensions;
      INSERT INTO accounts(id,user_id,name,type,currency,balance,include_in_total,include_in_liquid,movement_enabled,is_active) VALUES
      ${accounts.map((account, n) => `(${literal(account.id)},${literal(id)},${literal(`ZARIX LOAD ${suffix.toUpperCase()} account ${n + 1}`)},${literal(account.type)},${literal(account.currency)},0,true,true,true,true)`).join(',\n')};
      INSERT INTO transactions(user_id,account_id,type,amount,currency,amount_in_account_currency,transaction_date,description) VALUES
      ${accounts.map((account, n) => `(${literal(id)},${literal(account.id)},'adjustment',${account.initial},${literal(account.currency)},${account.initial},date_trunc('month',now())+interval '12 hours',${literal(`ZARIX LOAD ${suffix.toUpperCase()} opening ${n + 1}`)})`).join(',\n')};
      INSERT INTO transactions(user_id,account_id,type,amount,currency,amount_in_account_currency,transaction_date,description)
      SELECT ${literal(id)},a.id,(CASE WHEN n%2=0 THEN 'expense' ELSE 'income' END)::transaction_type,
        100+n%11,a.currency,100+n%11,date_trunc('month',now())+interval '12 hours'+n*interval '1 second',
        'ZARIX LOAD ${suffix.toUpperCase()} movement '||lpad(n::text,5,'0')
      FROM generate_series(1,4990)n CROSS JOIN LATERAL (
        SELECT id,currency FROM (VALUES ${accounts.map((account, n) => `(${n},${literal(account.id)}::uuid,${literal(account.currency)})`).join(',')}) accounts(slot,id,currency) WHERE slot=(n%10)
      )a;
      INSERT INTO investments(user_id,account_id,type,name,quantity,purchase_price,purchase_currency,purchase_date,current_price,current_price_updated_at,market_currency,is_manual_price,is_active)
      SELECT ${literal(id)},${literal(accounts[9].id)},'stock_us','ZARIX LOAD ${suffix.toUpperCase()} position '||lpad(n::text,3,'0'),1+n%3,100,'USD',date_trunc('month',now())::date,110,now(),'USD',true,true FROM generate_series(1,100)n;
      COMMIT;`;
    sql(seed);
    const accountCount = Number(sql(`SELECT count(*) FROM accounts WHERE user_id=${literal(id)}`)), transactionCount = Number(sql(`SELECT count(*) FROM transactions WHERE user_id=${literal(id)}`)), positionCount = Number(sql(`SELECT count(*) FROM investments WHERE user_id=${literal(id)}`));
    assert.deepEqual([accountCount, transactionCount, positionCount], [10, 5000, 100]);
    assert.equal(sql(`SELECT max(transaction_date)<=now() FROM transactions WHERE user_id=${literal(id)}`), 't', 'Canonical rows cannot be future dated');
    const reconciled = Number(sql(`SELECT count(*) FROM accounts a LEFT JOIN LATERAL (SELECT COALESCE(sum(CASE WHEN type IN ('income','adjustment') THEN amount_in_account_currency ELSE -amount_in_account_currency END),0) delta FROM transactions WHERE account_id=a.id) ledger ON true WHERE a.user_id=${literal(id)} AND a.balance=ledger.delta`));
    assert.equal(reconciled, 10, 'Every fixture account balance must reconcile with initial balance and ledger');
    report.results.push({ name: `canonical fixture user ${index + 1}`, status: 'PASS', userId: id, accounts: accountCount, transactions: transactionCount, positions: positionCount, balancesReconciled: reconciled });
  }
  // The fixture uses stable local cache references, not provider doubles presented
  // as real integrations. Refresh these rows again before load if a build takes >5m.
  sql(`INSERT INTO exchange_rates(source,from_currency,to_currency,rate,timestamp) SELECT source,'USD','ARS',rate,now() FROM (VALUES ('blue',1200),('blue_buy',1190),('oficial',1000),('oficial_buy',990),('mep',1250),('mep_buy',1240),('ccl',1280),('ccl_buy',1270))q(source,rate)`);
  const fixture = { purpose: 'isolated-load-replica', databaseName: database, serverTimeZone: 'Etc/UTC', applicationMode: 'next start after production build; isolated local machine; no deployment equivalence claimed', accountNamePrefix: 'ZARIX LOAD ', users };
  await fs.mkdir(path.dirname(fixtureFile), { recursive: true, mode: 0o700 });
  await fs.writeFile(fixtureFile, JSON.stringify(fixture, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
  assert.equal((await fs.stat(fixtureFile)).mode & 0o077, 0);
  report.fixtureFile = fixtureFile;
  report.credentialPolicy = 'Two ephemeral synthetic local credentials persisted only in private mode0600 fixture; never copied into evidence';
  report.sourceStable = JSON.stringify((await bootstrapSources()).map(({ path, sha256 }) => ({ path, sha256 }))) === JSON.stringify(report.sourceManifest);
  assert.equal(report.sourceStable, true);
  report.fixtureSnapshotSha256 = digest(sql("SELECT jsonb_build_object('users',(SELECT jsonb_agg(id ORDER BY id) FROM users),'accounts',(SELECT jsonb_agg(to_jsonb(t) ORDER BY t.id) FROM accounts t),'transactions',(SELECT jsonb_agg(to_jsonb(t) ORDER BY t.id) FROM transactions t),'positions',(SELECT jsonb_agg(to_jsonb(t) ORDER BY t.id) FROM investments t))"));
  report.status = 'PASS';
} catch (error) {
  report.status = 'FAIL'; report.errorType = error.name;
  report.failureLocation = error.stack?.match(/setup-isolated-load\.mjs:(\d+):\d+/)?.[1] || null;
  report.reason = 'Fixture precondition or assertion failed; raw error omitted because it may contain credentials. Existing or partially seeded data are preserved; no automatic reset performed.';
  process.exitCode = 1;
} finally {
  report.finishedAt = new Date().toISOString();
  await fs.writeFile(path.join(output, 'setup-load.json'), JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
  console.log(JSON.stringify({ status: report.status, report: path.join(output, 'setup-load.json'), usersPrepared: report.results.length, failureLocation: report.failureLocation || null }, null, 2));
}
