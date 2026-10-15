// Focused real PostgreSQL/PostgREST proof, restricted to the new E2E replica.
// Existing identities/data are preserved; three owned synthetic accounts are added.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { bootstrapSources } from './lib/test-isolated-database.mjs';
import { isolatedNativeTargets, isolatedPgEnvironment, isolatedApiFetch, safeNativeFailure } from './lib/test-isolated-native-target.mjs';

const sha = value => createHash('sha256').update(value).digest('hex');
const literal = value => `'${String(value).replaceAll("'", "''")}'`;
const output = path.resolve(process.env.ZARIX_RECOMPUTE_OUTPUT || '/tmp/zarix-atomic-account-recompute-native');
const privateOutput = path.resolve(process.env.ZARIX_RECOMPUTE_PRIVATE_OUTPUT || '/tmp/zarix-atomic-account-recompute-private');
const report = { startedAt: new Date().toISOString(), status: 'RUNNING', results: [], scope: 'Focused new RPC and precision proof: three owned synthetic accounts, two existing normal Auth identities, independent PostgreSQL sessions and PostgREST. No production, source/restore/load, UI acceptance or monthly availability claim.' };
await fs.mkdir(output, { recursive: true });
await fs.mkdir(privateOutput, { recursive: true, mode: 0o700 });
await fs.chmod(privateOutput, 0o700);
const { apiUrl, databaseUrl } = isolatedNativeTargets();
assert.equal(`${apiUrl.hostname}:${apiUrl.port}:${databaseUrl.hostname}:${databaseUrl.port}`, '127.0.0.1:57321:127.0.0.1:57322', 'Only the new E2E replica is authorized');
const pgEnv = isolatedPgEnvironment(databaseUrl);
const psql = path.join(process.env.ZARIX_PG_BIN || '', 'psql');
const sessions = [];
const ownedAccounts = [];
let account, userA;
function commandError(context, stderr, status) {
  const error = new Error(context);
  error.name = 'NativeCommandError';
  error.code = stderr.match(/ERROR:\s+([0-9A-Z]{5})(?:\s|:)/)?.[1] || `EXIT_${status ?? 1}`;
  // Diagnostic text may contain credentials/capabilities. Never copy it into evidence.
  const file = path.join(privateOutput, `${randomUUID()}.stderr`);
  return fs.writeFile(file, stderr, { mode: 0o600 }).then(() => error);
}
async function sql(statement, context = 'focused SQL assertion') {
  const child = spawnSync(psql, ['-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=sqlstate', '-c', statement], { env: pgEnv, encoding: 'utf8' });
  if (child.status !== 0) throw await commandError(context, child.stderr || '', child.status);
  return child.stdout.trim();
}
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function waitUntil(check, context) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) { if (await check()) return; await delay(40); }
  throw new Error(context);
}
function session(suffix) {
  const application = `zarix-recompute-${randomUUID().slice(0, 8)}-${suffix}`;
  const child = spawn(psql, ['-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=sqlstate'], { env: { ...pgEnv, PGAPPNAME: application }, stdio: ['pipe', 'pipe', 'pipe'] });
  const state = { child, application, stdout: '', stderr: '', closed: false, status: null };
  child.stdout.on('data', data => { state.stdout += data; });
  child.stderr.on('data', data => { state.stderr += data; });
  child.on('close', code => { state.closed = true; state.status = code; });
  child.on('error', error => { state.stderr += error.name; state.closed = true; state.status = 1; });
  state.send = statement => child.stdin.write(`${statement}\n`);
  state.wait = async marker => {
    await waitUntil(async () => {
      if (state.closed && state.status !== 0) throw await commandError('independent PostgreSQL session', state.stderr, state.status);
      return state.stdout.includes(marker);
    }, 'PostgreSQL session marker timeout');
  };
  sessions.push(state);
  return state;
}
async function observedBlock(waiter, blocker) {
  let observation;
  await waitUntil(async () => {
    observation = JSON.parse(await sql(`SELECT COALESCE((SELECT jsonb_build_object('waitingPid',w.pid,'blockingPid',b.pid,'waitType',w.wait_event_type,'blockedByPeer',b.pid=ANY(pg_blocking_pids(w.pid))) FROM pg_stat_activity w CROSS JOIN pg_stat_activity b WHERE w.application_name=${literal(waiter.application)} AND b.application_name=${literal(blocker.application)}), '{}'::jsonb)`));
    return observation.waitType === 'Lock' && observation.blockedByPeer === true;
  }, 'Expected account lock was not observed');
  assert.notEqual(observation.waitingPid, observation.blockingPid);
  return observation;
}
async function test(name, execute, continueIndependent = false) {
  const result = { name, status: 'RUNNING' };
  report.results.push(result);
  try { Object.assign(result, await execute()); result.status = 'PASS'; }
  catch (error) {
    result.status = error.blocked ? 'BLOCKED' : 'FAIL'; result.error = safeNativeFailure(error, name);
    if (error.blocked) result.apiCode = 'PGRST202';
    if (!continueIndependent) throw error;
  }
}
function requireDiscoveredRpc(response) {
  if (response.error?.code === 'PGRST202') {
    const error = new Error('Local PostgREST function discovery unavailable');
    error.name = 'NativeApiError'; error.blocked = true; throw error;
  }
}
const fetchLocal = (input, init = {}) => {
  // supabase-js passes Headers instances for PostgREST. Object spread drops
  // their authorization/content-type values and changes RPC parameter parsing.
  const headers = new Headers(init.headers);
  headers.set('Connection', 'close');
  return isolatedApiFetch(input, { ...init, headers });
};
const client = key => createClient(apiUrl.href, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { fetch: fetchLocal } });
try {
  const file = process.env.ZARIX_TEST_LOGIN_FILE;
  assert.ok(file, 'Use the existing private two-user E2E login fixture');
  assert.equal((await fs.stat(file)).mode & 0o077, 0);
  const fixture = JSON.parse(await fs.readFile(file, 'utf8'));
  assert.equal(fixture.purpose, 'isolated-api-e2e-replica'); assert.equal(fixture.users.length, 2);
  const normal = [];
  for (const credential of fixture.users) {
    assert.match(credential.email, /^zarix-e2e-.+@example\.invalid$/i);
    const auth = client(process.env.ZARIX_LOCAL_ANON_KEY);
    const signed = await auth.auth.signInWithPassword({ email: credential.email, password: credential.password });
    assert.equal(signed.error, null); assert.equal(signed.data.user.id, credential.id);
    const verified = await auth.auth.getUser(); assert.equal(verified.error, null); assert.equal(verified.data.user.id, credential.id);
    normal.push(auth);
  }
  userA = fixture.users[0].id;
  const userB = fixture.users[1].id;
  const manifest = (await bootstrapSources()).map(({ path, sha256 }) => ({ path, sha256 }));
  report.sourceManifest = manifest;
  report.harnessManifest = await Promise.all(['scripts/test-atomic-account-recompute-native.mjs', 'scripts/lib/test-isolated-native-target.mjs'].map(async file => ({ path: file, sha256: sha(await fs.readFile(file)) })));
  report.revision = spawnSync('git', ['rev-parse', 'HEAD'], { env: { ...process.env, DEVELOPER_DIR: '/Library/Developer/CommandLineTools' }, encoding: 'utf8' }).stdout.trim();
  report.target = { apiOrigin: apiUrl.origin, databasePort: databaseUrl.port, postgresVersion: await sql('SHOW server_version') };
  report.credentials = 'Existing local synthetic two-user fixture, private 0600; passwords and sessions never written to evidence.';
  account = randomUUID();
  await sql(`INSERT INTO public.accounts(id,user_id,name,type,currency,balance) VALUES (${literal(account)},${literal(userA)},'Atomic reconciliation synthetic fixture','bank','ARS',0)`);
  ownedAccounts.push(account);
  const insert = amount => `INSERT INTO public.transactions(user_id,account_id,type,amount,currency,amount_in_account_currency,transaction_date,description) VALUES (${literal(userA)},${literal(account)},'income',${amount},'ARS',${amount},now(),'Atomic reconciliation synthetic movement')`;
  const rpc = `public.recompute_account_balance(${literal(userA)},${literal(account)})`;
  const balance = () => sql(`SELECT balance::text FROM public.accounts WHERE id=${literal(account)}`);
  const ledger = () => sql(`SELECT sum(amount_in_account_currency)::numeric(20,8)::text FROM public.transactions WHERE account_id=${literal(account)} AND user_id=${literal(userA)}`);
  await test('before: separate ledger read and unconditional UPDATE lose a committed concurrent income', async () => {
    await sql(insert(100));
    const stale = await ledger();
    const writer = session('before-writer');
    writer.send(`${insert(25)}; SELECT 'BEFORE_WRITER_COMMITTED';`); await writer.wait('BEFORE_WRITER_COMMITTED');
    assert.equal(await balance(), '125.00000000');
    await sql(`UPDATE public.accounts SET balance=${stale} WHERE id=${literal(account)} AND user_id=${literal(userA)}`);
    assert.equal(await balance(), '100.00000000'); assert.equal(await ledger(), '125.00000000');
    return { staleRead: 100, committedIncome: 25, storedBalance: 100, ledgerBalance: 125, reproduction: 'Old separate read/write algorithm using a genuinely independent writer, before calling the new RPC.' };
  });
  const service = client(process.env.ZARIX_LOCAL_SERVICE_ROLE_KEY);
  const params = { p_user_id: userA, p_account_id: account };
  await test('service RPC restores the ledger and rejects manipulated owner without changing data', async () => {
    const denied = await service.rpc('recompute_account_balance', { ...params, p_user_id: userB });
    requireDiscoveredRpc(denied);
    assert.equal(denied.error?.code, '42501'); assert.equal(await balance(), '100.00000000');
    const repaired = await service.rpc('recompute_account_balance', params);
    assert.equal(repaired.error, null); assert.deepEqual(repaired.data, { before: 100, after: 125 });
    assert.equal(await balance(), '125.00000000');
    return { wrongOwnerCode: '42501', before: 100, after: 125, ledgerUnchanged: true };
  }, true);
  await test('anon and both ordinary authenticated sessions cannot invoke the backend repair RPC', async () => {
    for (const auth of [client(process.env.ZARIX_LOCAL_ANON_KEY), ...normal]) {
      const response = await auth.rpc('recompute_account_balance', params); requireDiscoveredRpc(response); assert.equal(response.error?.code, '42501');
    }
    const acl = JSON.parse(await sql("SELECT jsonb_build_object('securityDefiner',prosecdef,'anon',has_function_privilege('anon',oid,'EXECUTE'),'authenticated',has_function_privilege('authenticated',oid,'EXECUTE'),'service',has_function_privilege('service_role',oid,'EXECUTE')) FROM pg_proc WHERE oid='public.recompute_account_balance(uuid,uuid)'::regprocedure"));
    assert.deepEqual(acl, { securityDefiner: false, anon: false, authenticated: false, service: true });
    assert.equal(await balance(), '125.00000000'); return { deniedSessions: 3, code: '42501', catalog: acl };
  }, true);
  await test('native service-role SQL repairs the ledger independently of API discovery', async () => {
    const denied = await sql(`SELECT jsonb_build_object('anon',has_function_privilege('anon','public.recompute_account_balance(uuid,uuid)','EXECUTE'),'authenticated',has_function_privilege('authenticated','public.recompute_account_balance(uuid,uuid)','EXECUTE'),'service',has_function_privilege('service_role','public.recompute_account_balance(uuid,uuid)','EXECUTE'))`);
    assert.deepEqual(JSON.parse(denied), { anon: false, authenticated: false, service: true });
    const repaired = await sql(`BEGIN; SET LOCAL ROLE service_role; SELECT ${rpc}; COMMIT;`);
    assert.equal(JSON.parse(repaired).after, 125); assert.equal(await balance(), '125.00000000');
    return { catalog: JSON.parse(denied), storedBalance: 125, ledgerBalance: 125, scope: 'Real native SQL permissions and repair; does not substitute for a blocked PostgREST result.' };
  });
  await test('account lock keeps a concurrent ledger INSERT uncommitted until repair commits', async () => {
    const repair = session('repair-first'), writer = session('blocked-income');
    repair.send(`BEGIN; SET LOCAL ROLE service_role; SELECT ${rpc}; SELECT 'REPAIR_HOLDS_ACCOUNT_LOCK';`); await repair.wait('REPAIR_HOLDS_ACCOUNT_LOCK');
    writer.send(`${insert(25)}; SELECT 'LOCKED_INCOME_COMMITTED';`);
    const lock = await observedBlock(writer, repair);
    assert.equal(await balance(), '125.00000000'); assert.equal(await ledger(), '125.00000000');
    repair.send("COMMIT; SELECT 'REPAIR_COMMITTED';"); await repair.wait('REPAIR_COMMITTED'); await writer.wait('LOCKED_INCOME_COMMITTED');
    assert.equal(await balance(), '150.00000000'); assert.equal(await ledger(), '150.00000000');
    return { lock, visibleLedgerWhileWriterWaits: 125, storedBalanceAfterBothCommits: 150, ledgerBalanceAfterBothCommits: 150 };
  });
  await test('repair waiting on an existing ledger writer sums its committed income after acquiring the lock', async () => {
    const writer = session('income-first'), repair = session('waiting-repair');
    writer.send(`BEGIN; ${insert(25)}; SELECT 'INCOME_HOLDS_ACCOUNT_LOCK';`); await writer.wait('INCOME_HOLDS_ACCOUNT_LOCK');
    repair.send(`BEGIN; SET LOCAL ROLE service_role; SELECT ${rpc}; COMMIT; SELECT 'WAITING_REPAIR_COMMITTED';`);
    const lock = await observedBlock(repair, writer);
    writer.send("COMMIT; SELECT 'FIRST_INCOME_COMMITTED';"); await writer.wait('FIRST_INCOME_COMMITTED'); await repair.wait('WAITING_REPAIR_COMMITTED');
    assert.equal(await balance(), '175.00000000'); assert.equal(await ledger(), '175.00000000');
    const returned = repair.stdout.split('\n').find(line => line.startsWith('{'));
    assert.deepEqual(JSON.parse(returned), { before: 175, after: 175 });
    return { lock, rpc: { before: 175, after: 175 }, storedBalance: 175, ledgerBalance: 175 };
  });
  await test('canonical legacy destination impacts match reconciliation at zero, in both orders, after edit/delete and rollback', async () => {
    const destinations = [randomUUID(), randomUUID()];
    for (const destination of destinations) {
      await sql(`INSERT INTO public.accounts(id,user_id,name,type,currency,balance) VALUES(${literal(destination)},${literal(userA)},'Atomic rounding synthetic fixture','bank','ARS',0)`);
      ownedAccounts.push(destination);
    }
    const read = destination => sql(`SELECT balance::text FROM public.accounts WHERE id=${literal(destination)}`);
    const expense = destination => `INSERT INTO public.transactions(user_id,account_id,type,amount,currency,amount_in_account_currency,description) VALUES(${literal(userA)},${literal(destination)},'expense',0.00000001,'ARS',0.00000001,'Synthetic eighth-decimal expense')`;
    const transfer = destination => `INSERT INTO public.transactions(user_id,account_id,destination_account_id,type,amount,currency,amount_in_account_currency,exchange_rate,description) VALUES(${literal(userA)},${literal(account)},${literal(destination)},'transfer',0.00000001,'ARS',0.00000001,0.5,'Synthetic legacy half-unit credit')`;
    const reconcile = destination => sql(`BEGIN; SET LOCAL ROLE service_role; SELECT public.recompute_account_balance(${literal(userA)},${literal(destination)}); COMMIT;`);
    await sql(expense(destinations[0])); assert.equal(await read(destinations[0]), '-0.00000001');
    const first = await sql(`${transfer(destinations[0])} RETURNING id`); assert.equal(await read(destinations[0]), '0.00000000');
    await reconcile(destinations[0]); assert.equal(await read(destinations[0]), '0.00000000');
    const second = await sql(`${transfer(destinations[0])} RETURNING id`);
    await sql(transfer(destinations[1])); await sql(transfer(destinations[1])); await sql(expense(destinations[1]));
    for (const destination of destinations) { assert.equal(await read(destination), '0.00000001'); await reconcile(destination); assert.equal(await read(destination), '0.00000001'); }
    await sql(`UPDATE public.transactions SET amount=0.00000003,amount_in_account_currency=0.00000003 WHERE id=${literal(first)}`);
    assert.equal(await read(destinations[0]), '0.00000002'); await reconcile(destinations[0]); assert.equal(await read(destinations[0]), '0.00000002');
    await sql(`DELETE FROM public.transactions WHERE id=${literal(first)}`); assert.equal(await read(destinations[0]), '0.00000000');
    await sql(`DELETE FROM public.transactions WHERE id=${literal(second)}`); assert.equal(await read(destinations[0]), '-0.00000001');
    await reconcile(destinations[0]); assert.equal(await read(destinations[0]), '-0.00000001');
    const sourceBefore = await balance();
    const ledgerBefore = await sql(`SELECT count(*) FROM public.transactions WHERE user_id=${literal(userA)} AND account_id=${literal(account)}`);
    await sql(`BEGIN; ${transfer(destinations[0])}; ROLLBACK;`);
    assert.equal(await read(destinations[0]), '-0.00000001'); assert.equal(await balance(), sourceBefore);
    assert.equal(await sql(`SELECT count(*) FROM public.transactions WHERE user_id=${literal(userA)} AND account_id=${literal(account)}`), ledgerBefore);
    return { numericScale: 8, halfUnitCrossingZero: '0.00000000', twoHalfUnitsMinusExpenseBothOrders: '0.00000001', afterLegacyEdit: '0.00000002', afterDeletingBothOwnTransfers: '-0.00000001', rollbackUnchanged: true, historyPolicy: 'Only movements created by this test are edited/deleted; existing history is preserved.' };
  });
  assert.equal(JSON.stringify((await bootstrapSources()).map(({ path, sha256 }) => ({ path, sha256 }))), JSON.stringify(manifest));
  report.sourceStable = true;
  report.status = report.results.some(result => result.status === 'FAIL') ? 'FAIL' : report.results.some(result => result.status === 'BLOCKED') ? 'BLOCKED' : 'PASS';
  if (report.status !== 'PASS') process.exitCode = 1;
} catch (error) {
  report.status = 'FAIL'; report.error = safeNativeFailure(error, 'focused native repair proof'); process.exitCode = 1;
} finally {
  // Closing an open psql connection rolls back its uncommitted transaction.
  // No existing rows are removed/reset; retain our fixture archived for review.
  for (const active of sessions) active.child.stdin.end();
  for (const active of sessions) if (!active.closed) { try { await waitUntil(() => active.closed, 'session cleanup timeout'); } catch { active.child.kill('SIGTERM'); } }
  if (ownedAccounts.length && userA) {
    try { await sql(`UPDATE public.accounts SET is_active=false,movement_enabled=false WHERE id IN (${ownedAccounts.map(literal).join(',')}) AND user_id=${literal(userA)}`); report.fixturePreservedArchived = true; }
    catch (error) { report.cleanupError = safeNativeFailure(error, 'archive owned fixture'); report.status = 'FAIL'; process.exitCode = 1; }
  }
  report.finishedAt = new Date().toISOString();
  await fs.writeFile(path.join(output, 'account-recompute-native.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ status: report.status, pass: report.results.filter(result => result.status === 'PASS').length, report: path.join(output, 'account-recompute-native.json') }));
}
