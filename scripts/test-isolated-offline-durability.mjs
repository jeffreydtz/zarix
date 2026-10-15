// Real Chrome/IndexedDB -> Next -> PostgreSQL. Only the disposable E2E replica.
// Two phases let the root stop/start its own Next process while Chrome is closed.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createHash, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { isolatedNativeTargets, isolatedPgEnvironment, isolatedApiFetch, safeNativeFailure } from './lib/test-isolated-native-target.mjs';

const mode = process.env.ZARIX_OFFLINE_PHASE || 'prepare';
const output = path.resolve(process.env.ZARIX_OFFLINE_OUTPUT || '/tmp/zarix-offline-durability');
const stateFile = path.resolve(process.env.ZARIX_OFFLINE_STATE_FILE || '/tmp/zarix-runtime-20261015/offline-durability-state.json');
const restartFile = process.env.ZARIX_OFFLINE_RESTART_PROOF || '/tmp/zarix-runtime-20261015/next-restart-proof.json';
const sha = value => createHash('sha256').update(value).digest('hex');
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
  ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)])) : value;
const digest = value => sha(JSON.stringify(canonical(value)));
const literal = value => `'${String(value).replaceAll("'", "''")}'`;
const money = value => Math.round(value * 100) / 100;
const sourcePaths = [
  'scripts/test-isolated-offline-durability.mjs', 'scripts/lib/test-isolated-native-target.mjs',
  'app/login/page.tsx', 'components/settings/LogoutButton.tsx', 'components/add-transaction/AddTransactionProvider.tsx',
  'components/expenses/InlineQuickCreate.tsx',
  'components/offline/QueueReview.tsx', 'components/OfflineReferenceWarmup.tsx',
  'lib/offline-reference-cache.ts', 'lib/offline-transaction-store.ts', 'lib/offline-queue-sync.ts',
  'lib/hooks/useFinancialOperation.ts', 'lib/hooks/useOfflineQueue.ts', 'lib/hooks/useServiceWorker.ts',
  'public/sw.js', 'app/api/accounts/route.ts', 'app/api/categories/route.ts', 'app/api/transactions/route.ts',
  'lib/services/accounts.ts', 'lib/services/transactions.ts', 'lib/transaction-idempotency.ts',
  'supabase/migrations/20261009034852_durable_financial_requests_outbox.sql',
  'supabase/migrations/20261015000402_atomic_account_balance_recompute.sql', 'package-lock.json',
];
const manifest = () => Promise.all(sourcePaths.map(async file => ({ path: file, sha256: sha(await fs.readFile(file)) })));
const report = { startedAt: new Date().toISOString(), phase: mode, status: 'RUNNING',
  scope: 'CU001 scoped offline/response-loss/explicit-intent journey and related CU002 ordinary same-profile identity isolation. Partial acceptance; no fifth CU, provider or monthly availability claim.',
  cases: [], browserEvents: [], requests: [], screenshots: [], blockedRoutes: [], injections: [],
  environment: { node: process.version, platform: process.platform, arch: process.arch, release: os.release() },
};
let context = null, page = null, stage = 'target guards', state = null;
let allowFinancialPosts = true, loseNextResponse = false, lostResponse = null;
let resolveLost, rejectLost;
await fs.mkdir(output, { recursive: true, mode: 0o700 });
async function save() {
  report.finishedAt = new Date().toISOString();
  await fs.writeFile(path.join(output, `${mode}-verification.json`), JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
}
const unwrap = result => { if (result.error) throw new Error('Ordinary isolated Auth verification failed'); return result.data; };
const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
try {
  assert.ok(['prepare', 'resume', 'identity'].includes(mode), 'Unknown phase');
  const { apiUrl, databaseUrl } = isolatedNativeTargets();
  assert.equal(process.env.ZARIX_API_TARGET_PURPOSE, 'isolated-api-e2e-replica');
  assert.equal(`${apiUrl.port}:${databaseUrl.port}`, '57321:57322', 'Source, restore and load replicas are refused');
  const appUrl = new URL(process.env.ZARIX_E2E_APP_URL || 'http://127.0.0.1:3000');
  assert.ok(['127.0.0.1', 'localhost'].includes(appUrl.hostname));
  assert.equal(appUrl.port, '3000'); assert.equal(appUrl.protocol, 'http:');
  assert.ok(!appUrl.username && !appUrl.password && !appUrl.search && !appUrl.hash);
  appUrl.hostname = '127.0.0.1';
  assert.ok(process.env.ZARIX_LOCAL_ANON_KEY);
  const fixtureFile = process.env.ZARIX_TEST_LOGIN_FILE;
  assert.ok(fixtureFile, 'Private existing test login fixture is required');
  assert.equal((await fs.stat(fixtureFile)).mode & 0o077, 0);
  const fixture = JSON.parse(await fs.readFile(fixtureFile, 'utf8'));
  assert.equal(fixture.purpose, 'isolated-api-e2e-replica');
  assert.equal(fixture.users.length, 2); assert.ok(fixture.guest, 'Reuse the existing two users and guest; never create identities');
  const pgEnv = isolatedPgEnvironment(databaseUrl);
  const psql = path.join(process.env.ZARIX_PG_BIN || '', 'psql');
  function sql(statement) {
    const child = spawnSync(psql, ['-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-c', statement], { env: pgEnv, encoding: 'utf8' });
    assert.equal(child.status, 0, 'Read-only isolated SQL assertion failed; raw diagnostics omitted');
    return child.stdout.trim();
  }
  const rows = query => JSON.parse(sql(`SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM (${query}) t`));
  const balance = id => Number(sql(`SELECT balance FROM accounts WHERE id=${literal(id)}`));
  const users = fixture.users;
  stage = 'ordinary existing isolated Auth preflight';
  for (const user of users) {
    assert.match(user.email, /^zarix-e2e-.+@example\.invalid$/i);
    const auth = createClient(apiUrl.href, process.env.ZARIX_LOCAL_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { fetch: isolatedApiFetch },
    });
    const signed = unwrap(await auth.auth.signInWithPassword({ email: user.email, password: user.password }));
    assert.equal(signed.user.id, user.id); assert.equal(unwrap(await auth.auth.getUser()).user.id, user.id);
    assert.equal(sql(`SELECT email FROM auth.users WHERE id=${literal(user.id)}`), user.email);
    const claims = JSON.parse(Buffer.from(signed.session.access_token.split('.')[1], 'base64url'));
    assert.equal(claims.role, 'authenticated');
    // Dispose only this preflight's own session; preserve the Chrome session
    // and other ordinary fixture clients that may already be authenticated.
    await auth.auth.signOut({ scope: 'local' });
  }
  const [a, b] = users;
  report.target = { appOrigin: appUrl.origin, apiOrigin: apiUrl.origin, databasePort: databaseUrl.port, purpose: fixture.purpose };
  report.identities = { users: users.map(user => user.id), ordinaryAuth: true, reused: true, guestReusedWithoutNewIdentity: true,
    credentials: 'Existing private 0600 fixture; no sessions, passwords or capability tokens copied into evidence.' };
  report.sourceManifest = await manifest();
  report.revision = spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', env: { ...process.env, DEVELOPER_DIR: '/Library/Developer/CommandLineTools' } }).stdout.trim();
  report.buildId = (await fs.readFile('.next/BUILD_ID', 'utf8')).trim();
  assert.match(report.buildId, /^[A-Za-z0-9_-]+$/);
  assert.ok(process.env.ZARIX_PLAYWRIGHT_MODULE, 'Existing isolated Playwright module is required');
  const { chromium } = await import(pathToFileURL(process.env.ZARIX_PLAYWRIGHT_MODULE).href);
  const executablePath = process.env.ZARIX_CHROME_EXECUTABLE || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  await fs.access(executablePath);
  if (mode === 'prepare') {
    const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'zarix-offline-chrome-'));
    await fs.chmod(profile, 0o700);
    state = { purpose: 'isolated-offline-durability', target: report.target, profile, run: randomUUID().slice(0, 8),
      sourceManifest: report.sourceManifest, buildId: report.buildId, users: users.map(user => user.id) };
  } else {
    assert.equal((await fs.stat(stateFile)).mode & 0o077, 0);
    state = JSON.parse(await fs.readFile(stateFile, 'utf8'));
    assert.equal(state.purpose, 'isolated-offline-durability'); assert.deepEqual(state.target, report.target);
    assert.deepEqual(state.users, report.identities.users);
    if (mode === 'identity') {
      const appSources = sources => sources.filter(source => source.path !== 'scripts/test-isolated-offline-durability.mjs');
      assert.deepEqual(appSources(state.sourceManifest), appSources(report.sourceManifest));
      report.harnessContinuation = { originalSourceSha256: state.sourceManifest.find(source => source.path === 'scripts/test-isolated-offline-durability.mjs').sha256,
        currentSourceSha256: report.sourceManifest.find(source => source.path === 'scripts/test-isolated-offline-durability.mjs').sha256,
        applicationManifestUnchanged: true, scope: 'Identity-only retry after a diagnosed ambiguous harness selector; original financial effects are preserved and not repeated.' };
    } else assert.deepEqual(state.sourceManifest, report.sourceManifest);
    assert.equal(state.buildId, report.buildId);
    assert.ok(await fs.realpath(state.profile).then(real => /^\/(?:private\/)?(?:tmp|var\/folders\/[^/]+\/[^/]+\/T)\/zarix-offline-chrome-/.test(real)));
    assert.equal((await fs.stat(state.profile)).mode & 0o077, 0);
    stage = 'root-owned Next restart proof';
    const proof = JSON.parse(await fs.readFile(restartFile, 'utf8'));
    assert.equal(proof.purpose, 'isolated-offline-server-restart'); assert.equal(proof.appOrigin, appUrl.origin);
    assert.equal(proof.before.buildId, state.buildId); assert.equal(proof.after.buildId, state.buildId);
    assert.ok(Number.isInteger(proof.before.pid) && Number.isInteger(proof.after.pid) && proof.before.pid !== proof.after.pid);
    assert.equal(proof.before.stopConfirmed, true); assert.equal(proof.after.startConfirmed, true);
    assert.ok(Date.parse(proof.before.stoppedAt) >= Date.parse(state.chromeClosedAt));
    assert.ok(Date.parse(proof.after.startedAt) >= Date.parse(proof.before.stoppedAt));
    report.serverRestart = { purpose: proof.purpose, appOrigin: proof.appOrigin,
      before: { pid: proof.before.pid, buildId: proof.before.buildId, stoppedAt: proof.before.stoppedAt, stopConfirmed: true },
      after: { pid: proof.after.pid, buildId: proof.after.buildId, startedAt: proof.after.startedAt, startConfirmed: true },
      proofSha256: sha(await fs.readFile(restartFile)), scope: 'Actual root-owned Next process restart; no PostgreSQL or machine restart claim.' };
    allowFinancialPosts = false;
  }
  let browserIndex = 0, currentPid = null;
  const allowedOrigins = new Set([appUrl.origin, apiUrl.origin]);
  async function openChrome() {
    assert.equal(context, null, 'Only one owned Chrome process uses the private profile');
    const browserEnv = Object.fromEntries(['PATH', 'HOME', 'USER', 'LOGNAME', 'TMPDIR', 'LANG', 'LC_ALL', 'DISPLAY'].filter(key => process.env[key]).map(key => [key, process.env[key]]));
    context = await chromium.launchPersistentContext(state.profile, {
      executablePath, headless: process.env.ZARIX_E2E_HEADED !== '1', viewport: { width: 1440, height: 900 },
      timezoneId: 'Etc/UTC', serviceWorkers: 'allow', env: { ...browserEnv, TZ: 'Etc/UTC' },
    });
    const browser = context.browser(); assert.ok(browser);
    const cdp = await browser.newBrowserCDPSession();
    const processInfo = (await cdp.send('SystemInfo.getProcessInfo')).processInfo;
    currentPid = processInfo.find(process => process.type === 'browser')?.id; await cdp.detach();
    assert.ok(Number.isInteger(currentPid));
    report.environment.browser = { product: 'Installed Google Chrome', version: browser.version(), executablePath,
      persistentProfilePermissions: '0700', playwright: 'existing isolated 1.64.0 installation', serviceWorkers: 'real production worker allowed', headless: process.env.ZARIX_E2E_HEADED !== '1' };
    report.browserEvents.push({ at: new Date().toISOString(), event: 'persistent-Chrome-launched', browserIndex: ++browserIndex, pid: currentPid });
    await context.route('**/*', async route => {
      const request = route.request(), url = new URL(request.url());
      if (!allowedOrigins.has(url.origin) && !['data:', 'blob:'].includes(url.protocol)) {
        report.blockedRoutes.push({ origin: url.origin, path: url.pathname.replace(/\/shared\/[^/]+/, '/shared/[redacted]'), method: request.method() });
        return route.abort('blockedbyclient');
      }
      if (url.origin === appUrl.origin && url.pathname === '/api/transactions' && request.method() === 'POST') {
        if (!allowFinancialPosts) return route.abort('internetdisconnected');
        if (loseNextResponse) {
          loseNextResponse = false;
          try {
            const response = await route.fetch({ maxRedirects: 0 });
            assert.equal(response.status(), 201);
            const result = await response.json(); assert.match(result.id, /^[0-9a-f-]{36}$/);
            const requestId = request.headers()['idempotency-key']; assert.match(requestId, /^[0-9a-f-]{36}$/);
            lostResponse = { at: new Date().toISOString(), kind: 'response-aborted-after-real-HTTP-201', status: 201,
              requestId, transactionId: result.id, responseSha256: digest(result), browserReceivedSuccess: false };
            report.injections.push(lostResponse);
            await route.abort('failed'); resolveLost(lostResponse);
            return;
          } catch (error) { await route.abort('failed').catch(() => {}); rejectLost(new Error('Real post-commit response-loss injection failed')); return; }
        }
      }
      return route.continue();
    });
    context.on('response', response => {
      const url = new URL(response.url());
      if (url.origin === appUrl.origin && url.pathname.startsWith('/api/')) report.requests.push({ at: new Date().toISOString(),
        method: response.request().method(), path: url.pathname.replace(/\/shared\/[^/]+/, '/shared/[redacted]'), status: response.status() });
    });
    page = context.pages()[0] || await context.newPage(); page.setDefaultTimeout(20_000);
    return page;
  }
  async function closeChrome() {
    if (!context) return;
    const pid = currentPid, browser = context.browser();
    const disconnected = browser ? new Promise(resolve => browser.once('disconnected', resolve)) : Promise.resolve();
    await context.close(); await disconnected; context = null; page = null;
    let gone = false;
    for (let index = 0; index < 50; index++) {
      try { process.kill(pid, 0); } catch (error) { if (error.code === 'ESRCH') { gone = true; break; } }
      await delay(100);
    }
    assert.equal(gone, true, 'Owned Chrome process exit must be demonstrated');
    state.chromeClosedAt = new Date().toISOString();
    report.browserEvents.push({ at: state.chromeClosedAt, event: 'owned-Chrome-exited', pid, browserIndex });
  }
  async function login(targetPage, user) {
    await targetPage.goto(new URL('/login', appUrl).href);
    await targetPage.getByLabel('Email', { exact: true }).fill(user.email);
    await targetPage.locator('#password').fill(user.password);
    await targetPage.getByRole('button', { name: 'Ingresar', exact: true }).click();
    await targetPage.waitForURL('**/dashboard', { timeout: 45_000 });
  }
  async function screenshot(name, targetPage = page) {
    const url = new URL(targetPage.url());
    assert.ok(url.origin === appUrl.origin && !/^\/(?:login|register|auth)/.test(url.pathname));
    assert.equal(await targetPage.locator('input[type="password"]').count(), 0);
    const file = `${mode}-${name}.png`; await targetPage.screenshot({ path: path.join(output, file), fullPage: true });
    await fs.chmod(path.join(output, file), 0o600);
    report.screenshots.push({ path: file, sha256: sha(await fs.readFile(path.join(output, file))) });
  }
  async function test(cu, name, execute) {
    stage = name; const result = { cu, name, status: 'RUNNING', checks: [] }; report.cases.push(result); await save();
    await execute(result.checks); result.status = 'PASS'; await save(); return result;
  }
  const modal = targetPage => targetPage.locator('div.bg-card').filter({ has: targetPage.getByRole('heading', { name: 'Nuevo movimiento', exact: true }) }).last();
  const newMovement = targetPage => targetPage.locator('header.page-hero').filter({ has: targetPage.getByRole('heading', { name: 'Movimientos', exact: true }) })
    .getByRole('button', { name: 'Nuevo', exact: true });
  async function openMovement(targetPage = page, accountId = state.accountA) {
    await targetPage.goto(new URL('/expenses', appUrl).href);
    await newMovement(targetPage).click();
    const panel = modal(targetPage); await panel.getByPlaceholder('0', { exact: true }).waitFor();
    await panel.locator('select').filter({ has: targetPage.locator(`option[value="${accountId}"]`) }).selectOption(accountId);
    return panel;
  }
  async function fillMovement(description, amount, targetPage = page) {
    const panel = await openMovement(targetPage);
    await panel.getByPlaceholder('0', { exact: true }).fill(String(amount));
    await panel.getByPlaceholder('ej: Compra en el súper', { exact: true }).fill(description);
    return panel;
  }
  async function queueItems(targetPage = page) {
    return targetPage.evaluate(async run => {
      const db = await new Promise((resolve, reject) => { const request = indexedDB.open('zarix-offline', 1); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(new Error('IndexedDB unavailable')); });
      if (!db.objectStoreNames.contains('pending_transactions')) { db.close(); return []; }
      const saved = await new Promise((resolve, reject) => { const tx = db.transaction('pending_transactions', 'readonly'); const request = tx.objectStore('pending_transactions').getAll(); tx.oncomplete = () => resolve(request.result); tx.onabort = () => reject(new Error('IndexedDB transaction aborted')); }); db.close();
      return saved.filter(item => item.endpoint === '/api/transactions' && String(item.payload?.description || '').includes(run)).map(item => ({
        id: item.id, ownerId: item.ownerId, payload: item.payload, receiptId: item.confirmedReceipt?.id || null,
      }));
    }, state.run);
  }
  async function queued(description) {
    let found;
    for (let index = 0; index < 100; index++) { found = (await queueItems()).find(item => item.payload.description === description); if (found) break; await delay(100); }
    assert.ok(found); assert.equal(found.ownerId, a.id); assert.match(found.id, /^[0-9a-f-]{36}$/); return found;
  }
  function financialEvidence(item, expectedBalance) {
    const transactions = rows(`SELECT id,amount::text AS amount FROM transactions WHERE user_id=${literal(a.id)} AND account_id=${literal(state.accountA)} AND description=${literal(item.payload.description)}`);
    const receipts = rows(`SELECT request_id,request_hash,response->>'id' AS transaction_id FROM transaction_requests WHERE user_id=${literal(a.id)} AND request_id=${literal(item.id)}`);
    assert.equal(transactions.length, 1); assert.equal(receipts.length, 1); assert.equal(receipts[0].transaction_id, transactions[0].id);
    assert.equal(balance(state.accountA), expectedBalance);
    return { requestId: item.id, transactionId: transactions[0].id, financialRows: 1, durableReceipts: 1,
      amount: Number(transactions[0].amount), expectedBalance, observedBalance: balance(state.accountA), requestHash: receipts[0].request_hash };
  }
  async function recoverSelected(item, expectedBalance) {
    await page.goto(new URL('/expenses', appUrl).href);
    if (new URL(page.url()).pathname === '/login') { await login(page, a); await page.goto(new URL('/expenses', appUrl).href); }
    const recovered = await queued(item.payload.description); assert.equal(recovered.id, item.id);
    await page.getByText('Sincronizando...', { exact: true }).waitFor({ state: 'hidden' });
    const review = page.locator('details').filter({ has: page.getByText(new RegExp('Revisar cola')) });
    await review.locator('summary').click();
    const row = review.locator('div.border-t').filter({ has: page.getByText(item.payload.description, { exact: true }) });
    await row.waitFor(); allowFinancialPosts = true;
    const responsePromise = page.waitForResponse(response => new URL(response.url()).pathname === '/api/transactions' && response.request().method() === 'POST' && response.status() === 201);
    await row.getByRole('button', { name: 'Reintentar esta solicitud', exact: true }).click();
    const response = await responsePromise; assert.equal(response.headers()['idempotency-key'], item.id);
    const receipt = await response.json();
    assert.equal(receipt.id, financialEvidence(item, expectedBalance).transactionId);
    await row.waitFor({ state: 'hidden' });
    assert.ok(!(await queueItems()).some(saved => saved.id === item.id));
    return { ...financialEvidence(item, expectedBalance), responseSha256: digest(receipt), selectedStoredId: true };
  }
  async function createAccount(targetPage, name, initial) {
    await targetPage.goto(new URL('/accounts', appUrl).href);
    await targetPage.getByRole('button', { name: 'Nueva Cuenta', exact: true }).click();
    const panel = targetPage.locator('div.bg-card.rounded-3xl').filter({ has: targetPage.getByRole('heading', { name: 'Nueva Cuenta', exact: true }) });
    await panel.getByPlaceholder('Ej: Banco Galicia, Mercado Pago', { exact: true }).fill(name);
    await panel.getByRole('button', { name: 'Banco', exact: false }).click();
    await panel.getByPlaceholder('0.00', { exact: true }).fill(String(initial));
    const responsePromise = targetPage.waitForResponse(response => new URL(response.url()).pathname === '/api/accounts' && response.request().method() === 'POST');
    await panel.getByRole('button', { name: 'Crear Cuenta', exact: true }).click();
    const response = await responsePromise; assert.equal(response.status(), 201);
    const account = await response.json(); assert.equal(balance(account.id), initial); return account.id;
  }
  async function savePrivateState() {
    await fs.mkdir(path.dirname(stateFile), { recursive: true, mode: 0o700 });
    await fs.writeFile(stateFile, JSON.stringify(state, null, 2) + '\n', { mode: 0o600 }); await fs.chmod(stateFile, 0o600);
  }
  await openChrome();
  if (mode === 'prepare') {
    stage = 'normal Chrome UI login'; await login(page, a);
    state.accountA = await createAccount(page, `Durabilidad A ${state.run}`, 10000);
    await test('CU001', 'offline submit survives an actual Chrome close/reopen and selected online recovery', async checks => {
      const description = `Offline ${state.run}`, panel = await fillMovement(description, 11.11);
      const before = balance(state.accountA); await context.setOffline(true);
      assert.equal(await page.evaluate(() => navigator.onLine), false);
      await panel.getByRole('button', { name: 'Guardar offline', exact: true }).click();
      const item = await queued(description); assert.equal(balance(state.accountA), before);
      assert.equal(Number(sql(`SELECT count(*) FROM transactions WHERE account_id=${literal(state.accountA)} AND description=${literal(description)}`)), 0);
      await panel.getByRole('button', { name: 'Cerrar', exact: true }).click();
      await screenshot('offline-pending');
      const oldPid = currentPid; await closeChrome(); allowFinancialPosts = false; await openChrome(); assert.notEqual(currentPid, oldPid);
      const result = await recoverSelected(item, money(before - 11.11));
      checks.push({ ...result, offlineNetworkState: true, processRestart: true, oldChromePid: oldPid, newChromePid: currentPid,
        automaticReplayHeldUntilExplicitSelection: true, serverRestart: false });
      await screenshot('offline-recovered');
    });
    stage = 'real HTTP commit with response lost before browser acknowledgement';
    const result = { cu: 'CU001', name: stage, status: 'PENDING_SERVER_RESTART', checks: [] }; report.cases.push(result);
    const description = `Respuesta perdida ${state.run}`, before = balance(state.accountA);
    const panel = await fillMovement(description, 22.22);
    const lost = new Promise((resolve, reject) => { resolveLost = resolve; rejectLost = reject; }); loseNextResponse = true;
    await panel.getByRole('button', { name: 'Guardar', exact: true }).click();
    const injection = await lost, item = await queued(description); assert.equal(item.id, injection.requestId); assert.equal(item.receiptId, null);
    const evidence = financialEvidence(item, money(before - 22.22)); assert.equal(evidence.transactionId, injection.transactionId);
    result.checks.push({ ...evidence, actualHTTP201: true, browserAcknowledgementAborted: true, browserReceivedSuccess: false });
    await panel.getByRole('button', { name: 'Cerrar', exact: true }).click(); await screenshot('response-lost-pending');
    state.lost = { item, expectedBalance: evidence.expectedBalance, expectedTransactionId: evidence.transactionId,
      expectedResponseSha256: injection.responseSha256, requestHash: evidence.requestHash };
    await closeChrome(); await savePrivateState();
    report.status = 'WAITING_SERVER_RESTART'; report.handoff = { chromeClosedAt: state.chromeClosedAt,
      rootAction: 'Restart only the owned Next process on port 3000 with the same frozen build; then supply sanitized restart proof and run resume.',
      stateFile, pendingRequestId: item.id, transactionId: evidence.transactionId, expectedBalance: evidence.expectedBalance,
      profilePolicy: 'Owned temporary 0700 persistent Chrome profile retained privately, never copied into evidence.' };
  } else {
    if (mode === 'identity') {
      stage = 'normal UI identity-only reauthentication';
      await page.goto(new URL('/settings', appUrl).href);
      if (new URL(page.url()).pathname !== '/login') {
        await page.getByRole('button', { name: 'Cerrar sesión', exact: true }).click();
        await page.waitForURL('**/login', { timeout: 45_000 });
      }
      await login(page, a);
    }
    if (mode === 'resume') {
    await test('CU001', 'post-commit response loss survives actual Chrome and separately documented Next restart', async checks => {
      const result = await recoverSelected(state.lost.item, state.lost.expectedBalance);
      assert.equal(result.transactionId, state.lost.expectedTransactionId); assert.equal(result.responseSha256, state.lost.expectedResponseSha256);
      assert.equal(result.requestHash, state.lost.requestHash); checks.push({ ...result, serverRestartProof: report.serverRestart.proofSha256,
        browserRestart: true, nextRestart: true, PostgreSQLRestart: false }); await screenshot('response-lost-recovered');
    });
    await test('CU001', 'two independent new UI intents with identical payload create two different IDs and two effects', async checks => {
      const description = `Iguales independientes ${state.run}`, before = balance(state.accountA), created = [];
      for (let index = 0; index < 2; index++) {
        const panel = await fillMovement(description, 33.33);
        const responsePromise = page.waitForResponse(response => new URL(response.url()).pathname === '/api/transactions' && response.request().method() === 'POST');
        await panel.getByRole('button', { name: 'Guardar', exact: true }).click();
        const response = await responsePromise; assert.equal(response.status(), 201);
        const receipt = await response.json(), key = response.headers()['idempotency-key'];
        const payload = response.request().postDataJSON(); assert.equal(payload.description, description); assert.equal(payload.accountId, state.accountA);
        assert.match(key, /^[0-9a-f-]{36}$/); created.push({ requestId: key, transactionId: receipt.id, payloadSha256: digest(payload) });
        await panel.waitFor({ state: 'hidden' });
      }
      assert.notEqual(created[0].requestId, created[1].requestId); assert.notEqual(created[0].transactionId, created[1].transactionId);
      assert.equal(created[0].payloadSha256, created[1].payloadSha256);
      assert.equal(Number(sql(`SELECT count(*) FROM transactions WHERE account_id=${literal(state.accountA)} AND description=${literal(description)}`)), 2);
      assert.equal(Number(sql(`SELECT count(*) FROM transaction_requests WHERE user_id=${literal(a.id)} AND request_id IN (${created.map(item => literal(item.requestId)).join(',')})`)), 2);
      assert.equal(balance(state.accountA), money(before - 66.66));
      checks.push({ independentIntents: created, financialRows: 2, durableReceipts: 2, expectedBalance: money(before - 66.66), observedBalance: balance(state.accountA),
        scope: 'Two separately initiated identical UI commands, sequential to distinguish creation from retries; multi-session contention is a separate native check.' });
      await screenshot('independent-equal-intents');
    });
    }
    await test('CU002', 'normal logout/signin A to B in the same persistent profile exposes no A references or form fields', async checks => {
      const categoryName = `Categoría privada A ${state.run}${mode === 'identity' ? ` ${randomUUID().slice(0, 8)}` : ''}`, draft = `Borrador privado A ${state.run}`;
      const panelA = await openMovement();
      await panelA.getByRole('button', { name: 'Todas las categorías…', exact: true }).click();
      await panelA.getByRole('button', { name: 'Nueva categoría…', exact: true }).click();
      await panelA.getByPlaceholder('ej: Mascotas', { exact: true }).fill(categoryName);
      const responsePromise = page.waitForResponse(response => new URL(response.url()).pathname === '/api/categories' && response.request().method() === 'POST');
      await panelA.getByRole('button', { name: 'Crear y usar', exact: true }).click();
      const categoryResponse = await responsePromise; assert.equal(categoryResponse.status(), 201); const category = await categoryResponse.json();
      await page.waitForFunction(({ ownerId, id }) => { try { return JSON.parse(localStorage.getItem(`zarix-offline-snapshot-categories-v2:${ownerId}`) || '[]').some(row => row.id === id); } catch { return false; } }, { ownerId: a.id, id: category.id });
      const warmedAt = Date.now();
      await panelA.getByPlaceholder('0', { exact: true }).fill('444.44'); await panelA.getByPlaceholder('ej: Compra en el súper', { exact: true }).fill(draft);
      const otherTab = await context.newPage(); await otherTab.goto(new URL('/settings', appUrl).href);
      await otherTab.getByRole('button', { name: 'Cerrar sesión', exact: true }).click(); await otherTab.waitForURL('**/login', { timeout: 45_000 });
      await page.waitForFunction(() => { const input = document.querySelector('input[placeholder="ej: Compra en el súper"]');
        return input ? input.value === '' : window.location.pathname === '/login'; });
      const signedOutForm = await panelA.count() ? 'cleared-open-form' : 'removed-by-login-navigation';
      if (signedOutForm === 'cleared-open-form') {
        assert.equal(await panelA.getByPlaceholder('0', { exact: true }).inputValue(), '');
        assert.ok(!(await panelA.innerText()).includes(categoryName));
      } else assert.equal(new URL(page.url()).pathname, '/login');
      await login(otherTab, b);
      state.accountB = await createAccount(otherTab, `Durabilidad B ${state.run}`, 7000);
      await otherTab.close();
      const panelB = await openMovement(page, state.accountB);
      const options = await panelB.locator('select').filter({ has: page.locator(`option[value="${state.accountB}"]`) }).locator('option').evaluateAll(options => options.map(option => option.value));
      assert.ok(options.includes(state.accountB)); assert.ok(!options.includes(state.accountA));
      const visible = await panelB.innerText(); assert.ok(!visible.includes(categoryName) && !visible.includes(draft));
      assert.equal(await panelB.getByPlaceholder('0', { exact: true }).inputValue(), '');
      assert.equal(await panelB.getByPlaceholder('ej: Compra en el súper', { exact: true }).inputValue(), '');
      await panelB.getByRole('button', { name: 'Todas las categorías…', exact: true }).click();
      assert.ok(!(await panelB.innerText()).includes(categoryName));
      await panelB.getByRole('button', { name: 'Todas las categorías…', exact: true }).click();
      const cacheB = await page.evaluate(ownerId => ({ accounts: JSON.parse(localStorage.getItem(`zarix-offline-snapshot-accounts-v2:${ownerId}`) || '[]').map(row => row.id),
        categories: JSON.parse(localStorage.getItem(`zarix-offline-snapshot-categories-v2:${ownerId}`) || '[]').map(row => row.id) }), b.id);
      assert.ok(!cacheB.accounts.includes(state.accountA)); assert.ok(!cacheB.categories.includes(category.id));
      const ttlAge = Date.now() - warmedAt; assert.ok(ttlAge < 120000, 'Identity switch must exercise a still-fresh prior category snapshot');
      await context.setOffline(true); await panelB.getByRole('button', { name: 'Cerrar', exact: true }).click();
      await newMovement(page).click();
      const offlineB = modal(page); await offlineB.getByPlaceholder('0', { exact: true }).waitFor();
      await offlineB.getByRole('button', { name: 'Todas las categorías…', exact: true }).click();
      const offlineText = await offlineB.innerText(); assert.ok(!offlineText.includes(categoryName) && !offlineText.includes(draft));
      const offlineOptions = await offlineB.locator('option').evaluateAll(options => options.map(option => option.value));
      assert.ok(offlineOptions.includes(state.accountB)); assert.ok(!offlineOptions.includes(state.accountA));
      checks.push({ samePersistentProfile: true, ordinaryLogoutAndPasswordSignin: true, signedOutForm,
        priorOwnerAccountId: state.accountA, currentOwnerAccountId: state.accountB, priorOwnerCategoryId: category.id,
        oldOwnerIdsAbsentFromBOptionsAndCache: true, BOfflineReferencesOwnOnly: true, priorSnapshotAgeAtBCheckMs: ttlAge,
        scope: 'Authenticated same-profile cache/form isolation and offline own references; retained private A snapshots are not deleted or adopted by B.' });
      await screenshot('owner-B-offline-isolation'); await context.setOffline(false);
    });
    await closeChrome(); report.status = 'PARTIAL';
    report.partialMeaning = mode === 'identity'
      ? 'Scoped CU002 identity-only retry passed; financial results remain in the unchanged original phase reports. Does not approve a complete CU or all original CP cases.'
      : 'All scoped browser durability/identity assertions passed. Does not approve a complete CU, all original CP cases, providers, contention or monthly availability.';
    state.completedAt = new Date().toISOString(); await savePrivateState();
  }
  report.sourceStable = JSON.stringify(await manifest()) === JSON.stringify(report.sourceManifest);
  assert.equal(report.sourceStable, true);
} catch (error) {
  report.status = 'FAIL'; report.failure = safeNativeFailure(error, stage);
  report.failureLocation = error.stack?.match(/test-isolated-offline-durability\.mjs:(\d+):\d+/)?.[1] || null;
  const active = report.cases.findLast(item => item.status === 'RUNNING'); if (active) active.status = 'FAIL';
  report.reason = 'Guard, browser action or independent SQL assertion failed. Raw exception, headers and bodies are omitted to protect credentials.';
  process.exitCode = 1;
} finally {
  if (context) {
    try { await context.close(); report.browserEvents.push({ at: new Date().toISOString(), event: 'owned-context-closed-on-exit' }); }
    catch { report.cleanup = 'Owned browser could not confirm closure; inspect the private profile process before retrying.'; }
  }
  await save();
  console.log(JSON.stringify({ report: path.join(output, `${mode}-verification.json`), phase: mode, status: report.status,
    cases: report.cases.map(({ cu, name, status }) => ({ cu, name, status })), failure: report.failure || null,
    handoff: report.handoff || null }, null, 2));
}
