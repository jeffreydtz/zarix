// Normal Auth -> HTTP API -> independent native SQL. No I/O before the explicit gate.
// Only new UUID fixtures in the separately released58321/58322 replica are writable.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { parseArgs } from 'node:util';
import { runScenarios } from './remaining-scenarios.mjs';
import dotenv from 'dotenv';
import { createServerClient } from '@supabase/ssr';
import { isolatedNativeTargets, isolatedPgEnvironment, isolatedApiFetch } from '../../../../../../scripts/lib/test-isolated-native-target.mjs';

const root = fileURLToPath(new URL('../../../../../../', import.meta.url));
const here = path.dirname(fileURLToPath(import.meta.url));
const runtime = '/tmp/zarix-runtime-20261015';
const appOrigin = 'http://127.0.0.1:3002';
const ids = ['CP1-04','CP1-12','CP1-19','CP1-20','CP1-21','CP1-22','CP1-23','CP1-24','CP1-25','CP1-28','CP1-29','CP1-30','CP1-31','CP1-35'];
const options = parseArgs({ options: { cases: { type: 'string' }, profile: { type: 'string', default: 'intermediate-core-reliability-clock-retry' } }, strict: true, allowPositionals: false }).values;
const profiles={
  'intermediate-core-reliability-clock-retry':{copyRoot:'/tmp/zarix-app-contract-clock-20261015',core:'core-reliability',appEnv:'contract-clock-app.env',state:'contract-clock-retry-app-state.json',proof:'contract-clock-build-proof.json',buildProfile:'intermediate-core-reliability-clock',observation:'contract-clock-retry-observation.json'},
  'final-core-acceptance':{copyRoot:'/tmp/zarix-app-acceptance-final-20261015',core:'core-acceptance',appEnv:'final-proof-app.env',state:'final-proof-clock-app-state.json',proof:'final-proof-build-proof.json',buildProfile:'final-core-acceptance',observation:'final-proof-clock-observation.json'},
};
assert.ok(Object.hasOwn(profiles,options.profile),'Only the two named local clock profiles are supported');
const profile=profiles[options.profile];
const selectedIds = options.cases ? options.cases.split(',') : ids;
assert.ok(selectedIds.length > 0 && new Set(selectedIds).size === selectedIds.length && selectedIds.every(id => ids.includes(id)), 'Select only distinct declared original case IDs');
const digest = value => createHash('sha256').update(value).digest('hex');
const lit = value => `'${String(value).replaceAll("'", "''")}'`;
const sqlIds = values => values.length ? values.map(lit).join(',') : 'NULL';
const run = randomUUID();
const report = { status: 'PREPARED', startedAt: new Date().toISOString(), run, selectedIds, scope: 'Fourteen declared remaining CU001 cases in the explicitly selected isolated clock profile. The immutable intermediate core-reliability build and future final core-acceptance build remain separate phases. Normal Auth/API, native SQL oracle and narrowly scoped temporary fault hooks. Cron/import are local synthetic only. No browser, delivery/provider acceptance, plan change or new identity.', results: [], requests: [], fixtures: [] };
const originalTables = ['users', 'accounts', 'transactions', 'investments', 'investment_sales', 'categories', 'budgets', 'recurring_rules', 'shared_groups', 'shared_group_members', 'shared_expenses', 'shared_expense_splits'];
const users = [], ownedAccounts = [];
let sql, rows, output, active, config, originals, initialSources, appPrivateConfig, servedCopySources;
const cleanupActions = [];
class Blocked extends Error {}
const block = reason => { throw new Blocked(reason); };
const save = async () => { if (output) await fs.writeFile(path.join(output, 'verification.json'), JSON.stringify(report, null, 2) + '\n', { mode: 0o600 }); };
function check(name, actual, expected) {
  const item = { name, actual, expected, status: 'RUNNING' }; active.assertions.push(item);
  try { assert.deepEqual(actual, expected); item.status = 'PASS'; } catch (error) { item.status = 'FAIL'; throw error; }
}
const balance = id => Number(sql(`SELECT balance::text FROM public.accounts WHERE id=${lit(id)}`));
const accountRows = accountIds => rows(`SELECT * FROM public.accounts WHERE id IN(${sqlIds(accountIds)}) ORDER BY id`);
const ledgerRows = accountIds => rows(`SELECT id,user_id,account_id,destination_account_id,type,amount::text,amount_in_account_currency::text,destination_amount_in_account_currency::text,currency,category_id,transaction_date FROM public.transactions WHERE account_id IN(${sqlIds(accountIds)}) OR destination_account_id IN(${sqlIds(accountIds)}) ORDER BY id`);
// Account creation records the documented initial balance as an adjustment.
// Retain those rows in fixture/full-ledger snapshots; count economic movements separately.
const movements = accountIds => ledgerRows(accountIds).filter(row => row.type !== 'adjustment');

async function manifest() {
  const sourcePaths = [path.relative(root, fileURLToPath(import.meta.url)), 'docs/tif/v2.13/casos_prueba.csv', path.relative(root,path.join(here,'remaining-scenarios.mjs')), 'app/api/import/transactions/route.ts','app/api/recurring/route.ts','app/api/recurring/[id]/route.ts','app/api/cron/recurring/route.ts','app/api/budgets/route.ts','app/api/budgets/[id]/route.ts','app/api/budgets/status/route.ts','app/api/accounts/[id]/adjust-secondary-balance/route.ts','lib/cron/recurring-job.ts','lib/cron/cron-job.ts','lib/cron/recurring-schedule.ts','lib/services/budgets.ts','lib/observability/alert.ts', 'scripts/lib/test-isolated-native-target.mjs', 'app/api/accounts/route.ts', 'app/api/accounts/[id]/route.ts', 'app/api/categories/route.ts', 'app/api/transactions/route.ts', 'app/api/transactions/[id]/route.ts', 'app/api/transactions/summary/route.ts', 'lib/services/accounts.ts', 'lib/services/transactions.ts', 'supabase/schema.sql'];
  for (const name of (await fs.readdir(path.join(root, 'supabase/migrations'))).filter(name => name.endsWith('.sql')).sort()) sourcePaths.push(`supabase/migrations/${name}`);
  return Promise.all(sourcePaths.map(async file => ({ path: file, sha256: digest(await fs.readFile(path.join(root, file))) })));
}
async function buildBinding(state) {
  const corePath = path.join(root,'docs/tif/v2.13/evidence/technical-20261015',profile.core,'verification.json');
  const coreRaw = await fs.readFile(corePath), core = JSON.parse(coreRaw);
  assert.equal(core.sourceStable, true); assert.equal(core.sourceWorkingTreeClean, true);
  if(profile.core==='core-reliability')assert.equal(core.codeRevision,'836fd18b310a51cced9074b372a80ce5d7e1a870');
  assert.equal(state.runtimeProfile,options.profile);assert.equal(state.coreDirectory,profile.core);assert.equal(state.clockProfile,'fixed-20261006T120000Z');assert.equal(state.fixedTime,'2026-10-06T12:00:00.000Z');assert.equal(state.adminAlertsDisabled,true);
  assert.match(core.codeRevision, /^[a-f0-9]{40}$/); assert.equal(state.revision, core.codeRevision);
  assert.equal(state.appOrigin, appOrigin); assert.equal(state.apiOrigin, 'http://127.0.0.1:58321'); assert.equal(state.purpose, 'account-analysis-proof');
  assert.equal(state.copyRoot,profile.copyRoot);
  assert.equal(await fs.realpath(state.copyRoot), path.join(await fs.realpath('/tmp'),path.basename(profile.copyRoot)));
  const proofPath = path.join(runtime,profile.proof), proofRaw = await fs.readFile(proofPath), proof = JSON.parse(proofRaw);
  assert.equal(proof.runtimeProfile,profile.buildProfile);assert.equal(proof.coreDirectory,profile.core);assert.equal(proof.adminAlertsDisabled,true);assert.equal(proof.exitCode, 0); assert.equal(proof.revision, core.codeRevision); assert.equal(proof.copyRoot, state.copyRoot); assert.equal(proof.buildId, state.buildId);
  assert.equal((await fs.readFile(path.join(state.copyRoot, '.next/BUILD_ID'), 'utf8')).trim(), state.buildId);
  assert.equal(digest(JSON.stringify(proof.sources)), state.sourceManifestSha256);
  servedCopySources=proof.sources; const copied = new Set();
  for (const entry of proof.sources) {
    assert.ok(!path.isAbsolute(entry.path) && !entry.path.split('/').includes('..') && !copied.has(entry.path)); copied.add(entry.path);
    assert.equal(digest(await fs.readFile(path.join(state.copyRoot, entry.path))), entry.sha256);
    const metadata = (proof.manifestOnlyMetadata || []).find(item => item.path === entry.path);
    if (metadata) { assert.equal(entry.path, 'supabase/.temp/cli-latest'); assert.equal(metadata.sha256, entry.sha256); }
    else {
      const git = spawnSync('git', ['show', `${core.codeRevision}:${entry.path}`], { cwd: root, env: { ...process.env, DEVELOPER_DIR: '/Library/Developer/CommandLineTools' } });
      assert.equal(git.status, 0, 'Frozen Git bytes unavailable; diagnostics withheld'); assert.equal(digest(git.stdout), entry.sha256);
    }
  }
  for (const source of core.sourceManifest) { assert.ok(copied.has(source.path)); assert.equal(proof.sources.find(item => item.path === source.path).sha256, source.sha256); }
  const privateEnvRaw = await fs.readFile(path.join(runtime,profile.appEnv)), privateEnv = dotenv.parse(privateEnvRaw); appPrivateConfig = privateEnv;
  assert.equal(digest(privateEnvRaw), proof.privateEnvSha256);
  assert.equal(privateEnv.NEXT_PUBLIC_APP_URL, appOrigin); assert.equal(privateEnv.NEXT_PUBLIC_SUPABASE_URL, config.ZARIX_PROOF_SUPABASE_URL);
  assert.equal(privateEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY, config.ZARIX_PROOF_ANON_KEY); assert.equal(privateEnv.SUPABASE_SERVICE_ROLE_KEY, config.ZARIX_PROOF_SERVICE_ROLE_KEY);
  assert.ok(Number.isSafeInteger(state.nextPid) && state.nextPid > 1); process.kill(state.nextPid, 0);
  const lsof = args => { const p = spawnSync('/usr/sbin/lsof', args, { encoding: 'utf8' }); assert.equal(p.status, 0, 'Owned listener/cwd missing; diagnostics withheld'); return p.stdout.trim().split('\n'); };
  const listeners = lsof(['-nP', '-a', '-p', String(state.nextPid), '-iTCP:3002', '-sTCP:LISTEN', '-Fpn']);
  assert.ok(listeners.includes(`p${state.nextPid}`) && listeners.includes('n127.0.0.1:3002'));
  const actualCwd = lsof(['-a', '-p', String(state.nextPid), '-d', 'cwd', '-Fn']).find(line => line.startsWith('n'))?.slice(1);
  assert.equal(await fs.realpath(actualCwd), await fs.realpath(state.copyRoot));
  const currentCheckoutDifferences=[];
  const changed=spawnSync('git',['diff','--name-only',core.codeRevision,'--','app','components','lib','types','public','next.config.ts','next.config.js','middleware.ts','package.json','package-lock.json'],{cwd:root,env:{...process.env,DEVELOPER_DIR:'/Library/Developer/CommandLineTools'},encoding:'utf8'});
  assert.equal(changed.status,0,'Current product diff unavailable; diagnostics withheld');
  for(const file of changed.stdout.trim().split('\n').filter(Boolean)){
    assert.ok(!path.isAbsolute(file)&&!file.split('/').includes('..'));
    const old=spawnSync('git',['show',`${core.codeRevision}:${file}`],{cwd:root,env:{...process.env,DEVELOPER_DIR:'/Library/Developer/CommandLineTools'}});
    let currentSha256=null;try{currentSha256=digest(await fs.readFile(path.join(root,file)));}catch{}
    currentCheckoutDifferences.push({path:file,currentCheckoutSha256:currentSha256,servedGitSha256:old.status===0?digest(old.stdout):null,executedByThisBuild:false});
  }
  report.currentCheckoutDifferences=currentCheckoutDifferences;
  return { revision: core.codeRevision, buildId: state.buildId, nextPid: state.nextPid, appOrigin, apiOrigin: state.apiOrigin, copyRoot: state.copyRoot, runtimeProfile:options.profile,buildProfile:profile.buildProfile,stateFile:profile.state,clockObservationFile:profile.observation,copiedSources: proof.sources.length, allCopiedSourcesMatchGitOrDeclaredCliMetadata: true, ownedListenerAndCwdConfirmed: true, privateEnvBoundToNative: true, coreVerificationSha256: digest(coreRaw), buildProofSha256: digest(proofRaw) };
}
async function request(method, endpoint, payload, user = users[0], requestId = randomUUID()) {
  assert.ok(endpoint.startsWith('/api/') && !endpoint.includes('://'));
  const url = new URL(endpoint, appOrigin); assert.equal(url.origin, appOrigin);
  const session = await user.client.auth.getSession(); assert.equal(session.error, null);
  if (!session.data.session || Number(session.data.session.expires_at) * 1000 - Date.now() < 10000) {
    const refresh = await user.client.auth.refreshSession(); assert.equal(refresh.error, null); assert.equal(refresh.data.user?.id, user.id);
    report.normalAuthRefreshes = (report.normalAuthRefreshes || 0) + 1;
  }
  const key = requestId, item = { caseId: active?.id || 'SETUP', method, path: url.pathname, requestId: key, startedAt: new Date().toISOString() };
  report.requests.push(item); await save();
  const headers = { Cookie: [...user.jar].map(([k, v]) => `${k}=${v}`).join('; '), 'Idempotency-Key': key };
  const isForm = payload instanceof FormData;
  if (payload !== undefined && !isForm) headers['Content-Type'] = 'application/json';
  const response = await fetch(url, { method, headers, body: payload === undefined ? undefined : isForm ? payload : JSON.stringify(payload), redirect: 'error', signal: AbortSignal.timeout(55000) });
  const text = await response.text(); Object.assign(item, { status: response.status, responseSha256: digest(text), endedAt: new Date().toISOString() }); await save();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}
function slots(user, count) {
  const q = rows(`SELECT public.plan_account_limit(id) AS cap,(SELECT count(*) FROM accounts a WHERE a.user_id=u.id AND a.is_active AND a.movement_enabled) AS used FROM users u WHERE id=${lit(user.id)}`)[0];
  if (Number(q.cap) - Number(q.used) < count) block(`This literal fixture requires ${count} available existing plan slots; no plan/original account alteration permitted.`);
}
async function account(initialBalance, user = users[0], extra = {}) {
  slots(user, 1); const name = `RemainingCU001 ${active.id} ${ownedAccounts.length + 1} ${run}`;
  const r = await request('POST', '/api/accounts', { name, type: 'bank', currency: 'ARS', initialBalance, ...extra }, user);
  if (r.status === 201) { assert.match(r.body.id, /^[a-f0-9-]{36}$/i); ownedAccounts.push({ id: r.body.id, userId: user.id, user }); report.fixtures.push({ id: r.body.id, name, owner: user.id, initialBalance, openingLedgerRows: ledgerRows([r.body.id]) }); }
  check('Own normal-session fixture account201', r.status, 201); check('Initial native balance', balance(r.body.id), initialBalance); return r.body.id;
}
async function transaction(accountId, amount, type = 'expense', extra = {}) {
  assert.ok(ownedAccounts.some(item => item.id === accountId && item.userId === users[0].id));
  const r = await request('POST', '/api/transactions', { type, accountId, amount, currency: 'ARS', description: `RemainingCU001 ${active.id} ${run}`, transactionDate: '2026-10-06T12:00:00Z', ...extra });
  check('Normal API fixture transaction201', r.status, 201); return r.body;
}
async function category(name, type) {
  const list = await request('GET', '/api/categories'); check('Visible categories200', list.status, 200);
  let row = list.body.find(item => item.name === name && item.type === type && item.user_id === users[0].id);
  if (!row) { const r = await request('POST', '/api/categories', { name, type, icon: '🔁' }); check('Own literal category201', r.status, 201); row = r.body; report.fixtures.push({ kind: 'category', id: row.id, name, owner: users[0].id }); }
  return row.id;
}
async function summary() { const r = await request('GET', '/api/transactions/summary?month=2026-10-01T12:00:00Z'); check('October summary200', r.status, 200); return r.body; }
async function exact(id, fn) {
  if (!selectedIds.includes(id)) return;
  active = { id, status: 'RUNNING', complete_original_contract: false, assertions: [], observations: [], pendingScopes: [], startedAt: new Date().toISOString() }; report.results.push(active);
  const ownedStart = ownedAccounts.length, cleanupStart = cleanupActions.length;
  try { await fn(); active.status = active.pendingScopes.length ? 'PARTIAL' : 'PASS'; active.complete_original_contract = active.status === 'PASS'; }
  catch (error) { active.status = error instanceof Blocked ? (active.assertions.some(x => x.status === 'PASS') ? 'PARTIAL' : 'BLOCKED') : 'FAIL'; active.blocker = error instanceof Blocked ? error.message : undefined; if (!(error instanceof Blocked)) active.failure = { type: error.name, sourceLine: error.stack?.match(/run-remaining\.mjs:(\d+):\d+/)?.[1] || null, reason: 'Named assertion/prerequisite failed; raw errors withheld' }; }
  finally {
    for (const action of cleanupActions.slice(cleanupStart).reverse()) { try { await action(); } catch { active.cleanupFailure = true; active.status = 'FAIL'; active.complete_original_contract = false; } }
    for (const own of ownedAccounts.slice(ownedStart)) {
      try { assert.equal(rows(`SELECT user_id FROM accounts WHERE id=${lit(own.id)}`)[0].user_id, own.userId); const r = await request('DELETE', `/api/accounts/${own.id}`, undefined, own.user); assert.equal(r.status, 204); }
      catch { active.cleanupFailure = true; active.status = 'FAIL'; active.complete_original_contract = false; }
    }
    active.finishedAt = new Date().toISOString(); await save();
  }
}

try {
  assert.equal(process.env.ZARIX_CU001_REMAINING_WINDOW, 'released-clock-proof-58321', 'Explicit serial release required before any fixture/read');
  assert.equal(process.env.ZARIX_ISOLATED_DATABASE_CONFIRM, 'synthetic-only');
  output = path.resolve(process.env.ZARIX_CU001_REMAINING_OUTPUT || path.join(runtime, `remaining-cu001-final-${run}`));
  assert.ok(output.startsWith(runtime + '/remaining-cu001-final-')); await fs.mkdir(output, { recursive: false, mode: 0o700 });
  const envFile = path.join(runtime, 'proof.env'), loginFile = path.join(runtime, 'proof-logins.json');
  for (const file of [envFile, loginFile, path.join(runtime,profile.appEnv)]) assert.equal((await fs.stat(file)).mode & 0o077, 0);
  config = dotenv.parse(await fs.readFile(envFile));
  const { apiUrl, databaseUrl } = isolatedNativeTargets({ ZARIX_ISOLATED_DATABASE_CONFIRM: 'synthetic-only', ZARIX_LOCAL_SUPABASE_URL: config.ZARIX_PROOF_SUPABASE_URL, ZARIX_LOCAL_DATABASE_URL: config.ZARIX_PROOF_DATABASE_URL });
  assert.equal(apiUrl.origin, 'http://127.0.0.1:58321'); assert.equal(databaseUrl.hostname, '127.0.0.1'); assert.equal(databaseUrl.port, '58322'); assert.equal(databaseUrl.pathname, '/postgres');
  databaseUrl.username = 'supabase_admin'; const pgEnv = isolatedPgEnvironment(databaseUrl), psql = path.join(config.ZARIX_PG_BIN, 'psql');
  sql = statement => { const p = spawnSync(psql, ['-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-c', `SET statement_timeout='17s'; SET lock_timeout='3s'; ${statement}`], { env: pgEnv, encoding: 'utf8', timeout:22000, maxBuffer: 8 * 1024 * 1024 }); assert.equal(p.status, 0, 'Native SQL failed; diagnostics withheld'); return p.stdout.trim(); };
  rows = query => JSON.parse(sql(`SELECT COALESCE(jsonb_agg(to_jsonb(t)),'[]'::jsonb) FROM (${query})t`));
  initialSources = await manifest(); report.sourceManifest = initialSources;
  report.buildBinding = await buildBinding(JSON.parse(await fs.readFile(path.join(runtime,profile.state), 'utf8')));
  const logins = JSON.parse(await fs.readFile(loginFile, 'utf8')); assert.equal(logins.purpose, 'fifth-isolated-acceptance-replica'); assert.equal(logins.users.length, 2);
  const preparation = JSON.parse(await fs.readFile(path.join(runtime, 'proof-private/preparation.json'), 'utf8'));
  assert.equal(preparation.status, 'PASS_PREPARED'); assert.equal(preparation.target.apiOrigin, apiUrl.origin); assert.deepEqual(logins.users.map(x => x.id), preparation.auth.map(x => x.id));
  for (const credential of logins.users) {
    assert.match(credential.email, /^zarix-.+@example\.invalid$/i); const jar = new Map();
    const client = createServerClient(apiUrl.href, config.ZARIX_PROOF_ANON_KEY, { cookies: { getAll: () => [...jar].map(([name, value]) => ({ name, value })), setAll: cookies => { for (const { name, value } of cookies) jar.set(name, value); } }, global: { fetch: isolatedApiFetch } });
    const result = await client.auth.signInWithPassword({ email: credential.email, password: credential.password }); assert.equal(result.error, null); assert.equal((await client.auth.getUser()).data.user?.id, credential.id);
    assert.equal(sql(`SELECT email FROM auth.users WHERE id=${lit(credential.id)}`), credential.email); users.push({ id: credential.id, jar, client });
  }
  report.identities = users.map(user => ({ id: user.id, normalPasswordAuthAndGetUser: true })); report.versions = { node: process.version, postgres: sql('SHOW server_version') };
  originals = originalTables.map(table => { const rowIds = rows(`SELECT id FROM public.${table} ORDER BY id`).map(x => x.id); return { table, ids: rowIds, count: rowIds.length, md5: sql(`SELECT md5(COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t.id)::text,'[]')) FROM public.${table} t WHERE t.id IN(${sqlIds(rowIds)})`) }; });
  report.profile=options.profile;report.status = 'RUNNING'; await save();


  const physicalUsers = [...users];
  const premiumCases = new Set(['CP1-24','CP1-25','CP1-28','CP1-29','CP1-30','CP1-35']);
  const currentUser = () => users[0];
  const registerCleanup = action => cleanupActions.push(action);
  async function clock() {
    const file=path.join(runtime,profile.observation);
    const proof=JSON.parse(await fs.readFile(file,'utf8'));
    assert.equal(proof.fixedTime,'2026-10-06T12:00:00.000Z'); assert.equal(proof.buildId,report.buildBinding.buildId);assert.equal(proof.nextPid,report.buildBinding.nextPid);assert.equal(proof.sourceStable,true);
    assert.match(proof.preloadSha256,/^[a-f0-9]{64}$/);assert.ok(proof.command);
    assert.equal(proof.preloadSha256,digest(await fs.readFile(path.join(root,'docs/tif/v2.13/evidence/technical-20261015/acceptance-final/clock-preload.mjs'))));
    report.clockProof={path:profile.observation,sha256:digest(await fs.readFile(file)),fixedTime:proof.fixedTime,preloadSha256:proof.preloadSha256};
  }
  function noActiveOriginalRules() {
    if(Number(sql('SELECT count(*) FROM public.recurring_rules WHERE is_active'))!==0)block('Global recurring cron requires no pre-existing active rule; do not disable or execute original rules.');
  }
  function premium() {
    const profile=rows(`SELECT status,current_period_end,telegram_chat_id IS NOT NULL AS chat_linked,telegram_bot_token IS NOT NULL AS bot_credential FROM public.users WHERE id=${lit(currentUser().id)}`)[0];
    if(profile.status!=='ACTIVE'||new Date(profile.current_period_end)<=new Date('2026-10-06T12:00:00Z'))block('Existing selected fixture must already be Premium; no plan change permitted.');
    active.premiumFixture={status:profile.status,chatLinked:profile.chat_linked,botCredentialPresent:profile.bot_credential};
    assert.equal(profile.bot_credential,false,'No real Telegram bot may be used');
    assert.equal(appPrivateConfig.TELEGRAM_ADMIN_CHAT_ID,'','Test child must explicitly disable admin messages even if host inherits a chat ID');
  }
  async function cron(invalid=false) {
    assert.ok(appPrivateConfig.CRON_SECRET,'Use the existing local CRON_SECRET fixture');
    const item={caseId:active.id,method:'GET',path:'/api/cron/recurring',credential:invalid?'synthetic-invalid':'existing-local-secret-redacted',startedAt:new Date().toISOString()};report.requests.push(item);await save();
    const r=await fetch(new URL(item.path,appOrigin),{headers:{Authorization:`Bearer ${invalid?'synthetic-invalid':appPrivateConfig.CRON_SECRET}`},redirect:'error',signal:AbortSignal.timeout(55000)});
    const text=await r.text();Object.assign(item,{status:r.status,responseSha256:digest(text),endedAt:new Date().toISOString()});await save();return {status:r.status,body:JSON.parse(text)};
  }
  async function rule(accountId,{activeFlag=true,amount=1000,notification=false,end='2026-10-06'}={}) {
    const r=await request('POST','/api/recurring',{accountId,type:'expense',amount,currency:'ARS',frequency:'daily',startDate:'2026-10-01',endDate:end,description:`RemainingCU001 ${active.id} ${run}`,notificationEnabled:notification});
    check('Own normal-session recurring fixture201',r.status,201);const id=r.body.id;report.fixtures.push({kind:'recurring-rule',id,owner:currentUser().id});const actor=currentUser();
    registerCleanup(async()=>{const response=await request('PUT',`/api/recurring/${id}`,{isActive:false},actor);assert.equal(response.status,200);});
    sql(`UPDATE public.recurring_rules SET last_executed_date='2026-10-05',is_active=${activeFlag?'true':'false'} WHERE id=${lit(id)} AND user_id=${lit(actor.id)}`);
    return id;
  }
  async function fault({table,predicate}) {
    assert.ok(['accounts','transactions'].includes(table));
    const name=`zarix_test_${run.replaceAll('-','')}_${cleanupActions.length}`;assert.match(name,/^[a-z0-9_]+$/);
    const operation=table==='accounts'?'UPDATE':'INSERT';
    const catalogQuery=`SELECT 'function'::text AS kind,p.proname::text AS name,pg_get_functiondef(p.oid) AS definition,p.proacl::text AS acl FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prokind<>'a' UNION ALL SELECT 'trigger',t.tgname::text,pg_get_triggerdef(t.oid),NULL::text FROM pg_trigger t JOIN pg_class r ON r.oid=t.tgrelid JOIN pg_namespace n ON n.oid=r.relnamespace WHERE n.nspname='public' AND NOT t.tgisinternal UNION ALL SELECT 'sequence',r.relname::text,to_jsonb(q)::text,r.relacl::text FROM pg_class r JOIN pg_namespace n ON n.oid=r.relnamespace JOIN pg_sequence q ON q.seqrelid=r.oid WHERE n.nspname='public'`;
    const catalog=()=>rows(`SELECT * FROM (${catalogQuery})v ORDER BY kind,name,definition`);
    const ownCatalog=()=>catalog().filter(row=>[`${name}_fn`,`${name}_seq`,`${name}_trigger`].includes(row.name));
    const baseline=catalog();assert.deepEqual(ownCatalog(),[],'Do not replace an existing catalog object');
    const record={name:'Own temporary fault installation/cleanup',objectPrefix:name,table,predicate,installAttempted:false,installAcknowledged:false,cleanupAcknowledged:false,catalogBeforeSha256:digest(JSON.stringify(baseline)),catalogBeforeCount:baseline.length,ownObjectsBefore:[]};active.observations.push(record);
    let removed=false;
    const remove=async()=>{
      if(removed||!record.installAttempted)return;
      sql(`DROP TRIGGER IF EXISTS ${name}_trigger ON public.${table}; DROP FUNCTION IF EXISTS public.${name}_fn(); DROP SEQUENCE IF EXISTS public.${name}_seq;`);
      const after=catalog();record.ownObjectsAfter=ownCatalog();record.catalogAfterSha256=digest(JSON.stringify(after));record.catalogAfterCount=after.length;record.cleanupAcknowledged=true;
      assert.deepEqual(record.ownObjectsAfter,[],'Own fault catalog objects remain');assert.equal(record.catalogAfterSha256,record.catalogBeforeSha256,'Original definitions/ACL catalog changed');removed=true;await save();
    };
    // Register cleanup and persist exact names BEFORE installation can commit or lose its reply.
    registerCleanup(remove);record.installAttempted=true;await save();
    sql(`CREATE SEQUENCE public.${name}_seq; CREATE FUNCTION public.${name}_fn() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN PERFORM nextval('public.${name}_seq'); RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='Synthetic own-fixture fault'; END; $$; REVOKE ALL ON FUNCTION public.${name}_fn() FROM PUBLIC,anon,authenticated; CREATE TRIGGER ${name}_trigger BEFORE ${operation} ON public.${table} FOR EACH ROW WHEN (${predicate}) EXECUTE FUNCTION public.${name}_fn();`);
    record.installAcknowledged=true;record.ownObjectsInstalled=ownCatalog();assert.equal(record.ownObjectsInstalled.length,3);await save();
    return {remove,hits:()=>rows(`SELECT last_value::int,is_called FROM public.${name}_seq`)[0],scope:'Temporary target-ID-predicate trigger; nontransactional own sequence records reaching the failure point. Names checkpointed before install; IF EXISTS cleanup and full public function/trigger/sequence definition+ACL catalog comparison in finally.'};
  }
  async function newCategory(name,type='expense') {const r=await request('POST','/api/categories',{name,type,icon:'🔁'});check('Independent own category201',r.status,201);return r.body.id;}
  const pending=(name,reason)=>active.pendingScopes.push({name,status:'BLOCKED',reason});
  const observe=(name,value)=>active.observations.push({name,...value});
  const c={run,ids,sql,rows,lit,sqlIds,digest,check,balance,accountRows,ledgerRows,movements,request,account,transaction,category,newCategory,slots,registerCleanup,clock,cron,rule,fault,premium,noActiveOriginalRules,block,pending,observe,user:currentUser,other:()=>users[1],report,current:()=>active,output,
    async exact(id,fn){await exact(id,async()=>{const actor=premiumCases.has(id)?physicalUsers[1]:physicalUsers[0];users.splice(0,2,actor,physicalUsers.find(x=>x!==actor));active.physicalOwner=actor===physicalUsers[0]?'A':'B';if(premiumCases.has(id)){await clock();premium();noActiveOriginalRules();}await fn(c);});}};
  await runScenarios(c);

} catch (error) {
  report.preconditionFailure = { type: error.name, reason: 'Explicit window/private target/build/Auth prerequisite failed; raw values and diagnostics withheld' }; report.status = 'BLOCKED';
} finally {
  if (sql && originals) {
    try { report.originalIntegrity = originals.map(before => { const after = rows(`SELECT count(*)::int AS count,md5(COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t.id)::text,'[]')) AS md5 FROM public.${before.table} t WHERE t.id IN(${sqlIds(before.ids)})`)[0]; return { table: before.table, rows: before.count, beforeMd5: before.md5, afterMd5: after.md5, unchanged: before.count === after.count && before.md5 === after.md5 }; }); } catch { report.originalIntegrityUnavailable = true; }
  }
  for (const user of users) { try { await user.client.auth.signOut({ scope: 'local' }); } catch { report.authSessionCleanupFailed = true; } }
  if (initialSources) { try { report.sourceStable = JSON.stringify(initialSources) === JSON.stringify(await manifest()); } catch { report.sourceStable = false; } }
  if(servedCopySources){try{report.servedCopyStable=(await Promise.all(servedCopySources.map(async item=>digest(await fs.readFile(path.join(profile.copyRoot,item.path)))===item.sha256))).every(Boolean);}catch{report.servedCopyStable=false;}}

  if (report.results.length) report.status = report.results.some(x => x.status === 'FAIL') || report.originalIntegrity?.some(x => !x.unchanged) || report.originalIntegrityUnavailable || report.authSessionCleanupFailed || !report.sourceStable || report.servedCopyStable===false ? 'FAIL' : report.results.length === selectedIds.length ? (report.results.some(x => x.status !== 'PASS') ? 'PARTIAL' : 'PASS') : 'BLOCKED';
  report.finishedAt = new Date().toISOString(); await save();
  console.log(JSON.stringify({ output: output ? path.basename(output) : null, status: report.status, cases: report.results.map(({ id, status }) => ({ id, status })), browserExecution: false }));
  if (report.status === 'FAIL') process.exitCode = 1;
}
