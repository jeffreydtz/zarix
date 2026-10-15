// Prepared followup harness only. No product changes, provisioning or process starts.
// Running requires both Native readiness and a separate explicit root release.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID, createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import dotenv from 'dotenv';
import { createServerClient } from '@supabase/ssr';
import { isolatedNativeTargets, isolatedPgEnvironment, isolatedApiFetch } from '../../../../../../scripts/lib/test-isolated-native-target.mjs';
import { readRecentDashboard } from './ssr-recent.mjs';
import { parseArgs } from 'node:util';

const root = fileURLToPath(new URL('../../../../../../', import.meta.url));
const runtime = '/tmp/zarix-runtime-20261015';
const privateRoot = path.join(runtime, 'empty-account-private');
const revision = '84df929ab2f169251a49f3e95d0e0c148dfcb87c';
const digest = value => createHash('sha256').update(value).digest('hex');
const lit = value => `'${String(value).replaceAll("'", "''")}'`;
const run = randomUUID();
const output = path.join(runtime, 'empty-followup-contracts-' + run);
const selected = parseArgs({options:{case:{type:'string'}},strict:true}).values.case;
assert.ok(['CP1-01','CP1-24'].includes(selected));
const cases = [selected].map(case_id => ({ case_id, status: 'BLOCKED', complete_original_contract: false, assertions: [] }));
const report = { run, startedAt: new Date().toISOString(), status: 'RUNNING', scope: 'One released followup CP101 or CP124 on the exact new UUID database after three independently completed empty contracts. Actual normalAuth/API/SQL/SSR or recurring cron/worker scope as recorded; no browser, external Telegram, completeAuthrestore or Storage claim.', cases, requests: [], fixtures: [] };
let current;
let targetPg;
let originalPg;
let psql;
let targetOriginals;
let restoreOriginals;
let finalProof;
let c;
const sessions = [];
const ownAccounts = new Set();
const ownRules = new Set();
let priorReport, priorReportBytes, priorSnapshotId, clonedBId, config, appEnv, build, state;
const allowedProfileFields=['status','current_period_end','grace_period_end','telegram_chat_id','updated_at'];
let adminFixtureChanged=false;
const tables = ['users', 'accounts', 'transactions', 'investments', 'investment_sales', 'shared_groups', 'shared_group_members', 'shared_expenses', 'shared_expense_splits', 'categories', 'budgets', 'recurring_rules', 'net_worth_snapshots'];

async function privateBytes(file) {
  const absolute = path.resolve(file);
  assert.ok(absolute.startsWith(runtime + '/'));
  assert.equal((await fs.stat(absolute)).mode & 0o077, 0);
  return fs.readFile(absolute);
}
async function save() { await fs.writeFile(path.join(output, 'verification.json'), JSON.stringify(report, null, 2) + '\n', { mode: 0o600 }); }
async function quoteJournal(file) {
  const bytes = await privateBytes(file);
  const entries = bytes.toString().trim() ? bytes.toString().trim().split('\n').map(line => JSON.parse(line)) : [];
  for (const [index, entry] of entries.entries()) {
    assert.deepEqual(Object.keys(entry).sort(), ['controlSha256', 'mode', 'path', 'sequence', 'status']);
    assert.equal(entry.sequence, index + 1);
    assert.ok(['unavailable', 'available'].includes(entry.mode));
    assert.match(entry.controlSha256, /^[a-f0-9]{64}$/);
    assert.ok(typeof entry.path === 'string' && entry.path.startsWith('/') && !/[?#]/.test(entry.path) && entry.path !== '/health');
    assert.equal(entry.status, entry.mode === 'unavailable' ? 503 : 200);
  }
  return { bytesSha256: digest(bytes), entries };
}
function sql(query, env = targetPg) {
  const child = spawnSync(psql, ['-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-c', `BEGIN READ ONLY; ${query}; COMMIT;`], { env, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
  assert.equal(child.status, 0, 'Read-only native oracle failed; raw diagnostics withheld');
  return child.stdout.trim();
}
const rows = (query, env = targetPg) => JSON.parse(sql(`SELECT COALESCE(jsonb_agg(to_jsonb(q)), '[]'::jsonb) FROM (${query})q`, env));
function scopedRows(table,env){
 const exclusion=selected==='CP1-01'&&table==='net_worth_snapshots'&&env===targetPg?` WHERE q.id<>${lit(priorSnapshotId)}`:'';
 const projected=selected==='CP1-24'&&table==='users'&&env===targetPg?`CASE WHEN q.id=${lit(clonedBId)} THEN to_jsonb(q)-ARRAY[${allowedProfileFields.map(lit).join(',')}] ELSE to_jsonb(q) END`:'to_jsonb(q)';
 return {exclusion,projected};
}
function inventory(env){return tables.map(table=>{const{exclusion,projected}=scopedRows(table,env),ids=rows(`SELECT q.id FROM public.${table}q${exclusion} ORDER BY q.id`.replace(`${table}q`,`${table} q`),env).map(row=>row.id);return{table,ids,count:ids.length,md5:sql(`SELECT md5(COALESCE(jsonb_agg(${projected} ORDER BY q.id)::text,'[]')) FROM public.${table}q${exclusion}`.replace(`${table}q`,`${table} q`),env),scope:table==='users'&&env===targetPg&&selected==='CP1-24'?'All original rows; exact cloned B fields status/current_period_end/grace_period_end/telegram_chat_id/updated_at excluded only for parent-authorized synthetic fixture; all other B fields and all other users preserved':table==='net_worth_snapshots'&&env===targetPg&&selected==='CP1-01'?'Exclude only exact previously harness-created owned B snapshot UUID with prior report ownership evidence':'All full original rows'};});}
function compare(before,env){return before.map(old=>{const{projected}=scopedRows(old.table,env),where=old.ids.length?old.ids.map(lit).join(','):'NULL',after=rows(`SELECT count(*)::int AS count,md5(COALESCE(jsonb_agg(${projected} ORDER BY q.id)::text,'[]')) AS md5 FROM public.${old.table} q WHERE q.id IN(${where})`,env)[0];return{table:old.table,originalRows:old.count,beforeMd5:old.md5,afterMd5:after.md5,unchanged:old.count===after.count&&old.md5===after.md5,scope:old.scope};});}
function compareWhole(before, env) { return before.map(old => { const after = rows(`SELECT count(*)::int AS count,md5(COALESCE(jsonb_agg(to_jsonb(q) ORDER BY q.id)::text,'[]')) AS md5 FROM public.${old.table} q`, env)[0]; return { table: old.table, comparison: 'complete-table-no-new-rows-permitted', originalRows: old.count, afterRows: after.count, beforeMd5: old.md5, afterMd5: after.md5, unchanged: old.count === after.count && old.md5 === after.md5 }; }); }
function writeOwnFixture(query){const child=spawnSync(psql,['-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-c',`SET statement_timeout='10s'; ${query};`],{env:targetPg,encoding:'utf8',maxBuffer:1024*1024});assert.equal(child.status,0,'Authorized own fixture write failed; diagnostics withheld');return child.stdout.trim();}

function check(name, actual, expected) { const item = { name, actual, expected, status: 'RUNNING' }; current.assertions.push(item); try { assert.deepEqual(actual, expected); item.status = 'PASS'; } catch (error) { item.status = 'FAIL'; throw error; } }
function near(name, actual, expected) { const item = { name, numericActual: Number(actual), numericExpected: Number(expected), tolerance: 1e-8, status: 'RUNNING' }; current.assertions.push(item); try { assert.ok(Number.isFinite(Number(actual)) && Math.abs(Number(actual) - expected) < item.tolerance); item.status = 'PASS'; } catch (error) { item.status = 'FAIL'; throw error; } }
async function exact(caseId, fn) { current = cases.find(row => row.case_id === caseId); current.status = 'RUNNING'; current.startedAt = new Date().toISOString(); await save(); try { current.evidence = await fn(); current.status = 'PASS'; current.complete_original_contract = true; } catch (error) { current.status = 'FAIL'; current.failure = { type: error.name, location: String(error.stack).match(/(?:run|ssr-contracts)\.mjs:\d+:\d+/)?.[0] || 'assertion', context: 'Named contract assertion failed; private diagnostics withheld' }; } current.endedAt = new Date().toISOString(); await save(); }

async function http(method, endpoint, payload, user, requestId = randomUUID()) {
  assert.ok(endpoint.startsWith('/api/') || (method === 'GET' && endpoint === '/dashboard'));
  const url = new URL(endpoint, c.appOrigin);
  assert.equal(url.origin, 'http://127.0.0.1:3004');
  const session = await user.client.auth.getSession(); assert.equal(session.error, null);
  if (!session.data.session || session.data.session.expires_at * 1000 - Date.now() < 10000) { const refresh = await user.client.auth.refreshSession(); assert.equal(refresh.error, null); assert.equal(refresh.data.user?.id, user.id); report.normalRefreshes = (report.normalRefreshes || 0) + 1; }
  const headers = { Cookie: [...user.jar].map(([key, value]) => `${key}=${value}`).join('; '), 'Idempotency-Key': requestId };
  if (payload !== undefined) headers['Content-Type'] = 'application/json';
  const record = { caseId: current?.case_id || 'ROUTING_PRECONDITION', method, path: url.pathname, requestId, startedAt: new Date().toISOString(), state: 'DISPATCHING' }; report.requests.push(record); await save();
  // Exactly one financial dispatch. No automatic replay after an uncertain result.
  const response = await fetch(url, { method, headers, body: payload === undefined ? undefined : JSON.stringify(payload), redirect: 'error', signal: AbortSignal.timeout(55000) });
  const body = await response.text(); Object.assign(record, { status: response.status, responseSha256: digest(body), endedAt: new Date().toISOString(), state: 'COMPLETED' }); await save();
  return { status: response.status, body: endpoint === '/dashboard' ? body : body ? JSON.parse(body) : null };
}
async function account(user, initialBalance, currency, name) {
  const before = rows(`SELECT id FROM public.accounts WHERE user_id=${lit(user.id)}`);
  const result = await http('POST', '/api/accounts', { name, type: 'bank', currency, initialBalance }, user);
  check('Actual normal account API201', result.status, 201);
  assert.match(result.body.id, /^[0-9a-f-]{36}$/i); assert.ok(!before.some(row => row.id === result.body.id));
  ownAccounts.add(result.body.id); report.fixtures.push({ kind: 'account', id: result.body.id, userId: user.id, currency, initialBalance, createdByNormalApi: true, run }); await save();
  return result.body;
}

try {
  assert.equal(process.env.ZARIX_EMPTY_FOLLOWUP_WINDOW,'parent-released-after-three-cases');
  assert.equal(process.env.ZARIX_ISOLATED_DATABASE_CONFIRM,'synthetic-only');
  const priorFile=path.resolve(process.env.ZARIX_EMPTY_PRIOR_REPORT||'');
  assert.ok(priorFile.startsWith(runtime+'/empty-account-contracts-')&&priorFile.endsWith('/verification.json'));
  priorReportBytes=await privateBytes(priorFile);priorReport=JSON.parse(priorReportBytes);
  assert.equal(priorReport.sourceStable,true);assert.equal(priorReport.acceptanceGuardsSatisfied,true);assert.equal(priorReport.localSessionCleanup.allOwnSessionsClosed,true);
  assert.deepEqual(priorReport.cases.map(x=>x.case_id),['CP3-03','CP3-07','CP2-01']);for(const id of['CP3-03','CP2-01']){const row=priorReport.cases.find(x=>x.case_id===id);assert.equal(row.status,'PASS');assert.equal(row.complete_original_contract,true);}
  const priorEmpty=priorReport.cases.find(x=>x.case_id==='CP3-07');
  if(priorEmpty.status!=='PASS'){assert.equal(priorReport.run,'57d4f74e-3dcb-487c-821d-569363972055');assert.equal(digest(priorReportBytes),'6c07f7acfd23f1832b650288edbe8cb745a79e87956074d8f2e2244d9e5514a8');assert.equal(priorEmpty.status,'FAIL');assert.equal(priorEmpty.failure.location,'ssr-contracts.mjs:46:10');assert.equal(priorEmpty.assertions.length,15);assert.ok(priorEmpty.assertions.every(x=>x.status==='PASS'));report.priorHarnessFailurePreserved={case_id:'CP3-07',status:'FAIL',phase:'Actual empty Hero/history/snapshot preconditions passed; AccountCards RSC parser failed before original completion. Parent authorized independent followups using preserved actual state. No CP3-07 PASS claimed here.',sha256:digest(priorReportBytes)};}

  const targetsFile = path.join(privateRoot, 'targets.json'), targetsBytes = await privateBytes(targetsFile), targets = JSON.parse(targetsBytes);
  assert.equal(targets.purpose, 'empty-account-http-replica');
  assert.ok(targets.ready === true || targets.status === 'PASS_READY' || targets.status === 'READY', 'Actual Native readiness must precede this released runner');
  assert.equal(targets.authUpstream, 'http://127.0.0.1:60327');
  assert.equal(targets.originalAuthUpstream, 'http://127.0.0.1:55321');
  assert.equal(targets.authIsolation, 'separate-cache-binary-on-new-database');
  assert.equal(targets.apiOrigin, 'http://127.0.0.1:60321');
  assert.equal(targets.restOrigin, 'http://127.0.0.1:60323');
  assert.equal(targets.quoteOrigin, 'http://127.0.0.1:57914');
  assert.equal(path.resolve(targets.quoteControlFile), path.join(privateRoot, 'empty-quote-control.json'));
  for (const file of [targets.quoteJournalFile, targets.quoteServerStateFile]) assert.ok(path.resolve(file).startsWith(privateRoot + '/'));
  assert.match(targets.quoteSourceSha256, /^[a-f0-9]{64}$/);
  const quoteIdentity = state => ({ pid: state.pid, sourceSha256: state.sourceSha256, origin: state.origin, startedAt: state.startedAt });
  const quoteState = quoteIdentity(JSON.parse(await privateBytes(targets.quoteServerStateFile)));
  assert.equal(quoteState.pid, targets.quotePid); assert.equal(quoteState.sourceSha256, targets.quoteSourceSha256); assert.equal(quoteState.origin, targets.quoteOrigin); assert.ok(typeof quoteState.startedAt === 'string');
  process.kill(quoteState.pid, 0);
  const envBytes = await privateBytes(path.join(runtime, 'empty-proof.env')), loadedConfig = dotenv.parse(envBytes); config=loadedConfig;
  const { apiUrl, databaseUrl } = isolatedNativeTargets({ ZARIX_ISOLATED_DATABASE_CONFIRM: 'synthetic-only', ZARIX_LOCAL_SUPABASE_URL: config.ZARIX_EMPTY_SUPABASE_URL, ZARIX_LOCAL_DATABASE_URL: config.ZARIX_EMPTY_DATABASE_URL });
  assert.equal(apiUrl.origin, targets.apiOrigin);
  assert.match(targets.newDatabaseName, /^zarix_empty_[a-f0-9]{12}4[a-f0-9]{3}[89ab][a-f0-9]{15}$/);
  assert.equal(databaseUrl.hostname, '127.0.0.1'); assert.equal(databaseUrl.port, '55322'); assert.equal(decodeURIComponent(databaseUrl.pathname.slice(1)), targets.newDatabaseName); assert.notEqual(targets.newDatabaseName, 'postgres');
  assert.equal(new URL(targets.newDatabaseUrl).href, databaseUrl.href);
  const originalUrl = new URL(targets.originalDatabaseUrl); assert.equal(originalUrl.hostname, '127.0.0.1'); assert.equal(originalUrl.port, '55322'); assert.equal(originalUrl.pathname, '/postgres');
  databaseUrl.username = 'supabase_admin'; originalUrl.username = 'supabase_admin'; targetPg = isolatedPgEnvironment(databaseUrl); originalPg = isolatedPgEnvironment(originalUrl); psql = path.join(config.ZARIX_PG_BIN, 'psql');
  const restoreConfig = dotenv.parse(await privateBytes(path.join(runtime, 'restore.env')));
  assert.equal(config.ZARIX_EMPTY_ANON_KEY, restoreConfig.ZARIX_RESTORE_ANON_KEY); assert.equal(config.ZARIX_EMPTY_SERVICE_ROLE_KEY, restoreConfig.ZARIX_RESTORE_SERVICE_ROLE_KEY);
  const buildBytes = await privateBytes(path.join(runtime, 'empty-proof-build-proof.json')); build=JSON.parse(buildBytes);
  const stateBytes = await privateBytes(path.join(runtime, 'empty-proof-clock-app-state.json')); state=JSON.parse(stateBytes);
  const observationBytes = await privateBytes(path.join(runtime, 'empty-proof-clock-observation.json')), observation = JSON.parse(observationBytes);
  const appEnvBytes = await privateBytes(path.join(runtime, 'empty-proof-app.env')); appEnv=dotenv.parse(appEnvBytes);
  assert.equal(build.exitCode, 0); assert.equal(build.revision, revision); assert.equal(build.copyRoot, '/tmp/zarix-app-empty-account-20261015'); assert.equal(build.publicSupabaseOrigin, targets.apiOrigin); assert.ok(Array.isArray(build.sources) && build.sources.length > 0);
  assert.equal(digest(JSON.stringify(build.sources)), build.sourceManifestSha256); assert.equal(build.privateEnvSha256, digest(appEnvBytes));
  assert.equal(state.purpose, 'empty-account-proof'); assert.equal(state.runtimeProfile, 'empty-core-closure'); assert.equal(state.coreDirectory, 'core-closure'); assert.equal(state.appOrigin, 'http://127.0.0.1:3004'); assert.equal(state.apiOrigin, targets.apiOrigin); assert.equal(state.revision, revision); assert.equal(state.buildId, build.buildId); assert.equal(state.copyRoot, build.copyRoot);
  assert.equal(appEnv.NEXT_PUBLIC_SUPABASE_URL, targets.apiOrigin); assert.equal(appEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY, config.ZARIX_EMPTY_ANON_KEY); assert.equal(appEnv.SUPABASE_SERVICE_ROLE_KEY, config.ZARIX_EMPTY_SERVICE_ROLE_KEY);
  for (const key of ['CRIPTOYA_API_URL', 'DOLARAPI_URL', 'COINGECKO_API_URL']) assert.equal(new URL(appEnv[key]).origin, targets.quoteOrigin, 'Every configurable market provider must bind this isolated synthetic source');
  assert.equal(observation.fixedTime, '2026-10-06T12:00:00.000Z'); assert.equal(observation.nextPid, state.nextPid); assert.equal(observation.buildId, build.buildId); assert.equal(observation.sourceStable, true);
  assert.equal(observation.observedApplicationTime,observation.fixedTime);assert.equal(digest(observationBytes),state.clockObservationSha256);
  const coreFile = path.join(root, 'docs/tif/v2.13/evidence/technical-20261015/core-closure/verification.json'), coreBytes = await fs.readFile(coreFile), core = JSON.parse(coreBytes); assert.equal(core.codeRevision, revision); assert.equal(core.sourceStable, true); assert.equal(core.sourceWorkingTreeClean, true); assert.ok(Array.isArray(core.sourceManifest) && core.sourceManifest.length > 0);
  assert.equal((await fs.readFile(path.join(build.copyRoot, '.next/BUILD_ID'), 'utf8')).trim(), build.buildId);
  const seen = new Set(), metadata = new Map((build.manifestOnlyMetadata || []).map(file => [file.path, file.sha256])), bound = new Map();
  for (const file of build.sources) {
    const physical = path.resolve(build.copyRoot, file.path); assert.ok(!path.isAbsolute(file.path) && !file.path.split('/').includes('..') && !seen.has(file.path) && physical.startsWith(build.copyRoot + '/')); seen.add(file.path); bound.set(file.path, file.sha256);
    assert.equal(digest(await fs.readFile(physical)), file.sha256);
    if (metadata.has(file.path)) { assert.equal(file.path, 'supabase/.temp/cli-latest'); assert.equal(metadata.get(file.path), file.sha256); }
  }
  for (const file of core.sourceManifest) assert.equal(bound.get(file.path), file.sha256, 'Every frozen core source must be present with its exact tested hash');
  const gitSources = build.sources.filter(file => !metadata.has(file.path)); assert.ok(gitSources.length > 0);
  const git = spawnSync('git', ['cat-file', '--batch'], { cwd: root, env: { ...process.env, DEVELOPER_DIR: '/Library/Developer/CommandLineTools' }, input: gitSources.map(file => `${revision}:${file.path}`).join('\n') + '\n', maxBuffer: 64 * 1024 * 1024 });
  assert.equal(git.status, 0, 'Frozen Git source bytes unavailable; raw diagnostics withheld');
  let cursor = 0;
  for (const file of gitSources) { const end = git.stdout.indexOf(10, cursor); assert.ok(end >= cursor); const header = git.stdout.subarray(cursor, end).toString().split(' '); assert.equal(header[1], 'blob'); const size = Number(header[2]); assert.ok(Number.isSafeInteger(size) && size >= 0); cursor = end + 1; assert.equal(digest(git.stdout.subarray(cursor, cursor + size)), file.sha256); cursor += size + 1; }
  assert.equal(cursor, git.stdout.length);
  const listenerAndCwd = async () => {
    const listener = spawnSync('/usr/sbin/lsof', ['-nP', '-iTCP:3004', '-sTCP:LISTEN', '-Fpn'], { encoding: 'utf8' }); assert.equal(listener.status, 0, 'Exact Next listener absent; raw diagnostics withheld');
    const lines = listener.stdout.split('\n'); assert.deepEqual([...new Set(lines.filter(line => line.startsWith('p')).map(line => Number(line.slice(1))))], [state.nextPid]); assert.ok(lines.includes('n127.0.0.1:3004'));
    const cwd = spawnSync('/usr/sbin/lsof', ['-a', '-p', String(state.nextPid), '-d', 'cwd', '-Fn'], { encoding: 'utf8' }); assert.equal(cwd.status, 0, 'Exact Next cwd absent; raw diagnostics withheld');
    assert.equal(await fs.realpath(cwd.stdout.split('\n').find(line => line.startsWith('n')).slice(1)), await fs.realpath(build.copyRoot));
  };
  await listenerAndCwd();
  // Native's readiness separately pins the actual new PostgREST/gateway processes,
  // binary/config hashes, original RESTORE roles and their RLS/Auth probes.
  process.kill(state.nextPid, 0);
  const ownFiles = ['run.mjs','ssr-recent.mjs','worker-delivery.test-source.ts','worker-delivery.vitest.config.mjs','../account-analysis-contracts/ssr-financial-read.mjs','../../../../../../scripts/lib/test-isolated-native-target.mjs']; assert.equal(digest(await fs.readFile(path.join(root,'lib/services/notification-outbox.ts'))),bound.get('lib/services/notification-outbox.ts'));
  const manifest = await Promise.all(ownFiles.map(async file => ({ path: file, sha256: digest(await fs.readFile(new URL(file, import.meta.url))) })));
  finalProof = async () => {
    for (const file of build.sources) if (digest(await fs.readFile(path.join(build.copyRoot, file.path))) !== file.sha256) return false;
    await listenerAndCwd();
    return digest(await privateBytes(targetsFile)) === digest(targetsBytes) && digest(await privateBytes(path.join(runtime, 'empty-proof-build-proof.json'))) === digest(buildBytes) && digest(await privateBytes(path.join(runtime, 'empty-proof-clock-app-state.json'))) === digest(stateBytes) && digest(await privateBytes(path.join(runtime, 'empty-proof-app.env'))) === digest(appEnvBytes) && digest(await privateBytes(path.join(runtime, 'empty-proof-clock-observation.json'))) === digest(observationBytes) && digest(await fs.readFile(coreFile)) === digest(coreBytes) && (await fs.readFile(path.join(build.copyRoot, '.next/BUILD_ID'), 'utf8')).trim() === build.buildId && JSON.stringify(quoteIdentity(JSON.parse(await privateBytes(targets.quoteServerStateFile)))) === JSON.stringify(quoteState) && (await Promise.all(ownFiles.map(async file => digest(await fs.readFile(new URL(file, import.meta.url)))))).every((sha, i) => sha === manifest[i].sha256);
  };
  await fs.mkdir(output, { recursive: false, mode: 0o700 });

  const loginFile=path.resolve(targets.authLoginFile);if(process.env.ZARIX_EMPTY_LOGINS_FILE)assert.equal(path.resolve(process.env.ZARIX_EMPTY_LOGINS_FILE),loginFile);const logins=JSON.parse(await privateBytes(loginFile));
  assert.equal(logins.users.length, 2);
  for (const credential of logins.users) {
    assert.match(credential.id, /^[0-9a-f-]{36}$/i); assert.match(credential.email, /^zarix-.+@example\.invalid$/i);
    const profiles = [targetPg, originalPg].map(env => rows(`SELECT id,md5(to_jsonb(u)::text) AS profile_md5 FROM public.users u WHERE id=${lit(credential.id)}`, env)); assert.deepEqual(profiles[0], profiles[1]); assert.equal(profiles[0].length, 1);
    const jar = new Map(), client = createServerClient(apiUrl.href, config.ZARIX_EMPTY_ANON_KEY, { cookies: { getAll: () => [...jar].map(([name, value]) => ({ name, value })), setAll: cookies => { for (const { name, value } of cookies) jar.set(name, value); } }, global: { fetch: isolatedApiFetch } });
    const signed = await client.auth.signInWithPassword({ email: credential.email, password: credential.password }); assert.equal(signed.error, null); assert.equal((await client.auth.getUser()).data.user?.id, credential.id); sessions.push({ id: credential.id, jar, client });
  }
  const [a, b] = sessions;
  clonedBId=b.id;
  assert.equal(priorReport.binding.databaseName,targets.newDatabaseName);assert.equal(priorReport.binding.buildId,build.buildId);assert.equal(priorReport.binding.sourceManifestSha256,build.sourceManifestSha256);
  assert.equal(priorReport.binding.normalUsers.find(x=>x.logicalLabel==='B').id,b.id);
  priorSnapshotId=priorReport.cleanup.ownedSnapshotId;assert.match(priorSnapshotId,/^[a-f0-9-]{36}$/i);
  const snapshotRows=rows(`SELECT * FROM public.net_worth_snapshots WHERE user_id=${lit(b.id)}`);assert.equal(snapshotRows.length,1);assert.equal(snapshotRows[0].id,priorSnapshotId);assert.equal(snapshotRows[0].snapshot_date,'2026-10-06');
  const firstCase=priorReport.cases.find(x=>x.case_id==='CP2-01'),priorAccountId=firstCase.evidence.createdAccountId;
  assert.equal(rows(`SELECT * FROM public.accounts WHERE id=${lit(priorAccountId)} AND user_id=${lit(b.id)} AND name='BancoARS' AND balance=50000 AND is_active`).length,1);
  assert.equal(Number(sql('SELECT count(*) FROM public.recurring_rules')),0);assert.equal(Number(sql('SELECT count(*) FROM public.notification_outbox')),0);
  if(selected==='CP1-01'){assert.equal(Number(sql(`SELECT count(*) FROM public.accounts WHERE user_id=${lit(b.id)}`)),1);assert.equal(Number(sql(`SELECT count(*) FROM public.transactions WHERE user_id=${lit(b.id)}`)),1);const emptyCase=priorReport.cases.find(x=>x.case_id==='CP3-07'),absence=emptyCase.assertions.find(x=>x.name==='CP3-07 no prior synthetic history is presented as existing history');assert.equal(absence.status,'PASS');assert.equal(absence.actual,0);assert.deepEqual(snapshotRows,firstCase.evidence.snapshot.after);}
  report.priorThreeCaseEvidence={sha256:digest(priorReportBytes),run:priorReport.run,caseIds:priorReport.cases.map(x=>x.case_id),acceptanceEligible:priorReport.acceptanceEligible,ownedSnapshotId:priorSnapshotId,originalAccountId:priorAccountId,scope:'Exact same new DB/build and prior accepted normalAuth fixture. SnapshotB is harness-created ownership, not a restored original.'};
  report.ownedSnapshotBefore=snapshotRows[0];
  targetOriginals=inventory(targetPg);restoreOriginals=inventory(originalPg);
  report.binding = { nativeTargetsSha256: digest(targetsBytes), appBuildProofSha256: digest(buildBytes), clockObservationSha256: digest(observationBytes), coreVerificationSha256: digest(coreBytes), revision, buildId: build.buildId, copyRoot: build.copyRoot, appOrigin: state.appOrigin, apiOrigin: targets.apiOrigin, restOrigin: targets.restOrigin, databaseName: targets.newDatabaseName, databasePort: 55322, authUpstream: targets.authUpstream, originalAuthUpstream: targets.originalAuthUpstream, authIsolation: targets.authIsolation, completeAuthRestorationClaimed: false, storageCoverage: 'Explicitly unavailable404; not tested', physicalSourceCount: build.sources.length, frozenGitSourceCount: gitSources.length, allPhysicalSourcesVerified: true, allVersionedSourcesMatchFrozenGit: true, ownedListenerAndCwdVerified: true, sourceManifestSha256: build.sourceManifestSha256, normalUsers: sessions.map((user, index) => ({ id: user.id, logicalLabel: index ? 'B' : 'A' })) };
  report.harnessManifest = manifest;
  c = { user: a, appOrigin: state.appOrigin, copyRoot: build.copyRoot, productRevision: revision, nativeProofVerified: true, sourceManifestVerified: true, digest, lit, sql, rows, check, near, serverGet: endpoint => http('GET', endpoint, undefined, c.user), apiGet: endpoint => http('GET', endpoint, undefined, c.user) };
  report.routingPreflight=[];
  for(const user of sessions){const rest=await user.client.from('accounts').select('id');assert.equal(rest.error,null);const next=await http('GET','/api/accounts?lite=1',undefined,user);assert.equal(next.status,200);const expected=rows(`SELECT id FROM public.accounts WHERE user_id=${lit(user.id)} AND is_active ORDER BY id`).map(x=>x.id).sort();assert.deepEqual(rest.data.map(x=>x.id).sort(),rows(`SELECT id FROM public.accounts WHERE user_id=${lit(user.id)} ORDER BY id`).map(x=>x.id).sort());assert.deepEqual(next.body.map(x=>x.id).sort(),expected);report.routingPreflight.push({userId:user.id,normalJwtRestMatchesTarget:true,actualNextReferencesMatchTarget:true});}
  c.user=b;c.ownedSnapshotId=priorSnapshotId;
  assert.ok(!appEnv.TELEGRAM_ADMIN_CHAT_ID,'No external admin Telegram notifications permitted');
  assert.equal(observation.fixedTime,'2026-10-06T12:00:00.000Z');


  await exact(selected,async()=>{
    if(selected==='CP1-01'){
      const created=await account(b,10000,'ARS',`EmptyFollowup101 ${run}`),accountId=created.id;
      const categoryList=await http('GET','/api/categories',undefined,b);check('Normal category list200',categoryList.status,200);
      let category=categoryList.body.find(x=>x.user_id===b.id&&x.name==='Alimentos'&&x.type==='expense');
      if(!category){const response=await http('POST','/api/categories',{name:'Alimentos',type:'expense',icon:'🍎'},b);check('Own literal Alimentos category201',response.status,201);category=response.body;report.fixtures.push({kind:'category',id:category.id,userId:b.id,name:'Alimentos'});}
      const before=rows(`SELECT * FROM public.transactions WHERE account_id=${lit(accountId)} ORDER BY id`);check('New account has exactly its opening adjustment',before.map(x=>({type:x.type,amount:Number(x.amount)})),[{type:'adjustment',amount:10000}]);
      const made=await http('POST','/api/transactions',{type:'expense',accountId,amount:1500,currency:'ARS',categoryId:category.id,description:`EmptyFollowup101 ${run}`,transactionDate:'2026-10-06T12:00:00Z'},b);check('Normal literal expense API201',made.status,201);
      const economic=rows(`SELECT * FROM public.transactions WHERE account_id=${lit(accountId)} AND type<>'adjustment' ORDER BY id`);
      check('Exactly one economic row persists',{count:economic.length,id:economic[0]?.id,user:economic[0]?.user_id,amount:Number(economic[0]?.amount),currency:economic[0]?.currency,category:economic[0]?.category_id,date:economic[0]?.transaction_date.slice(0,10)},{count:1,id:made.body.id,user:b.id,amount:1500,currency:'ARS',category:category.id,date:'2026-10-06'});
      near('Literal expense leaves8500',Number(sql(`SELECT balance FROM public.accounts WHERE id=${lit(accountId)}`)),8500);
      const listed=await http('GET',`/api/transactions?accountId=${accountId}&type=expense`,undefined,b);check('Actual list API contains same1500 identity',{status:listed.status,rows:listed.body.map(x=>({id:x.id,amount:Number(x.amount)}))},{status:200,rows:[{id:made.body.id,amount:1500}]});
      const ssr=await readRecentDashboard(c,made.body.id,accountId,category.id);report.ownedSnapshotAfter=ssr.snapshot.after[0];
      return{accountId,transactionId:made.body.id,categoryId:category.id,ssr,scope:'Actual new-fixture normalAuth API/SQL and compiledSSRDashboard top5/HTML, not a composition that assumes historical membership.'};
    }
    assert.equal(selected,'CP1-24');
    const planBefore=rows(`SELECT status,current_period_end,grace_period_end,telegram_chat_id,updated_at,(telegram_bot_token IS NULL)AS bot_token_is_null FROM public.users WHERE id=${lit(b.id)}`)[0];
    check('Synthetic cloned B has no external Telegram credential or existing link',{noBot:planBefore.bot_token_is_null,chat:planBefore.telegram_chat_id},{noBot:true,chat:null});
    const beforeFullProfileHash=sql(`SELECT md5(to_jsonb(u)::text) FROM public.users u WHERE id=${lit(b.id)}`);
    const affected=writeOwnFixture(`WITH changed AS(UPDATE public.users SET status='ACTIVE',current_period_end='2026-11-06T12:00:00Z',grace_period_end=NULL,telegram_chat_id=-8600000124 WHERE id=${lit(b.id)} AND telegram_chat_id IS NULL AND telegram_bot_token IS NULL RETURNING id)SELECT count(*) FROM changed`);check('Only exact authorized synthetic B profile fixture updated',Number(affected.split('\n').at(-1)),1);adminFixtureChanged=true;
    report.adminClonedProfileFixture={userId:b.id,before:planBefore,after:rows(`SELECT status,current_period_end,grace_period_end,telegram_chat_id,updated_at,(telegram_bot_token IS NULL)AS bot_token_is_null FROM public.users WHERE id=${lit(b.id)}`)[0],beforeFullProfileHash,afterFullProfileHash:sql(`SELECT md5(to_jsonb(u)::text) FROM public.users u WHERE id=${lit(b.id)}`),allowedFields:allowedProfileFields,scope:'Only this new UUID database cloned B profile; parent-authorized Premium and fictional chat fixture, retained intentionally. No original user, bot token, real link, payment or persistent external access change.'};
    const created=await account(b,10000,'ARS',`EmptyFollowup124 ${run}`),accountId=created.id;
    const made=await http('POST','/api/recurring',{accountId,type:'expense',amount:1000,currency:'ARS',description:`EmptyFollowup124 ${run}`,frequency:'daily',startDate:'2026-10-01',notificationEnabled:true},b);check('Normal owned recurring rule201',made.status,201);const ruleId=made.body.id;ownRules.add(ruleId);report.fixtures.push({kind:'recurring_rule',id:ruleId,userId:b.id,accountId});
    const marked=await b.client.from('recurring_rules').update({last_executed_date:'2026-10-05'}).eq('id',ruleId).eq('user_id',b.id).select('id,last_executed_date').single();check('Normal RLS initializes only owned new rule last5Oct',{error:marked.error?{code:marked.error.code}:null,id:marked.data?.id,date:marked.data?.last_executed_date},{error:null,id:ruleId,date:'2026-10-05'});
    const pre=rows(`SELECT * FROM public.recurring_rules WHERE id=${lit(ruleId)}`)[0];check('Literal active daily rule precondition',{active:pre.is_active,frequency:pre.frequency,start:pre.start_date,last:pre.last_executed_date,amount:Number(pre.amount),notification:pre.notification_enabled},{active:true,frequency:'daily',start:'2026-10-01',last:'2026-10-05',amount:1000,notification:true});
    assert.ok(typeof appEnv.CRON_SECRET==='string'&&appEnv.CRON_SECRET.length>=16,'Existing local cron capability required; value withheld');
    async function cron(label){const record={caseId:selected,method:'GET',path:'/api/cron/recurring',label,startedAt:new Date().toISOString(),startedMonotonic:performance.now(),state:'DISPATCHING'};report.requests.push(record);try{const response=await fetch(c.appOrigin+'/api/cron/recurring',{headers:{Authorization:'Bearer '+appEnv.CRON_SECRET},redirect:'error',signal:AbortSignal.timeout(55000)}),text=await response.text();Object.assign(record,{status:response.status,responseSha256:digest(text),endedAt:new Date().toISOString(),endedMonotonic:performance.now(),state:'COMPLETED'});return{status:response.status,body:JSON.parse(text),record};}catch(error){Object.assign(record,{state:'FAILED_TRANSPORT',errorType:error.name,endedMonotonic:performance.now()});throw error;}}
    const settled=await Promise.allSettled([cron('concurrent1'),cron('concurrent2')]);await save();assert.ok(settled.every(x=>x.status==='fulfilled'),'Both real HTTP dispatches must settle successfully before replay');const concurrent=settled.map(x=>x.value);
    check('Both actual HTTP calls started before first response',Math.max(...concurrent.map(x=>x.record.startedMonotonic))<Math.min(...concurrent.map(x=>x.record.endedMonotonic)),true);
    const replay=await cron('sameDayRetry');await save();check('Two concurrent cron calls plus same-date retry200',[...concurrent,replay].map(x=>x.status),[200,200,200]);check('No hidden cron item error',[...concurrent,replay].map(x=>Number(x.body.errors)),[0,0,0]);
    const requestId=`recurring:${ruleId}:2026-10-06`,economic=rows(`SELECT * FROM public.transactions WHERE recurring_rule_id=${lit(ruleId)} ORDER BY id`),intents=rows(`SELECT id,user_id,event_key,payload,attempts,delivered_at FROM public.notification_outbox ORDER BY id`);
    check('One exact recurring expense, marker, balance and outbox',{rows:economic.length,type:economic[0]?.type,amount:Number(economic[0]?.amount),date:economic[0]?.transaction_date.slice(0,10),balance:Number(sql(`SELECT balance FROM public.accounts WHERE id=${lit(accountId)}`)),marker:sql(`SELECT last_executed_date FROM public.recurring_rules WHERE id=${lit(ruleId)}`),outbox:intents.length},{rows:1,type:'expense',amount:1000,date:'2026-10-06',balance:9000,marker:'2026-10-06',outbox:1});
    check('Outbox identity matches one own committed occurrence',{key:intents[0]?.event_key,user:intents[0]?.user_id,transactionId:intents[0]?.payload.transactionId,delivered:intents[0]?.delivered_at},{key:requestId,user:b.id,transactionId:economic[0].id,delivered:null});
    const workerInput={purpose:'empty-followup-worker',apiOrigin:'http://127.0.0.1:60321',userId:b.id,accountId,ruleId,requestId,outboxId:intents[0].id,syntheticChatId:-8600000124,description:pre.description,outputFile:path.join(output,'worker-observation.json')};
    const workerFile=path.join(output,'worker-input.json');await fs.writeFile(workerFile,JSON.stringify(workerInput,null,2)+'\n',{mode:0o600,flag:'wx'});
    const args=['node_modules/vitest/vitest.mjs','run','--config','docs/tif/v2.13/evidence/technical-20261015/empty-followup-contracts/worker-delivery.vitest.config.mjs','--reporter=json','--outputFile='+path.join(output,'worker-result.json')];
    const worker=spawnSync(process.execPath,args,{cwd:root,env:{...process.env,ZARIX_CP124_WORKER_CONFIG:workerFile,ZARIX_ISOLATED_DATABASE_CONFIRM:'synthetic-only'},encoding:'utf8',timeout:60000,maxBuffer:8*1024*1024});await fs.writeFile(path.join(output,'worker-stdout.log'),worker.stdout||'',{mode:0o600});await fs.writeFile(path.join(output,'worker-stderr.log'),worker.stderr||'',{mode:0o600});check('Actual worker focal with same real service-role DB exits0',worker.status,0);const workerObserved=JSON.parse(await privateBytes(workerInput.outputFile));check('Provider double accepts one notice without new financial effect',{status:workerObserved.status,count:workerObserved.accepted.length,sameFinancial:workerObserved.sameFinancialRows},{status:'PASS',count:1,sameFinancial:true});
    report.workerExecution={command:[process.execPath,...args],exitCode:worker.status,observation:workerObserved,scope:'Additional isolated focal using real service-role Supabase client to the same new DB; only Telegram sender is doubled. Not part of913 global CI6.'};
    return{accountId,ruleId,requestId,transactionId:economic[0].id,concurrentResponses:concurrent.map(x=>({status:x.status,body:x.body,startedAt:x.record.startedAt,endedAt:x.record.endedAt})),retryResponse:{status:replay.status,body:replay.body},worker:workerObserved};
  });
  report.sourceStable=await finalProof();assert.equal(report.sourceStable,true);
} catch(error){report.status='FAIL';report.fatal={type:error.name,location:String(error.stack).match(/(?:run|ssr-recent)\.mjs:\d+:\d+/)?.[0]||'precondition',context:'Exact followup binding, fixture or contract assertion failed; private diagnostics withheld'};}
finally{
  // Cleanup only identities created by this run; retain all history/outbox/owned snapshot.
  for(const ruleId of ownRules)try{const result=await http('PUT','/api/recurring/'+ruleId,{isActive:false},sessions[1]);(report.fixtureCleanup||=[]).push({kind:'deactivateOwnNewRule',id:ruleId,status:result.status});if(result.status!==200)report.cleanupFailed=true;}catch{report.cleanupFailed=true;}
  for(const accountId of ownAccounts)try{const result=await http('DELETE','/api/accounts/'+accountId,undefined,sessions[1]);(report.fixtureCleanup||=[]).push({kind:'archiveOwnNewAccount',id:accountId,status:result.status});if(result.status!==204)report.cleanupFailed=true;}catch{report.cleanupFailed=true;}
  if(targetOriginals)try{report.fixtureOriginalIntegrity=compare(targetOriginals,targetPg);}catch{report.fixtureIntegrityUnavailable=true;}
  if(restoreOriginals)try{report.restoreOriginalIntegrity=compareWhole(restoreOriginals,originalPg);}catch{report.restoreIntegrityUnavailable=true;}
  if(finalProof)try{report.sourceStable=await finalProof();}catch{report.sourceStable=false;}
  report.sessions=[];for(const session of sessions)try{const result=await session.client.auth.signOut({scope:'local'});report.sessions.push({userId:session.id,localSignOutError:result.error?{name:result.error.name}:null,closed:result.error===null});}catch{report.sessions.push({userId:session.id,closed:false});}
  report.finishedAt=new Date().toISOString();const integrity=[...(report.fixtureOriginalIntegrity||[]),...(report.restoreOriginalIntegrity||[])];report.preservationScope={protectedTablesPerDatabase:13,originalRestoreAllFullRows:true,fixtureOwnedSnapshotExcluded:selected==='CP1-01'?priorSnapshotId:null,clonedBAllowedFixtureFields:selected==='CP1-24'?allowedProfileFields:[],authorizedClonedBFixtureApplied:adminFixtureChanged,allOtherOriginalFieldsUnchanged:integrity.length===26&&integrity.every(x=>x.unchanged)};
  report.acceptanceGuardsSatisfied=report.preservationScope.allOtherOriginalFieldsUnchanged&&report.sourceStable===true&&!report.cleanupFailed&&report.sessions.length===2&&report.sessions.every(x=>x.closed);report.status=cases.every(x=>x.status==='PASS')&&report.acceptanceGuardsSatisfied?'PASS':'FAIL';report.acceptanceEligible=report.status==='PASS';if(!report.acceptanceEligible)for(const result of cases)result.complete_original_contract=false;
  try{await save();}catch{/* Refused unreleased preflight creates no output. */}console.log(JSON.stringify({status:report.status,case:selected,output,acceptanceEligible:report.acceptanceEligible,fatal:report.fatal||null}));process.exitCode=report.status==='PASS'?0:1;
}
