// Five original contracts only. node --check never connects; execution requires an explicit window.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import dotenv from 'dotenv';
import { createServerClient } from '@supabase/ssr';
import { isolatedNativeTargets, isolatedPgEnvironment, isolatedApiFetch } from '../../../../../../scripts/lib/test-isolated-native-target.mjs';

const root = fileURLToPath(new URL('../../../../../../', import.meta.url));
const here = path.dirname(fileURLToPath(import.meta.url));
const hash = value => createHash('sha256').update(value).digest('hex');
const lit = value => `'${String(value).replaceAll("'", "''")}'`;
const idsSql = ids => ids.length ? ids.map(lit).join(',') : 'NULL';
const tick = ms => new Promise(resolve => setTimeout(resolve, ms));
const run = randomUUID();
const runtime = '/tmp/zarix-runtime-20261015';
const output = path.resolve(process.env.ZARIX_FOCAL_OUTPUT || path.join(runtime, `focal-contracts-${run}`));
const records = ['CP1-36', 'CP1-06', 'CP1-10', 'CP1-13', 'CP4-03'].map(id => ({ id, status: 'BLOCKED', complete_original_contract: false, assertions: [], reason: 'Execution not started' }));
const report = { startedAt: new Date().toISOString(), status: 'RUNNING', run, scope: 'Five exact original integration contracts. Normal password Auth -> SSR cookies -> actual Next HTTP APIs -> independent native PostgreSQL. No browser/UI-suite, provider-acceptance or new-identity claim; no product edits. Existing pricing paths may consult configured providers/doubles or database cache.', results: records, requests: [], fixtureAccounts: [], blockers: [] };
let activeRecord;
let pgEnv;
let psql;
let a;
let protectedState;
let sources;
const ownedAccounts = [];
const ownedInvestments = [];
const users = [];
const check = (name, actual, expected) => {
  const entry = { name, actual, expected, status: 'RUNNING' };
  activeRecord.assertions.push(entry);
  try { assert.deepEqual(actual, expected); entry.status = 'PASS'; }
  catch (error) { entry.status = 'FAIL'; throw error; }
};

function sql(statement) {
  const child = spawnSync(psql, ['-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-c', statement], { env: pgEnv, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
  assert.equal(child.status, 0, 'Native SQL failed; private stderr withheld');
  return child.stdout.trim();
}
const rows = query => JSON.parse(sql(`SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM (${query})t`));
const balance = id => sql(`SELECT balance::numeric::text FROM public.accounts WHERE id=${lit(id)}`);
const balances = ids => ids.map(id => Number(balance(id)));
const accountRows = ids => rows(`SELECT * FROM public.accounts WHERE id IN (${idsSql(ids)}) ORDER BY id`);
async function checkpoint() {
  await fs.writeFile(path.join(output, 'verification.json'), JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
}

async function request(method, endpoint, payload, requestId = randomUUID()) {
  assert.ok(endpoint.startsWith('/api/') && !endpoint.includes('://'), 'Only same-app API paths allowed');
  const url = new URL(endpoint, 'http://127.0.0.1:3000');
  assert.equal(url.origin, 'http://127.0.0.1:3000');
  const requestRecord = { method, path: url.pathname, requestId, startedAt: new Date().toISOString(), caseId: activeRecord?.id || 'SETUP', state: 'DISPATCHING' };
  report.requests.push(requestRecord);
  await checkpoint();
  const headers = { Cookie: [...a.jar].map(([name, value]) => `${name}=${value}`).join('; '), 'Idempotency-Key': requestId };
  if (payload !== undefined) headers['Content-Type'] = 'application/json';
  const response = await fetch(url, { method, headers, body: payload === undefined ? undefined : JSON.stringify(payload), redirect: 'error', signal: AbortSignal.timeout(55000) });
  const text = await response.text();
  requestRecord.endedAt = new Date().toISOString();
  requestRecord.status = response.status;
  requestRecord.responseSha256 = hash(text);
  requestRecord.state = 'COMPLETED';
  await checkpoint();
  return { status: response.status, body: text ? JSON.parse(text) : null, requestId };
}

async function createAccount(caseId, initialBalance, currency = 'ARS', type = 'bank') {
  const name = `Focal ${caseId} ${ownedAccounts.length + 1} ${run}`;
  const response = await request('POST', '/api/accounts', { name, type, currency, initialBalance });
  assert.equal(response.status, 201, 'Own scoped fixture account API creation failed; no plan alteration permitted');
  const id = response.body.id;
  assert.match(id, /^[0-9a-f-]{36}$/i);
  ownedAccounts.push(id);
  report.fixtureAccounts.push({ id, name, initialBalance, currency, type, setup: 'normal API', caseId });
  assert.equal(Number(balance(id)), initialBalance);
  await checkpoint();
  return id;
}

async function archiveOwnAccounts(caseIds) {
  if (!caseIds.length) return;
  assert.ok(caseIds.every(id => ownedAccounts.includes(id)));
  const before = accountRows(caseIds);
  sql(`UPDATE public.accounts SET is_active=false WHERE user_id=${lit(a.id)} AND id IN (${idsSql(caseIds)}) AND name LIKE ${lit(`Focal % ${run}`)}`);
  const after = accountRows(caseIds);
  assert.equal(after.length, caseIds.length);
  assert.ok(after.every(row => row.is_active === false));
  report.teardown ||= [];
  report.teardown.push({ at: new Date().toISOString(), ids: caseIds, action: 'Archive only this runner\'s new accounts; financial rows retained', beforeSha256: hash(JSON.stringify(before)), afterSha256: hash(JSON.stringify(after)) });
  await checkpoint();
}

async function exact(id, fn) {
  activeRecord = records.find(row => row.id === id);
  activeRecord.status = 'RUNNING';
  activeRecord.startedAt = new Date().toISOString();
  delete activeRecord.reason;
  const startOwned = ownedAccounts.length;
  try {
    activeRecord.evidence = await fn();
    activeRecord.complete_original_contract = true;
    activeRecord.status = 'PASS';
  } catch (error) {
    activeRecord.status = 'FAIL';
    activeRecord.failure = { type: error.name, location: error.stack?.match(/run\.mjs:(\d+):\d+/)?.[1] || null, context: 'Exact contract assertion or precondition failed; private error text withheld' };
  } finally {
    activeRecord.endedAt = new Date().toISOString();
    await archiveOwnAccounts(ownedAccounts.slice(startOwned));
    await checkpoint();
  }
}

const protectedTables = ['users', 'accounts', 'transactions', 'investments', 'investment_sales', 'shared_groups', 'shared_group_members', 'shared_expenses', 'shared_expense_splits', 'categories', 'budgets', 'recurring_rules'];
function captureProtected() {
  return protectedTables.map(table => {
    const ids = rows(`SELECT id FROM public.${table} ORDER BY id`).map(row => row.id);
    const digest = sql(`SELECT md5(COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t.id)::text,'[]')) FROM public.${table} t WHERE t.id IN (${idsSql(ids)})`);
    return { table, ids, count: ids.length, md5: digest };
  });
}
function compareProtected() {
  return protectedState.map(previous => {
    const observed = rows(`SELECT count(*)::int AS count, md5(COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t.id)::text,'[]')) AS md5 FROM public.${previous.table} t WHERE t.id IN (${idsSql(previous.ids)})`)[0];
    return { table: previous.table, count: previous.count, beforeMd5: previous.md5, afterMd5: observed.md5, unchanged: observed.count === previous.count && observed.md5 === previous.md5 };
  });
}

async function manifest() {
  const files = [path.relative(root, fileURLToPath(import.meta.url)), 'docs/tif/v2.13/casos_prueba.csv', 'scripts/lib/test-isolated-native-target.mjs', 'app/api/accounts/route.ts', 'app/api/transactions/route.ts', 'app/api/transactions/[id]/route.ts', 'app/api/transactions/summary/route.ts', 'app/api/investments/route.ts', 'app/api/investments/[id]/sell/route.ts', 'lib/services/transactions.ts', 'lib/services/investments.ts', 'lib/services/cotizaciones.ts', 'supabase/schema.sql', 'supabase/migrations/20261015000402_atomic_account_balance_recompute.sql', 'supabase/migrations/20261006235424_fix_balance_update_old_new_impacts.sql', 'supabase/migrations/20261009034852_durable_financial_requests_outbox.sql', 'supabase/migrations/20261009034943_enforce_plan_allowances.sql', 'supabase/migrations/20261009035715_durable_sales_shared_expenses.sql'];
  return Promise.all(files.map(async file => ({ path: file, sha256: hash(await fs.readFile(path.join(root, file))) })));
}

async function frozenBuildBinding(appState) {
  const verificationPath='docs/tif/v2.13/evidence/technical-20261015/core-responsive/verification.json';
  const verificationRaw=await fs.readFile(path.join(root,verificationPath));
  const core=JSON.parse(verificationRaw);
  assert.equal(core.codeRevision,'bb2e8a6aa5de7f7f26ba745da67257b0f1f25e81');
  assert.equal(core.sourceStable,true);assert.equal(core.sourceWorkingTreeClean,true);
  assert.equal((await fs.readFile(path.join(root,'.next/BUILD_ID'),'utf8')).trim(),appState.buildId);
  const gitBytes=file=>{
    const result=spawnSync('git',['show',`${core.codeRevision}:${file}`],{cwd:root,env:{...process.env,DEVELOPER_DIR:'/Library/Developer/CommandLineTools'}});
    assert.equal(result.status,0,'Frozen Git source unavailable; private diagnostics withheld');return result.stdout;
  };
  const servedRelevantSources=[];
  for(const current of sources){
    const frozen=core.sourceManifest.find(entry=>entry.path===current.path);if(!frozen)continue;
    assert.equal(hash(gitBytes(current.path)),frozen.sha256,'CI3 manifest does not match immutable Git bytes');
    servedRelevantSources.push({path:current.path,sha256:frozen.sha256,currentCheckoutSha256:current.sha256,sameAsCheckout:current.sha256===frozen.sha256});
    if((current.path.startsWith('app/api/')||current.path.startsWith('supabase/')||['lib/services/investments.ts','lib/services/transactions.ts'].includes(current.path)))assert.equal(current.sha256,frozen.sha256,'Financial API/SQL sources changed after the served CI3 build');
  }
  const changed=spawnSync('git',['diff','--name-only',core.codeRevision,'--','app','components','lib','types','public','next.config.ts','next.config.js','middleware.ts','package.json','package-lock.json'],{cwd:root,env:{...process.env,DEVELOPER_DIR:'/Library/Developer/CommandLineTools'},encoding:'utf8'});
  assert.equal(changed.status,0,'Current checkout comparison failed');
  const currentCheckoutDifferences=[];
  for(const file of changed.stdout.trim().split('\n').filter(Boolean)){
    currentCheckoutDifferences.push({path:file,servedGitSha256:hash(gitBytes(file)),currentCheckoutSha256:hash(await fs.readFile(path.join(root,file))),executedByThisBuild:false});
  }
  return {servedCodeRevision:core.codeRevision,coreVerificationPath:verificationPath,coreVerificationSha256:hash(verificationRaw),coreSourceManifestSha256:core.sourceManifestSha256,servedRelevantSources,currentCheckoutDifferences,scope:'Next serves the existing CI3 build. Current checkout/harness manifests are recorded separately; later TTL/auth/dashboard/chart changes are unbuilt and are not tested by these focal requests.'};
}

async function accountGate(accountId) {
  assert.ok(ownedAccounts.includes(accountId));
  const child = spawn(psql, ['-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1'], { env: { ...pgEnv, PGAPPNAME: `focal-gate-${run}` }, stdio: ['pipe', 'pipe', 'pipe'] });
  let out = '';
  let exitCode = null;
  let spawnFailed = false;
  child.stdout.on('data', chunk => { out += chunk.toString(); });
  child.stderr.on('data', () => {}); // Never publish native diagnostics.
  child.stdin.on('error', () => {}); // A failed/closed own child must not cause an unhandled EPIPE.
  child.on('error', () => { spawnFailed = true; });
  child.on('close', code => { exitCode = code ?? -1; });
  async function release() {
    if (exitCode === null) {
      child.stdin.end('ROLLBACK;\n\\q\n');
      const untilExit = Date.now() + 5000;
      while (exitCode === null && Date.now() < untilExit) await tick(50);
      for (const signal of ['SIGTERM','SIGKILL']) {
        if (exitCode !== null) break;
        child.kill(signal);
        const untilKilled = Date.now() + 2000;
        while (exitCode === null && Date.now() < untilKilled) await tick(50);
      }
    }
    assert.notEqual(exitCode, null, 'Own barrier process did not close');
    assert.equal(exitCode, 0, 'Own barrier process exit failed');
  }
  child.stdin.write(`BEGIN; SET LOCAL lock_timeout='20s'; SET LOCAL idle_in_transaction_session_timeout='45s'; SELECT id FROM public.accounts WHERE id=${lit(accountId)} FOR UPDATE; SELECT 'FOCAL_GATE_READY:' || pg_backend_pid();\n`);
  try {
    const until = Date.now() + 10000;
    while (!out.includes('FOCAL_GATE_READY:') && exitCode === null && !spawnFailed && Date.now() < until) await tick(50);
    assert.ok(out.includes('FOCAL_GATE_READY:'), 'Own account lock barrier did not become ready');
    return { pid:Number(out.match(/FOCAL_GATE_READY:(\d+)/)[1]), release };
  } catch (error) {
    try { await release(); } catch { report.blockers.push('Own barrier cleanup failed after readiness failure; process diagnostics withheld'); }
    throw error;
  }
}

try {
  assert.equal(process.env.ZARIX_FOCAL_WINDOW, 'after-load-and-quotes', 'Wait for the root to release E2E after LOAD and quote profiles');
  assert.equal(process.env.ZARIX_ISOLATED_DATABASE_CONFIRM, 'synthetic-only');
  assert.ok(output.startsWith(runtime + '/focal-contracts-'), 'Use a new private focal evidence directory');
  await fs.mkdir(output, { recursive: false, mode: 0o700 });
  const envFile = path.join(runtime, 'e2e.env');
  const loginFile = path.join(runtime, 'e2e-logins.json');
  for (const file of [envFile, loginFile]) assert.equal((await fs.stat(file)).mode & 0o077, 0, 'Private fixture must be 0600');
  const config = dotenv.parse(await fs.readFile(envFile));
  const { apiUrl, databaseUrl } = isolatedNativeTargets({ ZARIX_ISOLATED_DATABASE_CONFIRM: 'synthetic-only', ZARIX_LOCAL_SUPABASE_URL: config.ZARIX_E2E_SUPABASE_URL, ZARIX_LOCAL_DATABASE_URL: config.ZARIX_E2E_DATABASE_URL });
  assert.equal(apiUrl.origin, 'http://127.0.0.1:57321');
  assert.equal(databaseUrl.hostname, '127.0.0.1');
  assert.equal(databaseUrl.port, '57322');
  databaseUrl.username = 'supabase_admin';
  pgEnv = isolatedPgEnvironment(databaseUrl);
  psql = path.join(config.ZARIX_PG_BIN, 'psql');
  const logins = JSON.parse(await fs.readFile(loginFile, 'utf8'));
  assert.equal(logins.purpose, 'isolated-api-e2e-replica');
  assert.equal(logins.users.length, 2);
  for (const credential of logins.users) {
    assert.match(credential.email, /^zarix-e2e-.+@example\.invalid$/i);
    const jar = new Map();
    const client = createServerClient(apiUrl.href, config.ZARIX_E2E_ANON_KEY, { cookies: { getAll: () => [...jar].map(([name, value]) => ({ name, value })), setAll: cookies => { for (const { name, value } of cookies) jar.set(name, value); } }, global: { fetch: isolatedApiFetch } });
    const result = await client.auth.signInWithPassword({ email: credential.email, password: credential.password });
    assert.equal(result.error, null, 'Normal password Auth required');
    assert.equal((await client.auth.getUser()).data.user?.id, credential.id);
    assert.equal(sql(`SELECT email FROM auth.users WHERE id=${lit(credential.id)}`), credential.email, 'Auth and SQL must identify the same local instance');
    users.push({ id: credential.id, client, jar });
  }
  [a] = users;
  sources = await manifest();
  const appState = JSON.parse(await fs.readFile(process.env.ZARIX_FOCAL_APP_STATE || path.join(runtime, 'e2e-app-state.json'), 'utf8'));
  assert.equal(appState.appOrigin, 'http://127.0.0.1:3000');
  assert.equal(appState.apiOrigin, apiUrl.origin);
  const served = await fetch('http://127.0.0.1:3000/login', { redirect: 'error', signal: AbortSignal.timeout(15000) });
  assert.equal(served.status, 200);
  report.buildBinding = { appOrigin: appState.appOrigin, apiOrigin: appState.apiOrigin, buildId: appState.buildId, nextPid: appState.nextPid, loginStatus: served.status, ...await frozenBuildBinding(appState) };
  report.revision = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, env: { ...process.env, DEVELOPER_DIR: '/Library/Developer/CommandLineTools' }, encoding: 'utf8' }).stdout.trim();
  report.sourceManifest = sources;
  report.sourceManifestRole = 'Current checkout and harness before/after only; served build source hashes are in buildBinding.servedRelevantSources. An unbuilt checkout hash is not execution evidence for that change.';
  report.versions = { node: process.version, postgres: sql('SHOW server_version') };
  report.liveTriggerSha256 = sql("SELECT encode(sha256(convert_to(pg_get_functiondef('public.update_account_balance()'::regprocedure),'UTF8')),'hex')");
  report.plan = rows(`SELECT id,status,current_period_end,grace_period_end,public.plan_account_limit(id) AS cap,(SELECT count(*)::int FROM public.accounts WHERE user_id=u.id AND is_active AND movement_enabled) AS active_movement_accounts FROM public.users u WHERE id=${lit(a.id)}`)[0];
  protectedState = captureProtected();
  await checkpoint();

  await exact('CP1-36', async () => {
    const previous = JSON.parse(await fs.readFile(path.join(here, '../e2e/api/api-verification.json'), 'utf8'));
    const previousCase = previous.results.find(row => row.status === 'PASS' && row.evidence?.ids?.includes('CP1-36'));
    assert.ok(previousCase);
    const expenseId = previousCase.evidence.expenseId;
    const expense = rows(`SELECT id,group_id,paid_by_member_id,amount::text AS amount FROM public.shared_expenses WHERE id=${lit(expenseId)}`)[0];
    assert.ok(expense);
    const group = rows(`SELECT id,owner_user_id,is_active,currency FROM public.shared_groups WHERE id=${lit(expense.group_id)}`)[0];
    const members = rows(`SELECT id FROM public.shared_group_members WHERE group_id=${lit(expense.group_id)} ORDER BY id`);
    const splits = rows(`SELECT member_id,amount::text AS amount FROM public.shared_expense_splits WHERE expense_id=${lit(expenseId)} ORDER BY amount DESC,member_id`);
    check('CP1-36 original API assertion passed on this exact expense ID', previousCase.status, 'PASS');
    check('CP1-36 owned archived group remains inactive', { owner: group.owner_user_id, active: group.is_active }, { owner: a.id, active: false });
    check('CP1-36 original group currency is ARS', group.currency, 'ARS');
    check('CP1-36 exact original group has three members', members.length, 3);
    check('CP1-36 original expense is exactly 100 ARS', Number(expense.amount), 100);
    check('CP1-36 exactly three distinct same-group split members', splits.map(row => row.member_id).sort(), members.map(row => row.id).sort());
    check('CP1-36 split amounts are 33.34 33.33 33.33', splits.map(row => Number(row.amount)), [33.34, 33.33, 33.33]);
    const totals = rows(`SELECT e.amount::text AS expense_amount, sum(s.amount)::text AS split_sum FROM public.shared_expenses e JOIN public.shared_expense_splits s ON s.expense_id=e.id WHERE e.id=${lit(expenseId)} GROUP BY e.id`)[0];
    check('CP1-36 exact expense split sum equals its 100 amount', Number(totals.split_sum), Number(totals.expense_amount));
    check('CP1-36 payer belongs to exact original group', members.some(row => row.id === expense.paid_by_member_id), true);
    const netRows = rows(`SELECT m.id AS member_id,(CASE WHEN m.id=e.paid_by_member_id THEN e.amount ELSE 0 END)::text AS paid,COALESCE(s.amount,0)::text AS owed,((CASE WHEN m.id=e.paid_by_member_id THEN e.amount ELSE 0 END)-COALESCE(s.amount,0))::text AS net FROM public.shared_group_members m JOIN public.shared_expenses e ON e.group_id=m.group_id LEFT JOIN public.shared_expense_splits s ON s.expense_id=e.id AND s.member_id=m.id WHERE e.id=${lit(expenseId)} ORDER BY m.id`);
    const netSum = sql(`SELECT sum((CASE WHEN m.id=e.paid_by_member_id THEN e.amount ELSE 0 END)-COALESCE(s.amount,0))::text FROM public.shared_group_members m JOIN public.shared_expenses e ON e.group_id=m.group_id LEFT JOIN public.shared_expense_splits s ON s.expense_id=e.id AND s.member_id=m.id WHERE e.id=${lit(expenseId)}`);
    check('CP1-36 original 100 expense net total is exact numeric zero', Number(netSum), 0);
    const groupChecks = rows(`SELECT count(*)::int AS expenses,count(*) FILTER(WHERE x.amount<>x.split_sum OR x.bad_members<>0)::int AS invalid FROM (SELECT e.id,e.amount,COALESCE(sum(s.amount),0) AS split_sum,count(*) FILTER(WHERE m.group_id IS DISTINCT FROM e.group_id)::int AS bad_members FROM public.shared_expenses e LEFT JOIN public.shared_expense_splits s ON s.expense_id=e.id LEFT JOIN public.shared_group_members m ON m.id=s.member_id WHERE e.group_id=${lit(expense.group_id)} GROUP BY e.id)x`)[0];
    check('CP1-36 every existing expense in the same group independently reconciles and has same-group members', groupChecks.invalid, 0);
    const groupNetQuery = `SELECT m.id AS member_id,(COALESCE((SELECT sum(e.amount) FROM public.shared_expenses e WHERE e.group_id=m.group_id AND e.paid_by_member_id=m.id),0)-COALESCE((SELECT sum(s.amount) FROM public.shared_expense_splits s JOIN public.shared_expenses e ON e.id=s.expense_id WHERE e.group_id=m.group_id AND s.member_id=m.id),0)) AS net FROM public.shared_group_members m WHERE m.group_id=${lit(expense.group_id)}`;
    const groupNets = rows(`SELECT member_id,net::text FROM (${groupNetQuery})n ORDER BY member_id`);
    const groupNetSum = sql(`SELECT sum(net)::text FROM (${groupNetQuery})n`);
    check('CP1-36 same original group net total is independently exact numeric zero', Number(groupNetSum), 0);
    return { expenseId, groupId: expense.group_id, groupArchivedAndUnmodified: true, originalApiEvidence: { path: '../e2e/api/api-verification.json', sha256: hash(await fs.readFile(path.join(here, '../e2e/api/api-verification.json'))), expenseId }, splitAmounts: splits.map(row => row.amount), numericSplitSum: totals.split_sum, exactExpenseMemberNets: netRows, exactExpenseNetSum: netSum, originalGroupMemberNets: groupNets, originalGroupNetSum: groupNetSum, otherGroupExpensesKeptSeparate: groupChecks.expenses - 1, mutations: 0 };
  });

  if (Number(report.plan.cap) - report.plan.active_movement_accounts < 3) {
    report.blockers.push('Fewer than three active account slots available; modifying original plan/accounts or bypassing movement limits is not authorized');
    for (const row of records.filter(row => row.id !== 'CP1-36')) row.reason = report.blockers.at(-1);
  } else {
    await exact('CP1-06', async () => {
      const aa = await createAccount('CP1-06-A', 10000), bb = await createAccount('CP1-06-B', 2000);
      const before = accountRows([aa, bb]);
      const expense = await request('POST', '/api/transactions', { type: 'expense', accountId: aa, amount: 1500, currency: 'ARS', description: `CP1-06 ${run}`, transactionDate: '2026-10-06T12:00:00Z' });
      check('CP1-06 initial expense succeeds', expense.status, 201);
      check('CP1-06 exact pre-edit balances', balances([aa, bb]), [8500, 2000]);
      const id = expense.body.id;
      const updated = await request('PATCH', `/api/transactions/${id}`, { amount: 1500, currency: 'ARS', account_id: bb, transaction_date: '2026-10-06T12:00:00Z', description: `CP1-06 ${run}` });
      check('CP1-06 origin-account update succeeds', updated.status, 200);
      check('CP1-06 exact post-edit balances', balances([aa, bb]), [10000, 500]);
      const movements = rows(`SELECT id,user_id,type,account_id,amount::text,amount_in_account_currency::text FROM public.transactions WHERE id=${lit(id)} OR (user_id=${lit(a.id)} AND description=${lit(`CP1-06 ${run}`)}) ORDER BY id`);
      check('CP1-06 one original movement preserves identity owner amount and points to B', movements.map(row => ({ id: row.id, user: row.user_id, type: row.type, account: row.account_id, amount: Number(row.amount), authoritative: Number(row.amount_in_account_currency) })), [{ id, user: a.id, type: 'expense', account: bb, amount: 1500, authoritative: 1500 }]);
      const visible = await request('GET', `/api/transactions/${id}`);
      check('CP1-06 historical API relation is consistent', { status: visible.status, id: visible.body.id, accountId: visible.body.account_id }, { status: 200, id, accountId: bb });
      return { accountIds: [aa, bb], transactionId: id, before, after: accountRows([aa, bb]), movements };
    });

    await exact('CP1-10', async () => {
      const aa = await createAccount('CP1-10-A', 10000), bb = await createAccount('CP1-10-B', 2000), cc = await createAccount('CP1-10-C', 3000);
      const before = accountRows([aa, bb, cc]);
      const summaryBefore = await request('GET', '/api/transactions/summary?month=2026-10-01T12:00:00Z');
      check('CP1-10 initial summary is available', summaryBefore.status, 200);
      const transfer = await request('POST', '/api/transactions', { type: 'transfer', accountId: aa, destinationAccountId: bb, amount: 1500, currency: 'ARS', description: `CP1-10 ${run}`, transactionDate: '2026-10-06T12:00:00Z' });
      check('CP1-10 initial transfer succeeds', transfer.status, 201);
      check('CP1-10 original transfer balances', balances([aa, bb, cc]), [8500, 3500, 3000]);
      const id = transfer.body.id;
      const updated = await request('PATCH', `/api/transactions/${id}`, { amount: 1000, currency: 'ARS', account_id: aa, destination_account_id: cc, transaction_date: '2026-10-06T12:00:00Z', description: `CP1-10 ${run}` });
      check('CP1-10 destination-and-amount update succeeds', updated.status, 200);
      check('CP1-10 exact final balances and total', { balances: balances([aa, bb, cc]), total: Number(sql(`SELECT sum(balance)::text FROM public.accounts WHERE id IN (${idsSql([aa, bb, cc])})`)) }, { balances: [9000, 2000, 4000], total: 15000 });
      const transactions = rows(`SELECT id,type,account_id,destination_account_id,amount::text,amount_in_account_currency::text,destination_amount_in_account_currency::text FROM public.transactions WHERE user_id=${lit(a.id)} AND description=${lit(`CP1-10 ${run}`)}`);
      check('CP1-10 one transfer preserves identity and both authoritative amounts', transactions.map(row => ({ id: row.id, type: row.type, source: row.account_id, destination: row.destination_account_id, amount: Number(row.amount), debit: Number(row.amount_in_account_currency), credit: Number(row.destination_amount_in_account_currency) })), [{ id, type: 'transfer', source: aa, destination: cc, amount: 1000, debit: 1000, credit: 1000 }]);
      const summaryAfter = await request('GET', '/api/transactions/summary?month=2026-10-01T12:00:00Z');
      check('CP1-10 transfer does not increment API income expense or economic flow', { status: summaryAfter.status, income: summaryAfter.body.totalIncome, expense: summaryAfter.body.totalExpenses, balance: summaryAfter.body.balance }, { status: 200, income: summaryBefore.body.totalIncome, expense: summaryBefore.body.totalExpenses, balance: summaryBefore.body.balance });
      check('CP1-10 independent SQL finds no income or expense for this transfer', Number(sql(`SELECT count(*) FROM public.transactions WHERE id=${lit(id)} AND type IN ('income','expense')`)), 0);
      return { accountIds: [aa, bb, cc], transactionId: id, before, after: accountRows([aa, bb, cc]), transactions, summaryBefore: summaryBefore.body, summaryAfter: summaryAfter.body };
    });

    await exact('CP1-13', async () => {
      const account = await createAccount('CP1-13', 10000);
      const keys = [randomUUID(), randomUUID()];
      const gate = await accountGate(account);
      let responses;
      let concurrentProof;
      // Attach both outcomes immediately, before waiting on the SQL barrier.
      const pending = keys.map((key, index) => request('POST', '/api/transactions', { type: 'expense', accountId: account, amount: 6000, currency: 'ARS', description: `CP1-13-${index + 1} ${run}`, transactionDate: '2026-10-06T12:00:00Z' }, key).then(value => ({ status:'fulfilled', value }), error => ({ status:'rejected', error })));
      try {
        const until = Date.now() + 20000;
        while (Date.now() < until) {
          const waiters = rows(`SELECT pid,state,wait_event_type,wait_event,pg_blocking_pids(pid) AS blockers FROM pg_stat_activity WHERE pid<>pg_backend_pid() AND datname=current_database() AND state='active' AND wait_event_type='Lock' AND query LIKE '%create_transaction_once%' ORDER BY pid`);
          const gated = waiters.filter(row => row.blockers.includes(gate.pid) || row.blockers.some(pid => waiters.some(other => other.pid === pid && other.blockers.includes(gate.pid))));
          if (gated.length >= 2) { concurrentProof = { at: new Date().toISOString(), barrierPid: gate.pid, accountId: account, waiterConnections: gated, financialRowsWhileBlocked: Number(sql(`SELECT count(*) FROM public.transactions WHERE account_id=${lit(account)} AND type='expense'`)) }; break; }
          await tick(100);
        }
      } finally {
        let releaseError;
        try { await gate.release(); } catch (error) { releaseError = error; }
        const settled = await Promise.all(pending);
        if (releaseError) throw releaseError;
        const rejected = settled.find(item => item.status === 'rejected');
        if (rejected) throw rejected.error;
        responses = settled.map(item => item.value);
      }
      check('CP1-13 two independent database connections overlap behind own-row barrier', Boolean(concurrentProof && new Set(concurrentProof.waiterConnections.map(row => row.pid)).size >= 2), true);
      check('CP1-13 neither blocked request committed before barrier release', concurrentProof?.financialRowsWhileBlocked, 0);
      check('CP1-13 two distinct logical keys', new Set(keys).size, 2);
      check('CP1-13 both distinct expense commands commit', responses.map(row => row.status), [201, 201]);
      const movements = rows(`SELECT id,user_id,type,amount::text,amount_in_account_currency::text FROM public.transactions WHERE account_id=${lit(account)} AND type='expense' ORDER BY id`);
      check('CP1-13 exactly two distinct 6000 expense effects', { rows: movements.length, ids: new Set(movements.map(row => row.id)).size, amounts: movements.map(row => Number(row.amount)), authoritative: movements.map(row => Number(row.amount_in_account_currency)) }, { rows: 2, ids: 2, amounts: [6000, 6000], authoritative: [6000, 6000] });
      check('CP1-13 final balance is -2000 without lost updates', Number(balance(account)), -2000);
      const receipts = rows(`SELECT request_id FROM public.transaction_requests WHERE user_id=${lit(a.id)} AND request_id IN (${idsSql(keys)}) ORDER BY request_id`);
      check('CP1-13 two durable receipts exist for the two commands', receipts.map(row => row.request_id), [...keys].sort());
      return { accountId: account, requestIds: keys, concurrentProof, movements, receipts, finalBalance: balance(account), overdraftRejectionNotExpectedByOriginalContract: true };
    });

    await exact('CP4-03', async () => {
      const account = await createAccount('CP4-03', 0, 'USD', 'investment');
      const purchase = await request('POST', '/api/investments', { accountId: account, type: 'stock_us', name: `CP4-03 manual ${run}`, quantity: 4, purchasePrice: 100, purchaseCurrency: 'USD', purchaseDate: '2026-10-06', isManualPrice: true, currentPrice: 110, marketCurrency: 'USD' });
      check('CP4-03 exact manual lot purchase succeeds', purchase.status, 201);
      const id = purchase.body.id;
      ownedInvestments.push(id);
      const before = rows(`SELECT * FROM public.investments WHERE id=${lit(id)}`)[0];
      check('CP4-03 exact pre-sale quantity and cost', { quantity: Number(before.quantity), cost: Number(before.quantity) * Number(before.purchase_price) }, { quantity: 4, cost: 400 });
      const sale = await request('POST', `/api/investments/${id}/sell`, { quantity: 4, price: 120, currency: 'USD', soldAt: '2026-10-06' });
      check('CP4-03 entire lot sale succeeds and closes position', { status: sale.status, quantity: sale.body.remainingQuantity, closed: sale.body.positionClosed }, { status: 201, quantity: 0, closed: true });
      const position = rows(`SELECT id,quantity::text,purchase_price::text,is_active,(quantity*purchase_price)::text AS remaining_cost FROM public.investments WHERE id=${lit(id)}`)[0];
      const sales = rows(`SELECT id,quantity::text,price::text,realized_pnl_native::text,realized_pnl_usd::text FROM public.investment_sales WHERE investment_id=${lit(id)} ORDER BY id`);
      check('CP4-03 independent closed quantity and remaining cost are zero', { quantity: Number(position.quantity), cost: Number(position.remaining_cost), active: position.is_active }, { quantity: 0, cost: 0, active: false });
      check('CP4-03 exactly one sale has realized profit 80 USD', sales.map(row => ({ quantity: Number(row.quantity), price: Number(row.price), realized: Number(row.realized_pnl_native), realizedUSD: Number(row.realized_pnl_usd) })), [{ quantity: 4, price: 120, realized: 80, realizedUSD: 80 }]);
      const history = await request('GET', `/api/investments/${id}/sell`);
      check('CP4-03 sale history remains visible through authenticated API after closure', { status: history.status, ids: history.body.sales.map(row => row.id) }, { status: 200, ids: sales.map(row => row.id) });
      check('CP4-03 visible sale history preserves exact quantities price and realized profit', history.body.sales.map(row => ({ quantity: Number(row.quantity), price: Number(row.price), realized: Number(row.realized_pnl_native), realizedUSD: Number(row.realized_pnl_usd) })), [{ quantity: 4, price: 120, realized: 80, realizedUSD: 80 }]);
      const numericValues = [sale.body.remainingQuantity, Number(sale.body.sale.realized_pnl_native), Number(sale.body.sale.realized_pnl_usd), Number(position.remaining_cost), ...history.body.sales.flatMap(row => [Number(row.quantity), Number(row.price), Number(row.realized_pnl_native)])];
      check('CP4-03 zero-quantity closure and visible history contain finite financial outputs', numericValues.every(Number.isFinite), true);
      return { accountId: account, investmentId: id, before, position, sales, historySaleIds: history.body.sales.map(row => row.id), originalCashUnchanged: balance(account), scope: 'Normal sale API and authenticated closed-position sale history; no portfolio-wide quote refresh or broker execution' };
    });
  }

  report.counts = Object.fromEntries(['PASS', 'FAIL', 'BLOCKED'].map(status => [status, records.filter(row => row.status === status).length]));
  report.status = report.counts.FAIL ? 'FAIL' : report.counts.BLOCKED ? 'PARTIAL' : 'PASS';
} catch (error) {
  report.status = 'FAIL';
  report.fatal = { type: error.name, location: error.stack?.match(/run\.mjs:(\d+):\d+/)?.[1] || null, context: 'Precondition, protection or source-stability check failed; private diagnostics withheld' };
} finally {
  report.protectedScope = 'All preexisting row columns in exactly twelve declared public tables, not all25/27 tables';
  if (protectedState) {
    try {
      report.protectedOriginalRows = compareProtected();
      report.protectedOriginalRowsVerified = report.protectedOriginalRows.every(row => row.unchanged);
      if (!report.protectedOriginalRowsVerified) report.status = 'FAIL';
    } catch (error) {
      report.status = 'FAIL';report.protectedOriginalRowsVerified = false;
      report.integrityFailure = { type:error.name, context:'Twelve-table original-state verification failed after test/fatal/teardown; private error text withheld' };
    }
  }
  if (sources) {
    try { report.sourceStable = JSON.stringify(sources) === JSON.stringify(await manifest()); if (!report.sourceStable) report.status = 'FAIL'; }
    catch { report.status = 'FAIL';report.sourceStable = false; }
  }
  for (const user of users) {
    try { await user.client.auth.signOut({ scope: 'local' }); } catch { report.blockers.push('Temporary normal SDK session logout could not be confirmed'); }
  }
  report.endedAt = new Date().toISOString();
  report.counts ||= Object.fromEntries(['PASS', 'FAIL', 'BLOCKED'].map(status => [status, records.filter(row => row.status === status).length]));
  try { await checkpoint(); } catch { /* A refused/no-window execution must not create evidence output. */ }
  console.log(JSON.stringify({ status: report.status, counts: report.counts, results: records.map(({ id, status }) => ({ id, status })), output, fatal: report.fatal || null }));
  process.exitCode = report.status === 'PASS' ? 0 : 1;
}
