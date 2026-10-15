// Own new test identities in a separate replica; source/recovery are refused.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';
import { bootstrapSources } from './lib/test-isolated-database.mjs';
import { isolatedNativeTargets, isolatedPgEnvironment, isolatedApiFetch } from './lib/test-isolated-native-target.mjs';
const literal = value => `'${String(value).replaceAll("'", "''")}'`;
const output = path.resolve(process.env.ZARIX_E2E_SETUP_OUTPUT || '/tmp/zarix-isolated-e2e-user-setup');
const fixtureFile = path.resolve(process.env.ZARIX_TEST_LOGIN_FILE || '/tmp/zarix-runtime/e2e-logins.json');
const report = { startedAt: new Date().toISOString(), status: 'RUNNING', scope: 'Creates exactly two new synthetic normal Auth identities in a separate local replica. Existing source/recovery identities and canonical monetary data remain unchanged.', results: [] };
await fs.mkdir(output, { recursive: true, mode: 0o700 });
try {
  assert.equal(process.env.ZARIX_E2E_SETUP_CONFIRM, 'new-identities-in-replica');
  const { apiUrl, databaseUrl } = isolatedNativeTargets();
  assert.ok(['56321:56322', '57321:57322'].includes(`${apiUrl.port}:${databaseUrl.port}`), 'Source/recovery ports and mismatched instances refused');
  const completeGuest = process.env.ZARIX_E2E_COMPLETE_GUEST === '1';
  const previousFixture = completeGuest ? JSON.parse(await fs.readFile(fixtureFile, 'utf8')) : null;
  if (previousFixture) {
    assert.equal((await fs.stat(fixtureFile)).mode & 0o077, 0);
    assert.equal(previousFixture.purpose, 'isolated-api-e2e-replica'); assert.equal(previousFixture.users.length, 2); assert.ok(!previousFixture.guest);
  } else await assert.rejects(fs.access(fixtureFile), { code: 'ENOENT' }, 'Do not overwrite an existing credential fixture');
  const pgEnv = isolatedPgEnvironment(databaseUrl), psql = path.join(process.env.ZARIX_PG_BIN || '', 'psql');
  function sql(statement) {
    const child = spawnSync(psql, ['-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-c', statement], { env: pgEnv, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
    assert.equal(child.status, 0, 'Replica SQL precondition failed; private stderr omitted'); return child.stdout.trim();
  }
  if (Number(sql("SELECT count(*) FROM pg_tables WHERE schemaname='public'")) === 0) {
    assert.equal(Number(sql('SELECT count(*) FROM auth.users')), 0, 'Only bootstrap an empty new replica');
    const files = await bootstrapSources(); report.sourceManifest = files.map(({ path, sha256 }) => ({ path, sha256 }));
    const bootstrap = path.join(output, 'bootstrap.sql');
    await fs.writeFile(bootstrap, files.map(file => `-- ${file.path} SHA256 ${file.sha256}\n${file.sql}`).join('\n\n'), { mode: 0o600 });
    const replay = spawnSync(psql, ['-X', '-q', '-v', 'ON_ERROR_STOP=1', '-c', 'SET search_path=public,extensions', '-f', bootstrap], { env: pgEnv, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
    assert.equal(replay.status, 0, 'Native bootstrap failed; private stderr omitted'); sql("NOTIFY pgrst,'reload schema'");
  }
  assert.equal(Number(sql("SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('users','accounts','transactions','investments')")), 4);
  const fingerprint = () => createHash('sha256').update(sql("SELECT jsonb_build_object('accounts',(SELECT jsonb_agg(to_jsonb(t) ORDER BY t.id) FROM accounts t),'transactions',(SELECT jsonb_agg(to_jsonb(t) ORDER BY t.id) FROM transactions t),'investments',(SELECT jsonb_agg(to_jsonb(t) ORDER BY t.id) FROM investments t),'sales',(SELECT jsonb_agg(to_jsonb(t) ORDER BY t.id) FROM investment_sales t))")).digest('hex');
  const before = fingerprint(), users = [], run = randomUUID().slice(0, 8);
  for (const [index, suffix] of ['a', 'b'].entries()) {
    const { email, password } = previousFixture?.users[index] || { email: `zarix-e2e-${run}-${suffix}@example.invalid`, password: `Synthetic-${randomUUID()}-9a!` };
    assert.match(email, /^zarix-e2e-.+@example\.invalid$/i);
    const client = createClient(apiUrl.href, process.env.ZARIX_LOCAL_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { fetch: isolatedApiFetch } });
    if (!previousFixture) {
      const signup = await client.auth.signUp({ email, password });
      assert.equal(signup.error, null); assert.ok(signup.data.session, 'Synthetic local confirmations must be disabled');
      await client.auth.signOut();
    }
    const login = await client.auth.signInWithPassword({ email, password });
    assert.equal(login.error, null); assert.equal((await client.auth.getUser()).data.user?.id, login.data.user.id);
    const id = login.data.user.id;
    const claims = JSON.parse(Buffer.from(login.data.session.access_token.split('.')[1], 'base64url').toString());
    assert.equal(claims.role, 'authenticated'); assert.equal(claims.sub, id);
    assert.equal(sql(`SELECT email FROM auth.users WHERE id=${literal(id)}`), email);
    sql(`UPDATE users SET onboarding_done=true,status='ACTIVE',current_period_end='2099-01-01',grace_period_end=NULL WHERE id=${literal(id)}`);
    users.push({ id, email, password });
    report.results.push({ name: `ordinary ${previousFixture ? 'signin existing test' : 'signup/signin'} user ${suffix.toUpperCase()}`, status: 'PASS', userId: id, role: claims.role });
  }
  const groupId = randomUUID(), foreignGroupId = randomUUID(), memberA = randomUUID(), memberB = randomUUID(), guestId = randomUUID(), foreignMember = randomUUID(), token = randomUUID().replaceAll('-', ''), foreignToken = randomUUID().replaceAll('-', '');
  sql(`BEGIN; INSERT INTO shared_groups(id,owner_user_id,name,currency,share_token) VALUES(${literal(groupId)},${literal(users[0].id)},'Grupo E2E sintético A','ARS',${literal(token)}),(${literal(foreignGroupId)},${literal(users[1].id)},'Grupo E2E sintético B','ARS',${literal(foreignToken)});
    INSERT INTO shared_group_members(id,group_id,user_id,display_name) VALUES(${literal(memberA)},${literal(groupId)},${literal(users[0].id)},'Usuario E2E A'),(${literal(memberB)},${literal(groupId)},${literal(users[1].id)},'Usuario E2E B'),(${literal(guestId)},${literal(groupId)},NULL,'Invitado E2E propio'),(${literal(foreignMember)},${literal(foreignGroupId)},${literal(users[1].id)},'Usuario E2E B ajeno'); COMMIT;`);
  assert.equal(Number(sql(`SELECT count(*) FROM shared_group_members WHERE group_id IN (${literal(groupId)},${literal(foreignGroupId)}) AND user_id IS NULL`)), 1);
  if (apiUrl.port === '57321') sql(`INSERT INTO exchange_rates(source,from_currency,to_currency,rate,timestamp) SELECT source,'USD','ARS',rate,now() FROM (VALUES ('blue',1200),('blue_buy',1190),('oficial',1000),('oficial_buy',990),('mep',1250),('mep_buy',1240),('ccl',1280),('ccl_buy',1270))q(source,rate)`);
  const after = fingerprint(); assert.equal(after, before);
  const fixture = { purpose: 'isolated-api-e2e-replica', users, guest: { groupId, memberId: guestId, payerMemberId: memberA, secondMemberId: memberB, foreignMemberId: foreignMember, token } };
  await fs.mkdir(path.dirname(fixtureFile), { recursive: true, mode: 0o700 });
  await fs.writeFile(fixtureFile, JSON.stringify(fixture, null, 2) + '\n', { mode: 0o600, flag: previousFixture ? 'w' : 'wx' });
  assert.equal((await fs.stat(fixtureFile)).mode & 0o077, 0);
  report.target = { apiOrigin: apiUrl.origin, databasePort: databaseUrl.port, purpose: fixture.purpose };
  report.existingMonetaryData = { beforeSha256: before, afterSha256: after, unchanged: true };
  report.credentialPolicy = 'Ephemeral local synthetic passwords in private 0600 fixture only; never copied into evidence';
  report.planFixture = 'Synthetic ACTIVE period to 2099 for these new test identities only; no payment/provider confirmation claimed';
  report.fixtureFile = fixtureFile;
  report.guest = { status: 'PASS', ownGuests: 1, ownGroups: 2, scope: 'One anonymous capability member; two registered members in its group and one foreign registered member. Tokens stay private; this does not assert guest Auth identity.' };
  if (report.sourceManifest) {
    report.sourceStable = JSON.stringify((await bootstrapSources()).map(({ path, sha256 }) => ({ path, sha256 }))) === JSON.stringify(report.sourceManifest);
    assert.equal(report.sourceStable, true);
  }
  report.status = 'PASS';
} catch (error) {
  report.status = 'FAIL'; report.errorType = error.name; report.failureLocation = error.stack?.match(/setup-isolated-e2e-users\.mjs:(\d+):\d+/)?.[1] || null;
  report.reason = 'Replica precondition/ordinary login assertion failed; raw error omitted to protect credentials. Existing data are preserved; no automatic reset.';
  process.exitCode = 1;
} finally {
  report.finishedAt = new Date().toISOString();
  await fs.writeFile(path.join(output, 'setup-e2e-users.json'), JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
  console.log(JSON.stringify({ report: path.join(output, 'setup-e2e-users.json'), status: report.status, normalUsers: report.results.length, failureLocation: report.failureLocation || null }, null, 2));
}
