// Prepared source only. No product changes, provisioning, process starts or cleanup.
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
import { readEmptyDashboard, readFirstAccountDashboard, readUnavailableDashboard } from './ssr-contracts.mjs';

const root = fileURLToPath(new URL('../../../../../../', import.meta.url));
const runtime = '/tmp/zarix-runtime-20261015';
const privateRoot = path.join(runtime, 'empty-account-private');
const revision = '84df929ab2f169251a49f3e95d0e0c148dfcb87c';
const digest = value => createHash('sha256').update(value).digest('hex');
const lit = value => `'${String(value).replaceAll("'", "''")}'`;
const run = randomUUID();
const output = path.join(runtime, 'empty-account-contracts-' + run);
const cases = ['CP3-03', 'CP3-07', 'CP2-01'].map(case_id => ({ case_id, status: 'BLOCKED', complete_original_contract: false, assertions: [] }));
const report = { run, startedAt: new Date().toISOString(), status: 'RUNNING', scope: 'Three exact original API/SSR contracts on the new UUID fixture database. Separate cached GoTrue uses only the same two cloned identities/keys; this is not full Auth-restoration evidence. No browser, Storage or original-service mutation.', cases, requests: [], fixtures: [] };
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
function inventory(env) { return tables.map(table => { const ids = rows(`SELECT id FROM public.${table} ORDER BY id`, env).map(row => row.id); return { table, ids, count: ids.length, md5: sql(`SELECT md5(COALESCE(jsonb_agg(to_jsonb(q) ORDER BY q.id)::text,'[]')) FROM public.${table} q`, env) }; }); }
function compare(before, env) { return before.map(old => { const where = old.ids.length ? old.ids.map(lit).join(',') : 'NULL'; const after = rows(`SELECT count(*)::int AS count,md5(COALESCE(jsonb_agg(to_jsonb(q) ORDER BY q.id)::text,'[]')) AS md5 FROM public.${old.table} q WHERE id IN(${where})`, env)[0]; return { table: old.table, originalRows: old.count, beforeMd5: old.md5, afterMd5: after.md5, unchanged: old.count === after.count && old.md5 === after.md5 }; }); }
function compareWhole(before, env) { return before.map(old => { const after = rows(`SELECT count(*)::int AS count,md5(COALESCE(jsonb_agg(to_jsonb(q) ORDER BY q.id)::text,'[]')) AS md5 FROM public.${old.table} q`, env)[0]; return { table: old.table, comparison: 'complete-table-no-new-rows-permitted', originalRows: old.count, afterRows: after.count, beforeMd5: old.md5, afterMd5: after.md5, unchanged: old.count === after.count && old.md5 === after.md5 }; }); }
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
  assert.equal(process.env.ZARIX_EMPTY_ACCOUNT_WINDOW, 'parent-released-after-native-ready');
  assert.equal(process.env.ZARIX_ISOLATED_DATABASE_CONFIRM, 'synthetic-only');
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
  const envBytes = await privateBytes(path.join(runtime, 'empty-proof.env')), config = dotenv.parse(envBytes);
  const { apiUrl, databaseUrl } = isolatedNativeTargets({ ZARIX_ISOLATED_DATABASE_CONFIRM: 'synthetic-only', ZARIX_LOCAL_SUPABASE_URL: config.ZARIX_EMPTY_SUPABASE_URL, ZARIX_LOCAL_DATABASE_URL: config.ZARIX_EMPTY_DATABASE_URL });
  assert.equal(apiUrl.origin, targets.apiOrigin);
  assert.match(targets.newDatabaseName, /^zarix_empty_[a-f0-9]{12}4[a-f0-9]{3}[89ab][a-f0-9]{15}$/);
  assert.equal(databaseUrl.hostname, '127.0.0.1'); assert.equal(databaseUrl.port, '55322'); assert.equal(decodeURIComponent(databaseUrl.pathname.slice(1)), targets.newDatabaseName); assert.notEqual(targets.newDatabaseName, 'postgres');
  assert.equal(new URL(targets.newDatabaseUrl).href, databaseUrl.href);
  const originalUrl = new URL(targets.originalDatabaseUrl); assert.equal(originalUrl.hostname, '127.0.0.1'); assert.equal(originalUrl.port, '55322'); assert.equal(originalUrl.pathname, '/postgres');
  databaseUrl.username = 'supabase_admin'; originalUrl.username = 'supabase_admin'; targetPg = isolatedPgEnvironment(databaseUrl); originalPg = isolatedPgEnvironment(originalUrl); psql = path.join(config.ZARIX_PG_BIN, 'psql');
  const restoreConfig = dotenv.parse(await privateBytes(path.join(runtime, 'restore.env')));
  assert.equal(config.ZARIX_EMPTY_ANON_KEY, restoreConfig.ZARIX_RESTORE_ANON_KEY); assert.equal(config.ZARIX_EMPTY_SERVICE_ROLE_KEY, restoreConfig.ZARIX_RESTORE_SERVICE_ROLE_KEY);
  const buildBytes = await privateBytes(path.join(runtime, 'empty-proof-build-proof.json')), build = JSON.parse(buildBytes);
  const stateBytes = await privateBytes(path.join(runtime, 'empty-proof-clock-app-state.json')), state = JSON.parse(stateBytes);
  const observationBytes = await privateBytes(path.join(runtime, 'empty-proof-clock-observation.json')), observation = JSON.parse(observationBytes);
  const appEnvBytes = await privateBytes(path.join(runtime, 'empty-proof-app.env')), appEnv = dotenv.parse(appEnvBytes);
  assert.equal(build.exitCode, 0); assert.equal(build.revision, revision); assert.equal(build.copyRoot, '/tmp/zarix-app-empty-account-20261015'); assert.equal(build.publicSupabaseOrigin, targets.apiOrigin); assert.ok(Array.isArray(build.sources) && build.sources.length > 0);
  assert.equal(digest(JSON.stringify(build.sources)), build.sourceManifestSha256); assert.equal(build.privateEnvSha256, digest(appEnvBytes));
  assert.equal(state.purpose, 'empty-account-proof'); assert.equal(state.runtimeProfile, 'empty-core-closure'); assert.equal(state.coreDirectory, 'core-closure'); assert.equal(state.appOrigin, 'http://127.0.0.1:3004'); assert.equal(state.apiOrigin, targets.apiOrigin); assert.equal(state.revision, revision); assert.equal(state.buildId, build.buildId); assert.equal(state.copyRoot, build.copyRoot);
  assert.equal(appEnv.NEXT_PUBLIC_SUPABASE_URL, targets.apiOrigin); assert.equal(appEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY, config.ZARIX_EMPTY_ANON_KEY); assert.equal(appEnv.SUPABASE_SERVICE_ROLE_KEY, config.ZARIX_EMPTY_SERVICE_ROLE_KEY);
  for (const key of ['CRIPTOYA_API_URL', 'DOLARAPI_URL', 'COINGECKO_API_URL']) assert.equal(new URL(appEnv[key]).origin, targets.quoteOrigin, 'Every configurable market provider must bind this isolated synthetic source');
  assert.equal(observation.fixedTime, '2026-10-06T12:00:00.000Z'); assert.equal(observation.nextPid, state.nextPid); assert.equal(observation.buildId, build.buildId); assert.equal(observation.sourceStable, true);
  assert.equal(observation.observedApplicationTime, observation.fixedTime); assert.equal(digest(observationBytes), state.clockObservationSha256);
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
  const ownFiles = ['run.mjs', 'ssr-contracts.mjs', '../account-analysis-contracts/ssr-financial-read.mjs', '../../../../../../scripts/lib/test-isolated-native-target.mjs']; const manifest = await Promise.all(ownFiles.map(async file => ({ path: file, sha256: digest(await fs.readFile(new URL(file, import.meta.url))) })));
  finalProof = async () => {
    for (const file of build.sources) if (digest(await fs.readFile(path.join(build.copyRoot, file.path))) !== file.sha256) return false;
    await listenerAndCwd();
    return digest(await privateBytes(targetsFile)) === digest(targetsBytes) && digest(await privateBytes(path.join(runtime, 'empty-proof-build-proof.json'))) === digest(buildBytes) && digest(await privateBytes(path.join(runtime, 'empty-proof-clock-app-state.json'))) === digest(stateBytes) && digest(await privateBytes(path.join(runtime, 'empty-proof-app.env'))) === digest(appEnvBytes) && digest(await privateBytes(path.join(runtime, 'empty-proof-clock-observation.json'))) === digest(observationBytes) && digest(await fs.readFile(coreFile)) === digest(coreBytes) && (await fs.readFile(path.join(build.copyRoot, '.next/BUILD_ID'), 'utf8')).trim() === build.buildId && JSON.stringify(quoteIdentity(JSON.parse(await privateBytes(targets.quoteServerStateFile)))) === JSON.stringify(quoteState) && (await Promise.all(ownFiles.map(async file => digest(await fs.readFile(new URL(file, import.meta.url)))))).every((sha, i) => sha === manifest[i].sha256);
  };
  await fs.mkdir(output, { recursive: false, mode: 0o700 });
  targetOriginals = inventory(targetPg); restoreOriginals = inventory(originalPg);
  const loginFile = process.env.ZARIX_EMPTY_LOGINS_FILE || targets.authLoginFile; assert.equal(loginFile, targets.authLoginFile); const logins = JSON.parse(await privateBytes(loginFile));
  assert.equal(logins.users.length, 2);
  for (const credential of logins.users) {
    assert.match(credential.id, /^[0-9a-f-]{36}$/i); assert.match(credential.email, /^zarix-.+@example\.invalid$/i);
    const profiles = [targetPg, originalPg].map(env => rows(`SELECT id,md5(to_jsonb(u)::text) AS profile_md5 FROM public.users u WHERE id=${lit(credential.id)}`, env)); assert.deepEqual(profiles[0], profiles[1]); assert.equal(profiles[0].length, 1);
    const jar = new Map(), client = createServerClient(apiUrl.href, config.ZARIX_EMPTY_ANON_KEY, { cookies: { getAll: () => [...jar].map(([name, value]) => ({ name, value })), setAll: cookies => { for (const { name, value } of cookies) jar.set(name, value); } }, global: { fetch: isolatedApiFetch } });
    const signed = await client.auth.signInWithPassword({ email: credential.email, password: credential.password }); assert.equal(signed.error, null); assert.equal((await client.auth.getUser()).data.user?.id, credential.id); sessions.push({ id: credential.id, jar, client });
  }
  const [a, b] = sessions;
  for (const user of sessions) for (const table of ['accounts', 'transactions', 'investments', 'net_worth_snapshots']) assert.equal(Number(sql(`SELECT count(*) FROM public.${table} WHERE user_id=${lit(user.id)}`)), 0, 'New fixture starts empty for both existing identities');
  report.binding = { nativeTargetsSha256: digest(targetsBytes), appBuildProofSha256: digest(buildBytes), clockObservationSha256: digest(observationBytes), coreVerificationSha256: digest(coreBytes), revision, buildId: build.buildId, copyRoot: build.copyRoot, appOrigin: state.appOrigin, apiOrigin: targets.apiOrigin, restOrigin: targets.restOrigin, databaseName: targets.newDatabaseName, databasePort: 55322, authUpstream: targets.authUpstream, originalAuthUpstream: targets.originalAuthUpstream, authIsolation: targets.authIsolation, completeAuthRestorationClaimed: false, storageCoverage: 'Explicitly unavailable404; not tested', physicalSourceCount: build.sources.length, frozenGitSourceCount: gitSources.length, allPhysicalSourcesVerified: true, allVersionedSourcesMatchFrozenGit: true, ownedListenerAndCwdVerified: true, sourceManifestSha256: build.sourceManifestSha256, normalUsers: sessions.map((user, index) => ({ id: user.id, logicalLabel: index ? 'B' : 'A' })) };
  report.harnessManifest = manifest;
  c = { user: a, appOrigin: state.appOrigin, copyRoot: build.copyRoot, productRevision: revision, nativeProofVerified: true, sourceManifestVerified: true, digest, lit, sql, rows, check, near, serverGet: endpoint => http('GET', endpoint, undefined, c.user), apiGet: endpoint => http('GET', endpoint, undefined, c.user) };
  report.routingPreflight = [];
  for (const user of sessions) {
    const rest = await user.client.from('accounts').select('id');
    assert.equal(rest.error, null); assert.deepEqual(rest.data, [], 'Normal JWT must observe the new empty fixture through its actual gateway');
    const next = await http('GET', '/api/user/notification-preferences', undefined, user);
    assert.equal(next.status, 200); assert.equal(typeof next.body.weekly_summary_enabled, 'boolean'); assert.equal(typeof next.body.monthly_summary_enabled, 'boolean');
    report.routingPreflight.push({ userId: user.id, normalJwtRestEmpty: true, actualNextNormalAuthControl: true, nextEndpoint: '/api/user/notification-preferences', financialOrQuoteRead: false });
  }
  const controlFile = targets.quoteControlFile, beforeControlBytes = await privateBytes(controlFile), beforeControl = JSON.parse(beforeControlBytes);
  assert.deepEqual({ purpose: beforeControl.purpose, mode: beforeControl.mode, rate: beforeControl.rate, fixedTime: beforeControl.fixedTime }, { purpose: 'isolated-empty-account-quote-control', mode: 'unavailable', rate: 1200, fixedTime: '2026-10-06T12:00:00.000Z' });
  const journalBefore = await quoteJournal(targets.quoteJournalFile);
  assert.ok(journalBefore.entries.every(entry => entry.mode === 'unavailable' && entry.status === 503 && entry.controlSha256 === digest(beforeControlBytes)), 'No successful provider sample may precede the cold-cache contract');
  report.quoteBinding = { ...quoteState, journalPath: path.relative(runtime, targets.quoteJournalFile), initialJournal: journalBefore, scope: 'Only declared synthetic HTTP provider requests; dedicated health checks are excluded from this journal' };
  await save();

  await exact('CP3-03', async () => {
    check('Actual new fixture has no persisted quote cache', Number(sql('SELECT count(*) FROM public.exchange_rates')), 0);
    const ars = await account(a, 120000, 'ARS', `EmptyContracts303ARS ${run}`), usd = await account(a, 100, 'USD', `EmptyContracts303USD ${run}`);
    const before = rows(`SELECT * FROM public.accounts WHERE id IN(${lit(ars.id)},${lit(usd.id)}) ORDER BY id`);
    const quotes = await c.apiGet('/api/cotizaciones'), financial = await c.apiGet('/api/accounts');
    check('No-cache unavailable quote returns the bound API500 rather than an Auth rejection', quotes.status, 500);
    check('Unavailable quote response contains only an explicit safe error', Object.keys(quotes.body).sort(), ['error']);
    check('Mixed wealth returns the bound safe500 rather than fabricated rates or an Auth rejection', financial.status, 500);
    const ssr = await readUnavailableDashboard(c);
    check('Unavailable reads preserve both complete account rows', rows(`SELECT * FROM public.accounts WHERE id IN(${lit(ars.id)},${lit(usd.id)}) ORDER BY id`), before);
    check('Mixed original balances remain120000ARS and100USD', [Number(sql(`SELECT balance FROM public.accounts WHERE id=${lit(ars.id)}`)), Number(sql(`SELECT balance FROM public.accounts WHERE id=${lit(usd.id)}`))], [120000, 100]);
    const journalAfter = await quoteJournal(targets.quoteJournalFile);
    check('Cold provider journal is append-only', journalAfter.entries.slice(0, journalBefore.entries.length), journalBefore.entries);
    check('This exact failed read observed new real503 provider requests', journalAfter.entries.length > journalBefore.entries.length, true);
    check('Every cold provider sample failed with the exact unavailable control', journalAfter.entries.every(entry => entry.mode === 'unavailable' && entry.status === 503 && entry.controlSha256 === digest(beforeControlBytes)), true);
    report.quoteBinding.unavailableJournal = journalAfter;
    return { accountIds: [ars.id, usd.id], statuses: { quotes: quotes.status, wealth: financial.status }, ssr, providerJournal: journalAfter, scope: 'Real failed synthetic HTTP provider/cold-cache integration, normal Auth/API/SSR/native oracles. No external provider outage asserted.' };
  });

  // Only this new provider's private control changes. No original service/cache is reconfigured.
  const currentControlBytes = await privateBytes(controlFile), currentControl = JSON.parse(currentControlBytes); assert.equal(currentControl.mode, 'unavailable'); assert.equal(digest(currentControlBytes), digest(beforeControlBytes));
  const available = { ...currentControl, mode: 'available' }, nextControl = controlFile + '.next-' + run;
  const availableBytes = Buffer.from(JSON.stringify(available, null, 2) + '\n');
  await fs.writeFile(nextControl, availableBytes, { mode: 0o600, flag: 'wx' }); await fs.rename(nextControl, controlFile);
  report.quoteControlTransition = { path: path.relative(runtime, controlFile), previousSha256: digest(currentControlBytes), nextSha256: digest(availableBytes), transition: 'unavailable503→available1200', originalSharedProvidersUntouched: true };
  c.user = b;
  await exact('CP3-07', () => readEmptyDashboard(c));
  await exact('CP2-01', async () => {
    check('CP2-01 literal first account precondition includes archived rows', Number(sql(`SELECT count(*) FROM public.accounts WHERE user_id=${lit(b.id)}`)), 0);
    const created = await account(b, 50000, 'ARS', 'BancoARS');
    return { ...(await readFirstAccountDashboard(c, created.id)), createdAccountId: created.id, patrimonyBeforeARS: 0, patrimonyAfterARS: 50000 };
  });
  const journalAfter = await quoteJournal(targets.quoteJournalFile), unavailable = report.quoteBinding.unavailableJournal || journalBefore;
  assert.deepEqual(journalAfter.entries.slice(0, unavailable.entries.length), unavailable.entries);
  assert.ok(journalAfter.entries.slice(unavailable.entries.length).some(entry => entry.mode === 'available' && entry.status === 200 && entry.controlSha256 === digest(availableBytes)), 'The empty/account contracts must observe a real available1200 provider sample after the control transition');
  report.quoteBinding.finalJournal = journalAfter;
  report.fixtureOriginalIntegrity = compare(targetOriginals, targetPg); report.restoreOriginalIntegrity = compareWhole(restoreOriginals, originalPg);
  assert.ok([...report.fixtureOriginalIntegrity, ...report.restoreOriginalIntegrity].every(row => row.unchanged));
  report.sourceStable = await finalProof(); assert.equal(report.sourceStable, true);
  report.status = cases.every(row => row.status === 'PASS') ? 'PASS' : 'FAIL';
} catch (error) {
  report.status = 'FAIL'; report.fatal = { type: error.name, location: String(error.stack).match(/(?:run|ssr-contracts)\.mjs:\d+:\d+/)?.[0] || 'precondition', context: 'Native/app/source/fixture precondition or preservation failed; private diagnostics withheld' };
} finally {
  if (targetOriginals) { try { report.fixtureOriginalIntegrity ||= compare(targetOriginals, targetPg); } catch { report.fixtureIntegrityUnavailable = true; report.status = 'FAIL'; } }
  if (restoreOriginals) { try { report.restoreOriginalIntegrity ||= compareWhole(restoreOriginals, originalPg); } catch { report.restoreIntegrityUnavailable = true; report.status = 'FAIL'; } }
  const localLogout = [];
  for (const session of sessions) {
    try { const closed = await session.client.auth.signOut({ scope: 'local' }); const confirmed = closed.error === null; localLogout.push({ userId: session.id, ownSessionOnly: true, confirmed }); if (!confirmed) report.localLogoutUnconfirmed = true; }
    catch { localLogout.push({ userId: session.id, ownSessionOnly: true, confirmed: false }); report.localLogoutUnconfirmed = true; }
  }
  report.localSessionCleanup = { sessionsCreated: sessions.length, localLogout, allOwnSessionsClosed: localLogout.length === sessions.length && localLogout.every(result => result.confirmed), globalSignOut: false };
  if (report.localLogoutUnconfirmed) report.status = 'FAIL';
  report.endedAt = new Date().toISOString(); report.counts = Object.fromEntries(['PASS', 'FAIL', 'BLOCKED'].map(status => [status, cases.filter(row => row.status === status).length]));
  const publicIntegrity = [...(report.fixtureOriginalIntegrity || []), ...(report.restoreOriginalIntegrity || [])];
  report.cleanup = { originalPublicRowsUnchanged: publicIntegrity.length === 26 && publicIntegrity.every(row => row.unchanged), preservationScope: 'Thirteen public tables in each database; normal sessions exist only in the isolated Auth clone, not a full Auth-restoration claim', newFinancialFixturesRetained: [...ownAccounts], ownedSnapshotId: c?.ownedSnapshotId || null, processesOrDatabasesStopped: false };
  report.acceptanceGuardsSatisfied = report.cleanup.originalPublicRowsUnchanged && report.sourceStable === true;
  report.acceptanceEligible = report.status === 'PASS' && report.acceptanceGuardsSatisfied;
  if (!report.acceptanceGuardsSatisfied) for (const result of cases) result.complete_original_contract = false;
  try { await save(); } catch { /* A refused unreleased run creates no output directory. */ }
  console.log(JSON.stringify({ status: report.status, counts: report.counts, output, fatal: report.fatal || null })); process.exitCode = report.status === 'PASS' ? 0 : 1;
}
