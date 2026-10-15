// Independent normal-session API -> native PostgreSQL evidence. Never UI evidence.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createServerClient } from '@supabase/ssr';
import { isolatedNativeTargets, isolatedPgEnvironment, isolatedApiFetch } from './lib/test-isolated-native-target.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');
const rejected = status => status >= 400 && status < 500;
const literal = value => `'${String(value).replaceAll("'", "''")}'`;
const output = path.resolve(process.env.ZARIX_API_OUTPUT || '/tmp/zarix-isolated-api');
await fs.mkdir(output, { recursive: true, mode: 0o700 });
const report = { startedAt: new Date().toISOString(), status: 'RUNNING', scope: 'Normal GoTrue password sessions -> Next HTTP API -> separate native SQL assertions. No browser/UI acceptance. All identities and ledger data are synthetic loopback fixtures.', results: [], requests: [], blockers: [] };
const redactedEndpoint = endpoint => endpoint.replace(/\/api\/shared\/[^/]+/, '/api/shared/[capability-redacted]');
let restorePlan;
try {
  const { apiUrl, databaseUrl } = isolatedNativeTargets();
  assert.equal(process.env.ZARIX_API_TARGET_PURPOSE, 'isolated-api-e2e-replica', 'Use a separate replica; the source/recovery fixture must remain unchanged');
  assert.ok(['56321:56322', '57321:57322'].includes(`${apiUrl.port}:${databaseUrl.port}`), 'Source/recovery ports and mismatched instances refused by mutating API runner');
  const appUrl = new URL(process.env.ZARIX_E2E_APP_URL || 'http://127.0.0.1:3000');
  assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(appUrl.hostname), 'Non-loopback Next target refused');
  assert.ok(!appUrl.username && !appUrl.password && !appUrl.search && !appUrl.hash);
  if (appUrl.hostname === 'localhost') appUrl.hostname = '127.0.0.1';
  const pgEnv = isolatedPgEnvironment(databaseUrl), psql = path.join(process.env.ZARIX_PG_BIN || '', 'psql');
  function sql(statement) {
    const child = spawnSync(psql, ['-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-c', statement], { env: pgEnv, encoding: 'utf8' });
    assert.equal(child.status, 0, 'SQL assertion failed; private stderr is not copied into report');
    return child.stdout.trim();
  }
  const rows = query => JSON.parse(sql(`SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM (${query})t`));
  const balance = id => Number(sql(`SELECT balance FROM accounts WHERE id=${literal(id)}`));
  const loginFile = process.env.ZARIX_TEST_LOGIN_FILE;
  assert.ok(loginFile, 'Private ZARIX_TEST_LOGIN_FILE is required');
  assert.equal((await fs.stat(loginFile)).mode & 0o077, 0);
  const logins = JSON.parse(await fs.readFile(loginFile, 'utf8'));
  assert.equal(logins.purpose, 'isolated-api-e2e-replica', 'Only new identities owned by this API/E2E fixture may be mutated');
  assert.equal(logins.users.length, 2);
  const users = [];
  for (const credential of logins.users) {
    assert.match(credential.email, /^zarix-e2e-.+@example\.invalid$/i);
    const jar = new Map();
    const client = createServerClient(apiUrl.href, process.env.ZARIX_LOCAL_ANON_KEY, { cookies: {
      getAll: () => [...jar].map(([name, value]) => ({ name, value })),
      setAll: cookies => { for (const { name, value } of cookies) jar.set(name, value); },
    }, global: { fetch: isolatedApiFetch } });
    const login = await client.auth.signInWithPassword({ email: credential.email, password: credential.password });
    assert.equal(login.error, null, 'Ordinary password login must work');
    assert.equal((await client.auth.getUser()).data.user?.id, credential.id);
    assert.equal(sql(`SELECT email FROM auth.users WHERE id=${literal(credential.id)}`), credential.email, 'GoTrue/SQL instance mismatch');
    users.push({ id: credential.id, client, jar });
  }
  const [a, b] = users, run = randomUUID().slice(0, 8);
  report.fixture = { users: users.map(u => u.id), credentials: 'private fixture read into memory only', instances: { app: appUrl.origin, auth: apiUrl.origin, databaseHost: databaseUrl.hostname, databasePort: databaseUrl.port }, run };
  const sources = ['scripts/test-isolated-api.mjs', 'app/api/accounts/route.ts', 'app/api/transactions/route.ts', 'app/api/transactions/[id]/route.ts', 'app/api/investments/[id]/sell/route.ts'];
  report.sourceManifest = await Promise.all(sources.map(async file => ({ path: file, sha256: hash(await fs.readFile(file)) })));
  report.revision = spawnSync('git', ['rev-parse', 'HEAD'], { env: { ...process.env, DEVELOPER_DIR: '/Library/Developer/CommandLineTools' }, encoding: 'utf8' }).stdout.trim();
  const previousPlan = rows(`SELECT id,status,current_period_end,grace_period_end FROM users WHERE id=${literal(a.id)}`)[0];
  restorePlan = () => sql(`UPDATE users SET status=${literal(previousPlan.status)},current_period_end=${previousPlan.current_period_end ? literal(previousPlan.current_period_end) : 'NULL'},grace_period_end=${previousPlan.grace_period_end ? literal(previousPlan.grace_period_end) : 'NULL'} WHERE id=${literal(a.id)}`);
  async function request(user, method, endpoint, payload, requestId = randomUUID(), customHeaders = {}) {
    const headers = { ...(user ? { Cookie: [...user.jar].map(([name, value]) => `${name}=${value}`).join('; ') } : {}), 'Idempotency-Key': requestId, ...customHeaders };
    if (payload !== undefined) headers['Content-Type'] = 'application/json';
    const response = await fetch(new URL(endpoint, appUrl), { method, headers, body: payload === undefined ? undefined : JSON.stringify(payload), redirect: 'error', signal: AbortSignal.timeout(45000) });
    const text = await response.text();
    let body; try { body = text ? JSON.parse(text) : null; } catch { body = null; }
    report.requests.push({ at: new Date().toISOString(), method, path: redactedEndpoint(endpoint).split('?')[0], status: response.status, responseSha256: hash(text) });
    return { status: response.status, body, raw: text };
  }
  async function test(cu, name, fn) {
    const record = { cu, name, status: 'RUNNING', scope: 'API -> DB only; does not close original UI/system case' };
    report.results.push(record);
    try { record.evidence = await fn(); record.status = 'PASS'; }
    catch (error) { record.status = 'FAIL'; record.errorType = error.name; record.reason = 'Assertion failed; raw error withheld to prevent credential leakage'; record.failureLocation = error.stack?.match(/test-isolated-api\.mjs:(\d+):\d+/)?.[1] || null; record.lastObservedRequest = report.requests.at(-1) || null; }
  }
  if (process.env.ZARIX_API_REPLAY_FILE) {
    const receipt = JSON.parse(await fs.readFile(process.env.ZARIX_API_REPLAY_FILE, 'utf8'));
    assert.equal(receipt.userId, a.id); assert.equal(hash(JSON.stringify(receipt.payload)), receipt.payloadSha256);
    await test('CU001', 'same command after a separately executed Next/PostgreSQL restart', async () => {
      const replay = await request(a, 'POST', receipt.endpoint, receipt.payload, receipt.requestId);
      assert.equal(replay.status, 201); assert.equal(hash(JSON.stringify(replay.body)), receipt.responseSha256);
      assert.equal(Number(sql(`SELECT count(*) FROM transactions WHERE id=${literal(receipt.transactionId)}`)), 1);
      assert.equal(balance(receipt.accountId), receipt.expectedBalance);
      return { requestId: receipt.requestId, transactionId: receipt.transactionId, effects: 1, balance: balance(receipt.accountId), responseHashEqual: true, restartEvidence: process.env.ZARIX_RESTART_EVIDENCE || 'Attach independently recorded process restart evidence; this script never restarts services itself.' };
    });
  } else {
    sql(`UPDATE users SET status='ACTIVE',current_period_end=now()+interval '30 days',grace_period_end=NULL WHERE id=${literal(a.id)}`);
    const account = async (name, currency, initialBalance, type = 'bank') => {
      const response = await request(a, 'POST', '/api/accounts', { name: `${name} ${run}`, currency, initialBalance, type });
      assert.equal(response.status, 201); assert.equal(balance(response.body.id), initialBalance); return response.body.id;
    };
    const accountA = await account('API sintética ARS', 'ARS', 200000), usdA = await account('API sintética USD', 'USD', 50), brokerA = await account('API broker', 'USD', 0, 'investment');
    const foreignAccount = await request(b, 'POST', '/api/accounts', { name: `API private B ${run}`, type: 'bank', currency: 'ARS', initialBalance: 7000 });
    assert.equal(foreignAccount.status, 201);
    const beforeB = rows(`SELECT * FROM accounts WHERE user_id=${literal(b.id)} ORDER BY id`);
    await test('CU002', 'normal session API isolation, invalid auth, grants and downgrade reading/export', async () => {
      const foreign = foreignAccount.body.id;
      assert.equal((await request(null, 'GET', '/api/accounts')).status, 401);
      assert.equal((await request(null, 'GET', '/api/accounts', undefined, randomUUID(), { Cookie: 'sb-127-auth-token=not-a-valid-session' })).status, 401);
      const own = await request(a, 'GET', '/api/accounts'); assert.equal(own.status, 200); assert.ok(!own.body.some(r => r.id === foreign));
      assert.equal((await request(a, 'GET', `/api/accounts/${foreign}`)).status, 404);
      assert.ok(rejected((await request(a, 'PATCH', `/api/accounts/${foreign}`, { name: 'Synthetic cross-tenant attempt' })).status));
      const foreignDelete = await request(a, 'DELETE', `/api/accounts/${foreign}`);
      assert.equal(foreignDelete.status, 204);
      assert.deepEqual(rows(`SELECT * FROM accounts WHERE user_id=${literal(b.id)} ORDER BY id`), beforeB);
      const secretDenied = await a.client.from('users').select('gemini_api_key');
      const paidStatusDenied = await a.client.from('users').update({ status: 'ACTIVE' }).eq('id', a.id);
      assert.equal(secretDenied.error?.code, '42501');
      assert.equal(paidStatusDenied.error?.code, '42501');
      sql(`UPDATE users SET status='CANCELED',current_period_end=NULL,grace_period_end=NULL WHERE id=${literal(a.id)}`);
      const before = Number(sql(`SELECT count(*) FROM accounts WHERE user_id=${literal(a.id)}`));
      assert.ok(rejected((await request(a, 'POST', '/api/accounts', { name: `Free over-cap ${run}`, type: 'bank', currency: 'ARS' })).status));
      assert.equal(Number(sql(`SELECT count(*) FROM accounts WHERE user_id=${literal(a.id)}`)), before);
      assert.equal((await request(a, 'GET', '/api/accounts')).status, 200);
      assert.equal((await request(a, 'GET', '/api/export/transactions?format=json')).status, 200);
      sql(`UPDATE users SET status='ACTIVE',current_period_end=now()+interval '30 days' WHERE id=${literal(a.id)}`);
      const activeAccountsAtDowngrade = Number(sql(`SELECT count(*) FROM accounts WHERE user_id=${literal(a.id)} AND is_active AND movement_enabled`));
      return { ids: ['CP2-19', 'CP2-20', 'CP2-09', 'CP2-15'], privateAccountRowsUnchanged: beforeB.length, foreignDelete: { status: foreignDelete.status, ownerScopedNoop: true, allForeignAccountColumnsUnchanged: true, beforeSha256: hash(JSON.stringify(beforeB)) }, anonymousStatuses: [401, 401], normalProfileSecretFieldAndPaidStatusDenied: true, normalProfileDenialCodes: [secretDenied.error.code, paidStatusDenied.error.code], activeAccountsAtDowngrade, historyAndExportAvailable: true, exactThreeAccountFixture: false };
    });
    await test('CU001', 'different-currency transfer, edit/delete, rounding, ten retries and controlled lost acknowledgment', async () => {
      const payload = { type: 'transfer', accountId: accountA, destinationAccountId: usdA, amount: 120000, currency: 'ARS', exchangeRateOverride: 1 / 1200, description: `API FX ${run}` };
      const key = randomUUID();
      const responses = await Promise.all(Array.from({ length: 10 }, () => request(a, 'POST', '/api/transactions', payload, key)));
      assert.ok(responses.every(r => r.status === 201)); assert.ok(responses.every(r => r.body.id === responses[0].body.id));
      assert.equal(balance(accountA), 80000); assert.equal(balance(usdA), 150);
      const id = responses[0].body.id;
      assert.equal(Number(sql(`SELECT destination_amount_in_account_currency FROM transactions WHERE id=${literal(id)}`)), 100);
      const edited = await request(a, 'PATCH', `/api/transactions/${id}`, { amount: 60000, currency: 'ARS', account_id: accountA, destination_account_id: usdA, exchange_rate_override: 1 / 1200 });
      assert.equal(edited.status, 200); assert.equal(balance(accountA), 140000); assert.equal(balance(usdA), 100);
      assert.equal((await request(a, 'DELETE', `/api/transactions/${id}`)).status, 204); assert.equal(balance(accountA), 200000); assert.equal(balance(usdA), 50);
      const invalid = await request(a, 'POST', '/api/transactions', { type: 'expense', accountId: accountA, amount: 1.001, currency: 'ARS' });
      assert.ok(rejected(invalid.status)); assert.equal(balance(accountA), 200000);
      const replayPayload = { type: 'expense', accountId: accountA, amount: 1500, currency: 'ARS', description: `Replay receipt ${run}` }, replayKey = randomUUID();
      const committedButNotObservedByClient = await request(a, 'POST', '/api/transactions', replayPayload, replayKey);
      assert.equal(committedButNotObservedByClient.status, 201); assert.equal(balance(accountA), 198500);
      const replay = await request(a, 'POST', '/api/transactions', replayPayload, replayKey);
      assert.deepEqual(replay.body, committedButNotObservedByClient.body); assert.equal(balance(accountA), 198500);
      const durable = { userId: a.id, accountId: accountA, transactionId: replay.body.id, endpoint: '/api/transactions', requestId: replayKey, payload: replayPayload, payloadSha256: hash(JSON.stringify(replayPayload)), responseSha256: hash(JSON.stringify(replay.body)), expectedBalance: 198500, scope: 'Synthetic replay artifact; no session/capability/provider secret. First response intentionally not treated as observed by logical client; no real network failure induced.' };
      await fs.writeFile(path.join(output, 'durable-replay-fixture.json'), JSON.stringify(durable, null, 2) + '\n', { mode: 0o600 });
      return { ids: ['CP1-03', 'CP1-10', 'CP1-11', 'CNF-11'], transfer: { attempts: 10, effects: 1, sourceAmount: 120000, destinationAmount: 100, balances: [80000, 150] }, afterEdit: [140000, 100], afterDelete: [200000, 50], subcentRejected: true, acknowledgmentSimulation: 'response consumed by test transport but deliberately withheld from logical client state', retryEffects: 1, replayArtifact: 'durable-replay-fixture.json' };
    });
    await test('CU003', 'financial summary API agrees with independent SQL and excludes transfers/other tenant', async () => {
      const response = await request(a, 'GET', '/api/transactions/summary?month=2026-10-01T12:00:00Z');
      assert.equal(response.status, 200);
      const expenses = rows(`SELECT t.type,sum(t.amount) total FROM transactions t JOIN accounts ac ON ac.id=t.account_id WHERE t.user_id=${literal(a.id)} AND ac.is_active=true AND t.transaction_date>='2026-10-01T00:00:00Z' AND t.transaction_date<'2026-11-01T00:00:00Z' AND t.currency='ARS' GROUP BY t.type`);
      const expectedExpense = Number(expenses.find(row => row.type === 'expense')?.total || 0), expectedIncome = Number(expenses.find(row => row.type === 'income')?.total || 0);
      assert.equal(response.body.totalExpenses, expectedExpense); assert.equal(response.body.totalIncome, expectedIncome); assert.equal(response.body.balance, expectedIncome - expectedExpense);
      return { ids: ['CP3-08'], responseSha256: hash(response.raw), independentOwnerARSRows: expenses, expectedExpense, expectedIncome, observedExpense: response.body.totalExpenses, observedIncome: response.body.totalIncome, scope: 'summary API and ARS SQL dataset/month UTC; no browser presentation or Gemini semantic acceptance' };
    });
    await test('CU004', 'manual-price investment API, durable partial sale and excessive sale refusal', async () => {
      const purchase = await request(a, 'POST', '/api/investments', { accountId: brokerA, type: 'stock_us', name: `API manual ${run}`, quantity: 10, purchasePrice: 100, purchaseCurrency: 'USD', purchaseDate: '2026-10-01', isManualPrice: true, currentPrice: 110, marketCurrency: 'USD' });
      assert.equal(purchase.status, 201); const id = purchase.body.id;
      const key = randomUUID(), body = { quantity: 4, price: 120, currency: 'USD', soldAt: '2026-10-13' };
      const sales = await Promise.all(Array.from({ length: 10 }, () => request(a, 'POST', `/api/investments/${id}/sell`, body, key)));
      assert.ok(sales.every(s => s.status === 201)); assert.ok(sales.every(s => s.body.sale.id === sales[0].body.sale.id));
      assert.equal(Number(sql(`SELECT quantity FROM investments WHERE id=${literal(id)}`)), 6);
      assert.equal(Number(sql(`SELECT sum(realized_pnl_native) FROM investment_sales WHERE investment_id=${literal(id)}`)), 80);
      assert.ok(rejected((await request(a, 'POST', `/api/investments/${id}/sell`, { ...body, quantity: 7 })).status));
      assert.equal(Number(sql(`SELECT count(*) FROM investment_sales WHERE investment_id=${literal(id)}`)), 1); assert.equal(balance(brokerA), 0);
      return { ids: ['CP4-02', 'CP4-04', 'CP4-06', 'CP4-12', 'CNF-11'], remainingQuantity: 6, realizedUSD: 80, saleAttempts: 10, effects: 1, brokerCashUnchanged: 0 };
    });
    await test('CU001', 'cron invalid authentication denied before financial effects', async () => {
      const before = sql('SELECT count(*) FROM transactions');
      const noCredential = await request(null, 'GET', '/api/cron/recurring');
      const incorrect = await request(null, 'GET', '/api/cron/recurring', undefined, randomUUID(), { Authorization: 'Bearer synthetic-invalid' });
      assert.equal(noCredential.status, 401); assert.equal(incorrect.status, 401); assert.equal(sql('SELECT count(*) FROM transactions'), before);
      return { id: 'CNF-10', statuses: [401, 401], financialEffect: 0, scope: 'denial path only; successful cron and injected provider failure remain separate' };
    });
    await test('CU001', 'three-member shared expense capability, retry, manipulated IDs and revocation', async () => {
      const guest = logins.guest;
      assert.ok(guest, 'Owned private guest fixture is required');
      const groupId = guest.groupId, token = guest.token;
      assert.ok(token); const members = rows(`SELECT id FROM shared_group_members WHERE group_id=${literal(groupId)} ORDER BY created_at,id`);
      assert.equal(members.length, 3);
      const body = { description: `Cena sintética ${run}`, amount: 100, actorMemberId: guest.memberId, paidByMemberId: guest.payerMemberId }, key = randomUUID();
      const before = Number(sql(`SELECT count(*) FROM shared_expenses WHERE group_id=${literal(groupId)}`));
      const first = await request(null, 'POST', `/api/shared/${token}/expenses`, body, key); assert.equal(first.status, 201);
      const replay = await request(null, 'POST', `/api/shared/${token}/expenses`, body, key); assert.deepEqual(replay.body, first.body);
      const splits = rows(`SELECT amount FROM shared_expense_splits WHERE expense_id=${literal(first.body.id)} ORDER BY amount DESC`);
      assert.deepEqual(splits.map(row => Number(row.amount)), [33.34, 33.33, 33.33]);
      const foreignMember = guest.foreignMemberId;
      assert.ok(foreignMember);
      assert.ok(rejected((await request(null, 'POST', `/api/shared/${token}/expenses`, { ...body, actorMemberId: foreignMember })).status));
      assert.equal(Number(sql(`SELECT count(*) FROM shared_expenses WHERE group_id=${literal(groupId)}`)), before + 1);
      assert.equal((await request(null, 'POST', `/api/shared/${'0'.repeat(32)}/expenses`, body)).status, 404);
      sql(`UPDATE shared_groups SET is_active=false WHERE id=${literal(groupId)} AND owner_user_id=${literal(a.id)}`);
      assert.equal((await request(null, 'POST', `/api/shared/${token}/expenses`, body)).status, 404);
      assert.equal(Number(sql(`SELECT count(*) FROM shared_expenses WHERE group_id=${literal(groupId)}`)), before + 1);
      return { ids: ['CP1-36', 'CP1-38'], expenseId: first.body.id, splitAmounts: [33.34, 33.33, 33.33], effects: 1, crossGroupActorDenied: true, invalidAndRevokedCapabilityStatuses: [404, 404], scope: 'API capability author, not proof of individual Auth identity for a guest; one new E2E-owned guest; source/recovery fixtures unchanged' };
    });
    await test('CU001', 'successful concurrent cron retries retain one occurrence and one durable outbox intent', async () => {
      assert.ok(process.env.ZARIX_CRON_SECRET_FILE, 'Private local CRON_SECRET fixture required');
      const cronSecret = (await fs.readFile(process.env.ZARIX_CRON_SECRET_FILE, 'utf8')).trim();
      const cronAccount = await account('API cron synthetic cash', 'ARS', 10000);
      const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date());
      const rule = await request(a, 'POST', '/api/recurring', { accountId: cronAccount, type: 'expense', amount: 400, currency: 'ARS', frequency: 'daily', startDate: today, endDate: today, description: `Cron synthetic ${run}`, notificationEnabled: true });
      assert.equal(rule.status, 201);
      const responses = await Promise.all([request(null, 'GET', '/api/cron/recurring', undefined, randomUUID(), { Authorization: `Bearer ${cronSecret}` }), request(null, 'GET', '/api/cron/recurring', undefined, randomUUID(), { Authorization: `Bearer ${cronSecret}` })]);
      assert.ok(responses.every(response => response.status === 200));
      assert.equal(Number(sql(`SELECT count(*) FROM transactions WHERE recurring_rule_id=${literal(rule.body.id)}`)), 1); assert.equal(balance(cronAccount), 9600);
      assert.equal(Number(sql(`SELECT count(*) FROM notification_outbox WHERE user_id=${literal(a.id)} AND event_key=${literal(`recurring:${rule.body.id}:${today}`)}`)), 1);
      sql(`UPDATE recurring_rules SET is_active=false WHERE id=${literal(rule.body.id)} AND user_id=${literal(a.id)}`);
      return { ids: ['CP1-24', 'CNF-10', 'CNF-11'], ruleId: rule.body.id, submissions: 2, occurrences: 1, outboxIntents: 1, balance: 9600, scope: 'Actual cron API and durable DB outbox; no provider delivery or provider failure executed' };
    });
  }
  report.sourceStable = (await Promise.all(report.sourceManifest.map(async source => hash(await fs.readFile(source.path)) === source.sha256))).every(Boolean);
  report.status = report.results.some(r => r.status === 'FAIL') || !report.sourceStable ? 'FAIL' : 'PASS';
  report.blockers.push({ ids: ['CU001', 'CU002', 'CU003', 'CU004'], reason: 'API-only checks never establish the full UI -> API -> DB journey.' });
} catch (error) {
  report.status = 'FAIL'; report.blockers.push({ reason: 'API harness prerequisite/assertion failed; no raw potentially sensitive error persisted', errorType: error.name });
} finally {
  if (restorePlan) restorePlan();
  report.finishedAt = new Date().toISOString();
  await fs.writeFile(path.join(output, 'api-verification.json'), JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
  console.log(JSON.stringify({ report: path.join(output, 'api-verification.json'), status: report.status, checks: report.results.map(({ cu, name, status }) => ({ cu, name, status })) }, null, 2));
  if (report.status !== 'PASS') process.exitCode = 1;
}
