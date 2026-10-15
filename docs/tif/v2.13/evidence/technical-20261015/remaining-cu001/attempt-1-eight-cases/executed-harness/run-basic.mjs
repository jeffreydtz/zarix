// Normal Auth -> HTTP API -> independent native SQL. No I/O before the explicit gate.
// Only new UUID fixtures in the separately released58321/58322 replica are writable.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import dotenv from 'dotenv';
import { createServerClient } from '@supabase/ssr';
import { isolatedNativeTargets, isolatedPgEnvironment, isolatedApiFetch } from '../../../../../../scripts/lib/test-isolated-native-target.mjs';

const root = fileURLToPath(new URL('../../../../../../', import.meta.url));
const here = path.dirname(fileURLToPath(import.meta.url));
const runtime = '/tmp/zarix-runtime-20261015';
const appOrigin = 'http://127.0.0.1:3002';
const ids = ['CP1-01', 'CP1-02', 'CP1-03', 'CP1-05', 'CP1-09', 'CP1-11', 'CP1-33', 'CP1-34'];
const digest = value => createHash('sha256').update(value).digest('hex');
const lit = value => `'${String(value).replaceAll("'", "''")}'`;
const sqlIds = values => values.length ? values.map(lit).join(',') : 'NULL';
const run = randomUUID();
const report = { status: 'PREPARED', startedAt: new Date().toISOString(), run, scope: 'Eight declared original CU001 cases, API/SQL scope only. No browser, cron, import, shared group, external provider acceptance, plan change or new identity.', results: [], requests: [], fixtures: [] };
const originalTables = ['users', 'accounts', 'transactions', 'investments', 'investment_sales', 'categories', 'budgets', 'recurring_rules', 'shared_groups', 'shared_group_members', 'shared_expenses', 'shared_expense_splits'];
const users = [], ownedAccounts = [];
let sql, rows, output, active, config, originals, initialSources;
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
  const sourcePaths = [path.relative(root, fileURLToPath(import.meta.url)), 'docs/tif/v2.13/casos_prueba.csv', 'scripts/lib/test-isolated-native-target.mjs', 'app/api/accounts/route.ts', 'app/api/accounts/[id]/route.ts', 'app/api/categories/route.ts', 'app/api/transactions/route.ts', 'app/api/transactions/[id]/route.ts', 'app/api/transactions/summary/route.ts', 'lib/services/accounts.ts', 'lib/services/transactions.ts', 'supabase/schema.sql'];
  for (const name of (await fs.readdir(path.join(root, 'supabase/migrations'))).filter(name => name.endsWith('.sql')).sort()) sourcePaths.push(`supabase/migrations/${name}`);
  return Promise.all(sourcePaths.map(async file => ({ path: file, sha256: digest(await fs.readFile(path.join(root, file))) })));
}
async function buildBinding(state) {
  const corePath = path.join(root, 'docs/tif/v2.13/evidence/technical-20261015/core-reliability/verification.json');
  const coreRaw = await fs.readFile(corePath), core = JSON.parse(coreRaw);
  assert.equal(core.sourceStable, true); assert.equal(core.sourceWorkingTreeClean, true);
  assert.match(core.codeRevision, /^[a-f0-9]{40}$/); assert.equal(state.revision, core.codeRevision);
  assert.equal(state.appOrigin, appOrigin); assert.equal(state.apiOrigin, 'http://127.0.0.1:58321'); assert.equal(state.purpose, 'account-analysis-proof');
  assert.equal(state.copyRoot, '/tmp/zarix-app-account-analysis-20261015');
  assert.equal(await fs.realpath(state.copyRoot), path.join(await fs.realpath('/tmp'), 'zarix-app-account-analysis-20261015'));
  const proofPath = path.join(runtime, 'proof-build-proof.json'), proofRaw = await fs.readFile(proofPath), proof = JSON.parse(proofRaw);
  assert.equal(proof.exitCode, 0); assert.equal(proof.revision, core.codeRevision); assert.equal(proof.copyRoot, state.copyRoot); assert.equal(proof.buildId, state.buildId);
  assert.equal((await fs.readFile(path.join(state.copyRoot, '.next/BUILD_ID'), 'utf8')).trim(), state.buildId);
  assert.equal(digest(JSON.stringify(proof.sources)), state.sourceManifestSha256);
  const copied = new Set();
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
  const privateEnvRaw = await fs.readFile(path.join(runtime, 'proof-app.env')), privateEnv = dotenv.parse(privateEnvRaw);
  assert.equal(digest(privateEnvRaw), proof.privateEnvSha256);
  assert.equal(privateEnv.NEXT_PUBLIC_APP_URL, appOrigin); assert.equal(privateEnv.NEXT_PUBLIC_SUPABASE_URL, config.ZARIX_PROOF_SUPABASE_URL);
  assert.equal(privateEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY, config.ZARIX_PROOF_ANON_KEY); assert.equal(privateEnv.SUPABASE_SERVICE_ROLE_KEY, config.ZARIX_PROOF_SERVICE_ROLE_KEY);
  assert.ok(Number.isSafeInteger(state.nextPid) && state.nextPid > 1); process.kill(state.nextPid, 0);
  const lsof = args => { const p = spawnSync('/usr/sbin/lsof', args, { encoding: 'utf8' }); assert.equal(p.status, 0, 'Owned listener/cwd missing; diagnostics withheld'); return p.stdout.trim().split('\n'); };
  const listeners = lsof(['-nP', '-a', '-p', String(state.nextPid), '-iTCP:3002', '-sTCP:LISTEN', '-Fpn']);
  assert.ok(listeners.includes(`p${state.nextPid}`) && listeners.includes('n127.0.0.1:3002'));
  const actualCwd = lsof(['-a', '-p', String(state.nextPid), '-d', 'cwd', '-Fn']).find(line => line.startsWith('n'))?.slice(1);
  assert.equal(await fs.realpath(actualCwd), await fs.realpath(state.copyRoot));
  for (const current of initialSources.filter(item => /^(app|lib|supabase)\//.test(item.path))) assert.equal(current.sha256, core.sourceManifest.find(item => item.path === current.path)?.sha256, 'Relevant API/SQL source differs from served core');
  return { revision: core.codeRevision, buildId: state.buildId, nextPid: state.nextPid, appOrigin, apiOrigin: state.apiOrigin, copyRoot: state.copyRoot, copiedSources: proof.sources.length, allCopiedSourcesMatchGitOrDeclaredCliMetadata: true, ownedListenerAndCwdConfirmed: true, privateEnvBoundToNative: true, coreVerificationSha256: digest(coreRaw), buildProofSha256: digest(proofRaw) };
}
async function request(method, endpoint, payload, user = users[0]) {
  assert.ok(endpoint.startsWith('/api/') && !endpoint.includes('://'));
  const url = new URL(endpoint, appOrigin); assert.equal(url.origin, appOrigin);
  const session = await user.client.auth.getSession(); assert.equal(session.error, null);
  if (!session.data.session || Number(session.data.session.expires_at) * 1000 - Date.now() < 10000) {
    const refresh = await user.client.auth.refreshSession(); assert.equal(refresh.error, null); assert.equal(refresh.data.user?.id, user.id);
    report.normalAuthRefreshes = (report.normalAuthRefreshes || 0) + 1;
  }
  const key = randomUUID(), item = { caseId: active?.id || 'SETUP', method, path: url.pathname, requestId: key, startedAt: new Date().toISOString() };
  report.requests.push(item); await save();
  const headers = { Cookie: [...user.jar].map(([k, v]) => `${k}=${v}`).join('; '), 'Idempotency-Key': key };
  if (payload !== undefined) headers['Content-Type'] = 'application/json';
  const response = await fetch(url, { method, headers, body: payload === undefined ? undefined : JSON.stringify(payload), redirect: 'error', signal: AbortSignal.timeout(55000) });
  const text = await response.text(); Object.assign(item, { status: response.status, responseSha256: digest(text), endedAt: new Date().toISOString() }); await save();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}
function slots(user, count) {
  const q = rows(`SELECT public.plan_account_limit(id) AS cap,(SELECT count(*) FROM accounts a WHERE a.user_id=u.id AND a.is_active AND a.movement_enabled) AS used FROM users u WHERE id=${lit(user.id)}`)[0];
  if (Number(q.cap) - Number(q.used) < count) block(`This literal fixture requires ${count} available existing plan slots; no plan/original account alteration permitted.`);
}
async function account(initialBalance, user = users[0]) {
  slots(user, 1); const name = `RemainingCU001 ${active.id} ${ownedAccounts.length + 1} ${run}`;
  const r = await request('POST', '/api/accounts', { name, type: 'bank', currency: 'ARS', initialBalance }, user);
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
  active = { id, status: 'RUNNING', complete_original_contract: false, assertions: [], observations: [], pendingScopes: [], startedAt: new Date().toISOString() }; report.results.push(active);
  const ownedStart = ownedAccounts.length;
  try { await fn(); active.status = active.pendingScopes.length ? 'PARTIAL' : 'PASS'; active.complete_original_contract = active.status === 'PASS'; }
  catch (error) { active.status = error instanceof Blocked ? (active.assertions.some(x => x.status === 'PASS') ? 'PARTIAL' : 'BLOCKED') : 'FAIL'; active.blocker = error instanceof Blocked ? error.message : undefined; if (!(error instanceof Blocked)) active.failure = { type: error.name, sourceLine: error.stack?.match(/run-basic\.mjs:(\d+):\d+/)?.[1] || null, reason: 'Named assertion/prerequisite failed; raw errors withheld' }; }
  finally {
    for (const own of ownedAccounts.slice(ownedStart)) {
      try { assert.equal(rows(`SELECT user_id FROM accounts WHERE id=${lit(own.id)}`)[0].user_id, own.userId); const r = await request('DELETE', `/api/accounts/${own.id}`, undefined, own.user); assert.equal(r.status, 204); }
      catch { active.cleanupFailure = true; active.status = 'FAIL'; active.complete_original_contract = false; }
    }
    active.finishedAt = new Date().toISOString(); await save();
  }
}

try {
  assert.equal(process.env.ZARIX_CU001_BASIC_WINDOW, 'released-proof-58321', 'Explicit serial release required before any fixture/read');
  assert.equal(process.env.ZARIX_ISOLATED_DATABASE_CONFIRM, 'synthetic-only');
  output = path.resolve(process.env.ZARIX_CU001_BASIC_OUTPUT || path.join(runtime, `remaining-cu001-${run}`));
  assert.ok(output.startsWith(runtime + '/remaining-cu001-')); await fs.mkdir(output, { recursive: false, mode: 0o700 });
  const envFile = path.join(runtime, 'proof.env'), loginFile = path.join(runtime, 'proof-logins.json');
  for (const file of [envFile, loginFile, path.join(runtime, 'proof-app.env')]) assert.equal((await fs.stat(file)).mode & 0o077, 0);
  config = dotenv.parse(await fs.readFile(envFile));
  const { apiUrl, databaseUrl } = isolatedNativeTargets({ ZARIX_ISOLATED_DATABASE_CONFIRM: 'synthetic-only', ZARIX_LOCAL_SUPABASE_URL: config.ZARIX_PROOF_SUPABASE_URL, ZARIX_LOCAL_DATABASE_URL: config.ZARIX_PROOF_DATABASE_URL });
  assert.equal(apiUrl.origin, 'http://127.0.0.1:58321'); assert.equal(databaseUrl.hostname, '127.0.0.1'); assert.equal(databaseUrl.port, '58322'); assert.equal(databaseUrl.pathname, '/postgres');
  databaseUrl.username = 'supabase_admin'; const pgEnv = isolatedPgEnvironment(databaseUrl), psql = path.join(config.ZARIX_PG_BIN, 'psql');
  sql = statement => { const p = spawnSync(psql, ['-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-c', statement], { env: pgEnv, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 }); assert.equal(p.status, 0, 'Native SQL failed; diagnostics withheld'); return p.stdout.trim(); };
  rows = query => JSON.parse(sql(`SELECT COALESCE(jsonb_agg(to_jsonb(t)),'[]'::jsonb) FROM (${query})t`));
  initialSources = await manifest(); report.sourceManifest = initialSources;
  report.buildBinding = await buildBinding(JSON.parse(await fs.readFile(path.join(runtime, 'proof-app-state.json'), 'utf8')));
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
  report.status = 'RUNNING'; await save();

  await exact('CP1-01', async () => {
    const id = await account(10000), cat = await category('Alimentos', 'expense'), t = await transaction(id, 1500, 'expense', { categoryId: cat });
    check('Exact expense balance8500', balance(id), 8500); const persisted = movements([id]); check('Exactly one economic row', persisted.length, 1);
    check('Literal amount/category/date/owner', { amount: Number(persisted[0].amount), category: persisted[0].category_id, date: persisted[0].transaction_date.slice(0, 10), owner: persisted[0].user_id }, { amount: 1500, category: cat, date: '2026-10-06', owner: users[0].id });
    const list = await request('GET', `/api/transactions?accountId=${id}&type=expense`), listed = list.body.find(row => row.id === t.id); check('List API displays same1500 row', { status: list.status, id: listed?.id, amount: Number(listed?.amount) }, { status: 200, id: t.id, amount: 1500 });
    active.pendingScopes.push({ name: 'Actual list/dashboard UI1500', status: 'BLOCKED', reason: 'Arc-specific permission/controls are pending; this runner does not launch a browser.' });
  });
  await exact('CP1-02', async () => {
    const id = await account(10000), cat = await category('Sueldo', 'income'), before = await summary(); await transaction(id, 500, 'income', { categoryId: cat });
    check('Exactly one500 income and10500 balance', { count: movements([id]).length, balance: balance(id), type: movements([id])[0]?.type }, { count: 1, balance: 10500, type: 'income' });
    check('Literal500 income category/date/owner persisted', { amount: Number(movements([id])[0].amount), category: movements([id])[0].category_id, date: movements([id])[0].transaction_date.slice(0, 10), owner: movements([id])[0].user_id }, { amount: 500, category: cat, date: '2026-10-06', owner: users[0].id });
    const after = await summary(); check('Financial flow income increases500 only', { income: after.totalIncome - before.totalIncome, expense: after.totalExpenses - before.totalExpenses, balance: after.balance - before.balance }, { income: 500, expense: 0, balance: 500 });
  });
  await exact('CP1-03', async () => {
    slots(users[0], 2); const aa = await account(10000), bb = await account(2000), before = await summary(); await transaction(aa, 1500, 'transfer', { destinationAccountId: bb });
    const tx = movements([aa, bb]); check('One transfer/two exact impacts and conserved total', { rows: tx.length, type: tx[0]?.type, debit: Number(tx[0]?.amount_in_account_currency), credit: Number(tx[0]?.destination_amount_in_account_currency), balances: [balance(aa), balance(bb)], total: balance(aa) + balance(bb) }, { rows: 1, type: 'transfer', debit: 1500, credit: 1500, balances: [8500, 3500], total: 12000 });
    const after = await summary(); check('Transfer excluded from income/expense/flow', { income: after.totalIncome, expense: after.totalExpenses, balance: after.balance }, { income: before.totalIncome, expense: before.totalExpenses, balance: before.balance });
  });
  await exact('CP1-05', async () => {
    const aa = await account(10000), t = await transaction(aa, 1500); check('Literal initial balance8500', balance(aa), 8500);
    sql(`UPDATE public.transactions SET amount=2000 WHERE id=${lit(t.id)} AND user_id=${lit(users[0].id)} AND account_id=${lit(aa)}`);
    const derived = { balance: balance(aa), row: movements([aa])[0], statement: 'UPDATE own transaction SET amount=2000 only' };
    active.observations.push({ name: 'Amount-only update is recorded without substituting the canonical edit', ...derived, literalExpectedBalance: 8000 });
    sql(`UPDATE public.transactions SET amount=2000,amount_in_account_currency=2000 WHERE id=${lit(t.id)} AND user_id=${lit(users[0].id)} AND account_id=${lit(aa)}`);
    check('Canonical SQL edit applies one new economic impact', { balance: balance(aa), rows: movements([aa]).length, amount: Number(movements([aa])[0]?.amount), canonical: Number(movements([aa])[0]?.amount_in_account_currency) }, { balance: 8000, rows: 1, amount: 2000, canonical: 2000 });
    active.pendingScopes.push({ name: 'Original monto UPDATE column binding', status: 'BLOCKED_CONTRACT_REVIEW', reason: 'The CSV does not name an SQL column. Both amount-only observation and canonical edit are preserved; canonical-edit success is not promoted to original-case PASS.' });
  });
  await exact('CP1-09', async () => {
    const aa = await account(10000), t = await transaction(aa, 500, 'income'); check('Income500 initial balance10500', balance(aa), 10500);
    sql(`DELETE FROM public.transactions WHERE id=${lit(t.id)} AND user_id=${lit(users[0].id)} AND account_id=${lit(aa)}`);
    check('Direct SQL income DELETE exact reverse', { balance: balance(aa), economicRows: movements([aa]).length }, { balance: 10000, economicRows: 0 });
  });
  await exact('CP1-11', async () => {
    slots(users[0], 2); const aa = await account(10000), bb = await account(2000), t = await transaction(aa, 1500, 'transfer', { destinationAccountId: bb });
    check('Literal predelete balances8500/3500', [balance(aa), balance(bb)], [8500, 3500]);
    sql(`DELETE FROM public.transactions WHERE id=${lit(t.id)} AND user_id=${lit(users[0].id)} AND account_id=${lit(aa)} AND destination_account_id=${lit(bb)}`);
    check('Direct SQL transfer DELETE reverses both impacts exactly', { balances: [balance(aa), balance(bb)], economicRows: movements([aa, bb]).length }, { balances: [10000, 2000], economicRows: 0 });
  });
  await exact('CP1-33', async () => {
    const aa = await account(10000), foreign = await account(10000, users[1]); const archive = await request('DELETE', `/api/accounts/${aa}`); check('Archive own new account204', archive.status, 204);
    for (const [name, id] of [['inactive-own', aa], ['foreign-owner', foreign]]) {
      const before = { accounts: accountRows([aa, foreign]), transactions: ledgerRows([aa, foreign]) };
      const r = await request('POST', '/api/transactions', { type: 'expense', accountId: id, amount: 1500, currency: 'ARS' });
      check(`${name} access/state rejection`, r.status >= 400 && r.status < 500, true);
      check(`${name} no account or full-ledger change`, digest(JSON.stringify({ accounts: accountRows([aa, foreign]), transactions: ledgerRows([aa, foreign]) })), digest(JSON.stringify(before)));
      check(`${name} response excludes account/balance data`, Object.keys(r.body).sort(), ['error']);
    }
  });
  await exact('CP1-34', async () => {
    const aa = await account(1); await transaction(aa, 0.01); check('One cent accepted with exact0.99 balance', { balance: balance(aa), rows: movements([aa]).length }, { balance: 0.99, rows: 1 });
    const acceptedCleanup = await request('DELETE', `/api/accounts/${aa}`); check('Accepted cent fixture archived before independent rejection fixtures', acceptedCleanup.status, 204);
    for (const [label, amount] of [['zero', 0], ['negative', -1], ['subcent', 0.001], ['numeric-conversion-NaN', 'NaN']]) {
      const fresh = await account(1), before = { accounts: accountRows([fresh]), transactions: ledgerRows([fresh]) }; const r = await request('POST', '/api/transactions', { type: 'expense', accountId: fresh, amount, currency: 'ARS' });
      check(`${label} rejected400`, r.status, 400); check(`${label} no balance/full-ledger change including initial adjustment`, { accounts: accountRows([fresh]), transactions: ledgerRows([fresh]) }, before); check(`${label} no economic movement created`, movements([fresh]).length, 0);
      const cleanup = await request('DELETE', `/api/accounts/${fresh}`); check(`${label} own fixture archived204`, cleanup.status, 204);
    }
    active.observations.push({ name: 'NaN transport semantics', wireAmount: 'NaN string', apiConversion: "Number('NaN') is NaN", notClaimed: 'JSON numeric NaN, null equivalence or actual browser numeric input behavior' });
    active.pendingScopes.push({ name: 'Browser numeric-input NaN behavior', status: 'BLOCKED', reason: 'Actual Arc input behavior remains unexecuted; API string-to-number rejection is recorded separately.' });
  });
} catch (error) {
  report.preconditionFailure = { type: error.name, reason: 'Explicit window/private target/build/Auth prerequisite failed; raw values and diagnostics withheld' }; report.status = 'BLOCKED';
} finally {
  if (sql && originals) {
    try { report.originalIntegrity = originals.map(before => { const after = rows(`SELECT count(*)::int AS count,md5(COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t.id)::text,'[]')) AS md5 FROM public.${before.table} t WHERE t.id IN(${sqlIds(before.ids)})`)[0]; return { table: before.table, rows: before.count, beforeMd5: before.md5, afterMd5: after.md5, unchanged: before.count === after.count && before.md5 === after.md5 }; }); } catch { report.originalIntegrityUnavailable = true; }
  }
  for (const user of users) { try { await user.client.auth.signOut({ scope: 'local' }); } catch { report.authSessionCleanupFailed = true; } }
  if (initialSources) { try { report.sourceStable = JSON.stringify(initialSources) === JSON.stringify(await manifest()); } catch { report.sourceStable = false; } }
  if (report.results.length) report.status = report.results.some(x => x.status === 'FAIL') || report.originalIntegrity?.some(x => !x.unchanged) || report.originalIntegrityUnavailable || report.authSessionCleanupFailed || !report.sourceStable ? 'FAIL' : report.results.length === ids.length ? (report.results.some(x => x.status !== 'PASS') ? 'PARTIAL' : 'PASS') : 'BLOCKED';
  report.finishedAt = new Date().toISOString(); await save();
  console.log(JSON.stringify({ output: output ? path.basename(output) : null, status: report.status, cases: report.results.map(({ id, status }) => ({ id, status })), browserExecution: false }));
  if (report.status === 'FAIL') process.exitCode = 1;
}
