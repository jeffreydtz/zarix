// UI -> Next API -> native PostgreSQL, synthetic loopback targets only.
// Playwright is intentionally supplied from an isolated tool installation.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createHash, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { isolatedNativeTargets, isolatedPgEnvironment, isolatedApiFetch } from './lib/test-isolated-native-target.mjs';

const sha = value => createHash('sha256').update(value).digest('hex');
const literal = value => `'${String(value).replaceAll("'", "''")}'`;
const output = path.resolve(process.env.ZARIX_E2E_OUTPUT || '/tmp/zarix-isolated-e2e');
const report = {
  startedAt: new Date().toISOString(), status: 'RUNNING',
  scope: 'Exactly CU001-CU004; ordinary password login; actual UI writes and separate PostgreSQL assertions. Each check has its own scope; partial coverage never approves a complete CU or original CP automatically.',
  environment: { node: process.version, platform: process.platform, arch: process.arch, release: os.release() },
  cases: [], requests: [], screenshots: [], blockers: [],
};
let browser;
await fs.mkdir(output, { recursive: true, mode: 0o700 });
async function save() {
  report.finishedAt = new Date().toISOString();
  await fs.writeFile(path.join(output, 'e2e-verification.json'), JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
}
const unwrap = result => { if (result.error) throw new Error(`Supabase ${result.error.code || 'request'} failure`); return result.data; };
try {
  const { apiUrl, databaseUrl } = isolatedNativeTargets();
  assert.equal(process.env.ZARIX_API_TARGET_PURPOSE, 'isolated-api-e2e-replica', 'Use separate API/E2E identities in a replica; preserve source/recovery');
  assert.ok(['56321:56322', '57321:57322'].includes(`${apiUrl.port}:${databaseUrl.port}`), 'Source/recovery ports and mismatched instances refused by mutating UI runner');
  const appUrl = new URL(process.env.ZARIX_E2E_APP_URL || 'http://127.0.0.1:3000');
  assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(appUrl.hostname), 'Refusing non-loopback app');
  assert.ok(['http:', 'https:'].includes(appUrl.protocol));
  assert.ok(!appUrl.username && !appUrl.password && !appUrl.search && !appUrl.hash);
  if (appUrl.hostname === 'localhost') appUrl.hostname = '127.0.0.1';
  assert.ok(process.env.ZARIX_LOCAL_ANON_KEY, 'ZARIX_LOCAL_ANON_KEY is required');
  const pgEnv = isolatedPgEnvironment(databaseUrl);
  const psql = path.join(process.env.ZARIX_PG_BIN || '', 'psql');
  function sql(statement) {
    const child = spawnSync(psql, ['-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-c', statement], { env: pgEnv, encoding: 'utf8' });
    assert.equal(child.status, 0, 'Isolated SQL assertion failed; private stderr is not copied to evidence');
    return child.stdout.trim();
  }
  const rows = query => JSON.parse(sql(`SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM (${query}) t`));
  const balance = id => Number(sql(`SELECT balance FROM accounts WHERE id=${literal(id)}`));
  const client = () => createClient(apiUrl.href, process.env.ZARIX_LOCAL_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { fetch: isolatedApiFetch },
  });
  const run = randomUUID().slice(0, 8);
  // No passwords/JWT/cookies are written to logs, screenshots, traces or reports.
  const users = [];
  const loginFile = process.env.ZARIX_TEST_LOGIN_FILE;
  assert.ok(loginFile, 'Private ZARIX_TEST_LOGIN_FILE is required; do not create additional identities');
  const loginFixture = JSON.parse(await fs.readFile(loginFile, 'utf8'));
  assert.equal(loginFixture.purpose, 'isolated-api-e2e-replica');
  const supplied = loginFixture.users;
  assert.equal((await fs.stat(loginFile)).mode & 0o077, 0, 'Login fixture must be private (0600)');
  assert.equal(supplied.length, 2, 'Exactly two normal test users are required');
  for (const credential of supplied) {
    const auth = client();
    assert.match(credential.email, /^zarix-e2e-.+@example\.invalid$/i, 'Only explicitly synthetic E2E-owned identities may be reused');
    const signed = unwrap(await auth.auth.signInWithPassword({ email: credential.email, password: credential.password }));
    assert.equal(unwrap(await auth.auth.getUser()).user.id, signed.user.id);
    if (credential.id) assert.equal(signed.user.id, credential.id);
    assert.equal(sql(`SELECT email FROM auth.users WHERE id=${literal(signed.user.id)}`), credential.email, 'Auth and SQL must address the same instance');
    users.push({ id: signed.user.id, email: credential.email, password: credential.password, auth });
  }
  const [a, b] = users;
  report.fixture = { users: users.map(u => u.id), syntheticOnly: true, credentials: loginFile ? 'private test fixture file, never copied into evidence' : 'ephemeral in-memory values, not persisted', providerMode: 'pre-existing local fixture/cache only; no real-provider acceptance claimed' };
  // Existing synthetic data are preserved. Only new accounts/positions from this run
  // are used; plan/onboarding setup is an explicit local synthetic fixture action.
  const existingAccountCount = Number(sql(`SELECT count(*) FROM accounts WHERE user_id=${literal(a.id)}`));
  sql(`UPDATE users SET onboarding_done=true,status='ACTIVE',current_period_end=now()+interval '30 days' WHERE id IN (${users.map(u => literal(u.id)).join(',')})`);
  const sourcePaths = ['scripts/test-isolated-e2e.mjs', 'app/login/page.tsx', 'app/api/accounts/route.ts', 'app/api/transactions/route.ts', 'app/api/investments/route.ts', 'app/api/investments/[id]/sell/route.ts', 'app/(authenticated)/analysis/page.tsx', 'components/investments/InvestmentSimulationPanel.tsx', 'lib/investment-simulation.ts', 'supabase/schema.sql', 'package-lock.json'];
  report.sourceManifest = await Promise.all(sourcePaths.map(async file => ({ path: file, sha256: sha(await fs.readFile(file)) })));
  report.revision = spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', env: { ...process.env, DEVELOPER_DIR: '/Library/Developer/CommandLineTools' } }).stdout.trim();
  const playwrightPath = process.env.ZARIX_PLAYWRIGHT_MODULE;
  if (!playwrightPath) throw Object.assign(new Error('ZARIX_PLAYWRIGHT_MODULE must identify an existing isolated Playwright module'), { blocked: true });
  const { chromium } = await import(pathToFileURL(playwrightPath).href);
  const executablePath = process.env.ZARIX_CHROME_EXECUTABLE || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  await fs.access(executablePath);
  browser = await chromium.launch({ executablePath, headless: process.env.ZARIX_E2E_HEADED !== '1' });
  report.environment.browser = { product: 'Installed Google Chrome', version: browser.version(), executablePath, playwright: 'external isolated installation', headless: process.env.ZARIX_E2E_HEADED !== '1' };
  const contexts = [];
  async function login(user, viewport = { width: 1440, height: 900 }) {
    const context = await browser.newContext({ viewport, serviceWorkers: 'block' });
    contexts.push(context);
    // Browser requests are bounded too. Remote provider responses are never mocked into PASS.
    await context.route('**/*', route => {
      const requestUrl = new URL(route.request().url());
      return ['127.0.0.1', 'localhost', '[::1]'].includes(requestUrl.hostname) || ['data:', 'blob:'].includes(requestUrl.protocol)
        ? route.continue() : route.abort('blockedbyclient');
    });
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    await page.goto(new URL('/login', appUrl).href);
    await page.getByLabel('Email', { exact: true }).fill(user.email);
    await page.locator('#password').fill(user.password);
    await page.getByRole('button', { name: 'Ingresar', exact: true }).click();
    await page.waitForURL('**/dashboard', { timeout: 45000 });
    // Attach sanitized observations after login. Never store HAR, raw traces or headers.
    page.on('response', response => {
      const url = new URL(response.url());
      if (url.origin === appUrl.origin && url.pathname.startsWith('/api/')) report.requests.push({
        at: new Date().toISOString(), method: response.request().method(),
        path: url.pathname.replace(/\/api\/shared\/[^/]+/, '/api/shared/[redacted-capability]'), status: response.status(),
      });
    });
    return page;
  }
  const pageA = await login(a), pageB = await login(b);
  const screenshots = async (page, name) => {
    const file = `${name}.png`;
    await page.screenshot({ path: path.join(output, file), fullPage: true });
    report.screenshots.push({ path: file, sha256: sha(await fs.readFile(path.join(output, file))) });
  };
  async function test(cu, name, execute) {
    const result = { cu, name, status: 'RUNNING', checks: [], coverage: 'partial; does not close all original CP cases' };
    report.cases.push(result);
    try { await execute(result.checks); result.status = 'PASS'; }
    catch (error) {
      result.status = error.blocked ? 'BLOCKED' : 'FAIL'; result.failure = error.name;
      result.reason = error.blocked ? error.message : 'Assertion or browser action failed; no raw exception copied because it may contain session data';
      result.failureLocation = error.stack?.match(/test-isolated-e2e\.mjs:(\d+):\d+/)?.[1] || null;
      result.lastObservedRequest = report.requests.at(-1) || null;
      await screenshots(pageA, `${cu}-failed`);
    }
    await save();
  }
  async function request(page, method, endpoint, data, key = randomUUID()) {
    return page.request.fetch(new URL(endpoint, appUrl).href, { method, data, headers: { 'Idempotency-Key': key } });
  }
  async function createAccount(page, name, initial, currency = 'ARS', type = 'Banco') {
    await page.goto(new URL('/accounts', appUrl).href);
    await page.getByRole('button', { name: 'Nueva Cuenta', exact: true }).click();
    const panel = page.locator('div.bg-card.rounded-3xl').filter({ has: page.getByRole('heading', { name: 'Nueva Cuenta', exact: true }) });
    await panel.getByPlaceholder('Ej: Banco Galicia, Mercado Pago', { exact: true }).fill(name);
    await panel.getByRole('button', { name: type, exact: false }).click();
    if (currency !== 'ARS') await panel.getByRole('button', { name: new RegExp(currency) }).click();
    await panel.getByPlaceholder('0.00', { exact: true }).fill(String(initial));
    const response = page.waitForResponse(r => new URL(r.url()).pathname === '/api/accounts' && r.request().method() === 'POST');
    await panel.getByRole('button', { name: 'Crear Cuenta', exact: true }).click();
    const actual = await response;
    assert.equal(actual.status(), 201);
    const account = await actual.json();
    assert.equal(balance(account.id), initial);
    return account.id;
  }
  let accountA, destinationA, investmentAccount;
  await test('CU002', 'accounts/personal data: UI creation, ordinary API tenant boundaries and Free allowance', async checks => {
    accountA = await createAccount(pageA, `Banco sintético ${run}`, 50000);
    destinationA = await createAccount(pageA, `Destino sintético ${run}`, 2000);
    investmentAccount = await createAccount(pageA, `Broker sintético ${run}`, 0, 'USD', 'Inversion');
    const foreign = await createAccount(pageB, `Privada B ${run}`, 7000);
    const own = await (await request(pageA, 'GET', '/api/accounts')).json();
    assert.ok(own.some(r => r.id === accountA)); assert.ok(!own.some(r => r.id === foreign));
    const modified = await request(pageA, 'PATCH', `/api/accounts/${foreign}`, { name: 'Intento sintético ajeno' });
    assert.ok(modified.status() >= 400); assert.equal(balance(foreign), 7000);
    sql(`UPDATE users SET status='CANCELED',current_period_end=NULL WHERE id=${literal(a.id)}`);
    const countBefore = Number(sql(`SELECT count(*) FROM accounts WHERE user_id=${literal(a.id)}`));
    const fourth = await request(pageA, 'POST', '/api/accounts', { name: `Cuarta ${run}`, type: 'bank', currency: 'ARS', initialBalance: 0 });
    assert.ok(fourth.status() >= 400);
    assert.equal(Number(sql(`SELECT count(*) FROM accounts WHERE user_id=${literal(a.id)}`)), countBefore);
    const history = await request(pageA, 'GET', '/api/accounts'); assert.equal(history.status(), 200);
    const exportAfterDowngrade = await request(pageA, 'GET', '/api/export/transactions?format=json'); assert.equal(exportAfterDowngrade.status(), 200);
    sql(`UPDATE users SET status='ACTIVE',current_period_end=now()+interval '30 days' WHERE id=${literal(a.id)}`);
    const activeAccountsAtDowngrade = Number(sql(`SELECT count(*) FROM accounts WHERE user_id=${literal(a.id)} AND is_active AND movement_enabled`));
    checks.push({ ids: ['CP2-01', 'CP2-19', 'CP2-20'], scope: 'account creation/count + account API boundary + refusal beyond Free allowance/downgrade reads only; pre-existing synthetic accounts retained', existingAccountCount, expectedInitialBalance: 50000, actualInitialBalance: balance(accountA), activeAccountsAtDowngrade, historyAndExportAfterDowngrade: true });
    await screenshots(pageA, 'CU002-accounts');
  });
  await test('CU001', 'movements: UI expense, edit/delete balance reversal and ten durable API retries', async checks => {
    if (!accountA || !destinationA) throw Object.assign(new Error('CU002 synthetic account fixture unavailable'), { blocked: true });
    accountA = await createAccount(pageA, `Movimientos sintéticos ${run}`, 10000);
    await pageA.goto(new URL('/expenses', appUrl).href);
    await pageA.getByRole('button', { name: 'Nuevo', exact: true }).click();
    await pageA.getByPlaceholder('0', { exact: true }).fill('1500');
    await pageA.locator('select').filter({ has: pageA.locator(`option[value="${accountA}"]`) }).selectOption(accountA);
    await pageA.getByPlaceholder('ej: Compra en el súper').fill(`Gasto UI ${run}`);
    const pending = pageA.waitForResponse(r => new URL(r.url()).pathname === '/api/transactions' && r.request().method() === 'POST');
    await pageA.getByRole('button', { name: 'Guardar', exact: true }).click();
    const created = await pending; assert.equal(created.status(), 201);
    const transaction = await created.json(); assert.equal(balance(accountA), 8500);
    const edited = await request(pageA, 'PATCH', `/api/transactions/${transaction.id}`, { amount: 2000, account_id: accountA, currency: 'ARS' });
    assert.equal(edited.status(), 200); assert.equal(balance(accountA), 8000);
    const deleted = await request(pageA, 'DELETE', `/api/transactions/${transaction.id}`);
    assert.equal(deleted.status(), 204); assert.equal(balance(accountA), 10000);
    const key = randomUUID(), payload = { type: 'transfer', accountId: accountA, destinationAccountId: destinationA, amount: 1500, currency: 'ARS', description: `Transferencia ${run}` };
    const responses = await Promise.all(Array.from({ length: 10 }, () => request(pageA, 'POST', '/api/transactions', payload, key)));
    assert.ok(responses.every(r => r.status() === 201));
    const bodies = await Promise.all(responses.map(r => r.json())); assert.ok(bodies.every(r => r.id === bodies[0].id));
    assert.equal(balance(accountA), 8500); assert.equal(balance(destinationA), 3500);
    assert.equal(Number(sql(`SELECT count(*) FROM transactions WHERE id=${literal(bodies[0].id)}`)), 1);
    const receipt = rows(`SELECT request_id,response->>'id' AS transaction_id FROM transaction_requests WHERE user_id=${literal(a.id)} AND request_id=${literal(key)}`);
    assert.equal(receipt.length, 1);
    checks.push({ ids: ['CP1-01', 'CP1-03', 'CP1-05', 'CP1-08', 'CNF-11'], scope: 'UI create + authenticated API edit/delete/transfer retries; excludes injected failure/offline/restart/provider channels', expenseBalances: [10000, 8500, 8000, 10000], transferBalances: [8500, 3500], retryAttempts: 10, financialRows: 1, durableReceipts: receipt.length });
    await pageA.reload(); await screenshots(pageA, 'CU001-movements');
  });
  await test('CU003', 'financial analysis: visible totals agree with owner-only SQL period', async checks => {
    if (!accountA) throw Object.assign(new Error('CU002 synthetic account fixture unavailable'), { blocked: true });
    // Separate controlled period; a transfer cannot increase income or expenses.
    const category = randomUUID();
    sql(`INSERT INTO categories(id,user_id,name,type) VALUES(${literal(category)},${literal(a.id)},'Alimentos sintéticos','expense')`);
    for (const [amount, day] of [[500, '01'], [700, '03'], [800, '06']]) {
      const response = await request(pageA, 'POST', '/api/transactions', { type: 'expense', accountId: accountA, amount, currency: 'ARS', categoryId: category, transactionDate: `2026-10-${day}T12:00:00-03:00` });
      assert.equal(response.status(), 201);
    }
    await pageA.goto(new URL('/analysis?period=custom&startDate=2026-10-01&endDate=2026-10-06', appUrl).href);
    await pageA.getByRole('heading', { name: 'Análisis financiero', exact: true }).waitFor();
    assert.equal(Number(sql(`SELECT sum(amount) FROM transactions WHERE user_id=${literal(a.id)} AND category_id=${literal(category)} AND type='expense'`)), 2000);
    const expectedExpense = Number(sql(`SELECT COALESCE(sum(t.amount),0) FROM transactions t JOIN accounts ac ON ac.id=t.account_id WHERE t.user_id=${literal(a.id)} AND t.type='expense' AND t.currency='ARS' AND ac.is_active AND t.transaction_date>='2026-10-01T03:00:00Z' AND t.transaction_date<'2026-10-07T03:00:00Z'`));
    const expenseCard = pageA.locator('div.card').filter({ has: pageA.getByText('Gastos', { exact: true }) }).first();
    const rendered = await expenseCard.locator('div.text-2xl').innerText();
    assert.equal(rendered, `$${expectedExpense.toLocaleString('es-AR', { maximumFractionDigits: 0 })}`);
    checks.push({ id: 'CP3-08', scope: 'controlled ARS period, actual visible total + complete owner SQL and new category subtotal; pre-existing synthetic rows retained; excludes Gemini and mixed FX fixtures', newCategorySubtotal: 2000, expectedExpense, observedExpense: rendered });
    await screenshots(pageA, 'CU003-analysis');
  });
  await test('CU004', 'investments: UI manual purchase and sale, excessive quantity has no effect', async checks => {
    if (!investmentAccount) throw Object.assign(new Error('CU002 synthetic investment account fixture unavailable'), { blocked: true });
    sql(`UPDATE users SET status='ACTIVE',current_period_end=now()+interval '30 days' WHERE id=${literal(a.id)}`);
    await pageA.goto(new URL('/investments', appUrl).href);
    await pageA.getByRole('button', { name: 'Agregar posición', exact: true }).click();
    const form = pageA.locator('form');
    await form.getByLabel('Cuenta', { exact: true }).selectOption(investmentAccount);
    await form.getByLabel('Nombre', { exact: true }).fill(`Posición sintética ${run}`);
    await form.getByLabel('Cantidad', { exact: true }).fill('10');
    await form.getByLabel('Precio compra', { exact: true }).fill('100');
    await form.getByLabel('Cargar precio manual', { exact: true }).check();
    await form.getByLabel('Precio de hoy', { exact: true }).fill('110');
    const pending = pageA.waitForResponse(r => new URL(r.url()).pathname === '/api/investments' && r.request().method() === 'POST');
    await form.getByRole('button', { name: 'Guardar posición', exact: true }).click();
    const purchased = await pending; assert.equal(purchased.status(), 201);
    const position = await purchased.json();
    await pageA.locator('div.card').filter({ has: pageA.getByText(`Posición sintética ${run}`, { exact: true }) }).getByRole('button', { name: 'Vender posición', exact: true }).click();
    const dialog = pageA.getByRole('dialog');
    await dialog.getByLabel('Cantidad a vender', { exact: true }).fill('4');
    await dialog.getByLabel('Precio por unidad', { exact: true }).fill('120');
    const saleResponse = pageA.waitForResponse(r => new URL(r.url()).pathname === `/api/investments/${position.id}/sell` && r.request().method() === 'POST');
    await dialog.getByRole('button', { name: 'Confirmar venta', exact: true }).click();
    assert.equal((await saleResponse).status(), 201);
    assert.equal(Number(sql(`SELECT quantity FROM investments WHERE id=${literal(position.id)}`)), 6);
    const financialHash = () => sha(sql(`SELECT jsonb_build_object('accounts',(SELECT jsonb_agg(to_jsonb(t) ORDER BY t.id) FROM accounts t WHERE user_id=${literal(a.id)}),'transactions',(SELECT jsonb_agg(to_jsonb(t) ORDER BY t.id) FROM transactions t WHERE user_id=${literal(a.id)}),'investments',(SELECT jsonb_agg(to_jsonb(t) ORDER BY t.id) FROM investments t WHERE user_id=${literal(a.id)}),'sales',(SELECT jsonb_agg(to_jsonb(t) ORDER BY t.id) FROM investment_sales t WHERE user_id=${literal(a.id)}))`));
    await pageA.reload();
    const beforeSimulation = financialHash();
    await pageA.getByRole('button', { name: 'Simular escenario', exact: true }).click();
    const simulation = pageA.locator('#investment-simulation-form');
    await simulation.getByLabel('Posición a simular', { exact: true }).selectOption(position.id);
    await simulation.getByLabel('Variación del precio (%)', { exact: true }).fill('10');
    await simulation.getByRole('button', { name: 'Simular', exact: true }).click();
    assert.equal(await pageA.getByTestId('simulation-hypothetical-value').innerText(), 'USD 726,00');
    assert.equal(await pageA.getByTestId('simulation-current-value').innerText(), 'USD 660,00');
    await simulation.getByLabel('Variación del precio (%)', { exact: true }).fill('-100');
    await simulation.getByRole('button', { name: 'Simular', exact: true }).click();
    assert.equal(await pageA.getByTestId('simulation-hypothetical-value').innerText(), 'USD 0,00');
    for (const invalid of ['-100.01', 'NaN']) {
      await simulation.getByLabel('Variación del precio (%)', { exact: true }).fill(invalid);
      await simulation.getByRole('button', { name: 'Simular', exact: true }).click();
      await simulation.getByRole('alert').waitFor();
      assert.equal(await pageA.getByTestId('investment-simulation-result').count(), 0);
    }
    await pageA.getByRole('button', { name: 'Cerrar simulación', exact: true }).click();
    assert.equal(financialHash(), beforeSimulation);
    assert.equal(Number(sql(`SELECT sum(realized_pnl_native) FROM investment_sales WHERE investment_id=${literal(position.id)}`)), 80);
    const countBefore = sql(`SELECT count(*) FROM investment_sales WHERE investment_id=${literal(position.id)}`);
    const oversale = await request(pageA, 'POST', `/api/investments/${position.id}/sell`, { quantity: 7, price: 120, currency: 'USD' });
    assert.ok(oversale.status() >= 400); assert.equal(sql(`SELECT count(*) FROM investment_sales WHERE investment_id=${literal(position.id)}`), countBefore);
    assert.equal(Number(sql(`SELECT quantity FROM investments WHERE id=${literal(position.id)}`)), 6);
    checks.push({ ids: ['CP4-02', 'CP4-04', 'CP4-06', 'CP4-08', 'CP4-09', 'CP4-12'], scope: 'UI manual-price position + UI partial sale + API oversale + pure UI simulation; fixture is local ledger, no broker/trading operation', remainingQuantity: 6, realizedPnlUSD: 80, cashBalance: balance(investmentAccount), simulationValues: { current: 660, plusTenPercent: 726, minusHundredPercent: 0, invalidRejected: ['-100.01', 'NaN'] }, financeSha256BeforeAndAfter: beforeSimulation });
    await screenshots(pageA, 'CU004-investments');
  });
  report.blockers.push({ ids: ['CNF-05', 'CNF-06', 'CNF-07', 'CNF-08'], reason: 'Four viewport/200% zoom and keyboard/task flows require their own executed visual matrix; four desktop screenshots do not establish compatibility.' });
  report.blockers.push({ id: 'CNF-09', reason: 'This harness runs installed Google Chrome only. Firefox, real Safari and Edge require distinct execution; WebKit is never labeled Safari.' });
  report.blockers.push({ ids: ['CNF-01', 'CNF-02', 'CNF-03', 'CNF-04', 'CNF-12', 'CNF-13'], reason: 'Canonical 20-session/100-navigation network-shaped load, month observation, HTTPS, instance encryption, complete recovery and observability are separate acceptance evidence.' });
  report.blockers.push({ ids: ['CP1-14', 'CP1-15', 'CP1-16', 'CP1-17', 'CP1-18', 'CP2-13', 'CP2-14', 'CP2-17', 'CP2-18', 'CP3-09', 'CP3-10'], reason: 'Real controlled Gemini/OCR, Telegram and Mercado Pago sandbox provider prerequisites are outside this local UI harness; provider doubles cannot close them.' });
  report.sourceStable = (await Promise.all(report.sourceManifest.map(async source => sha(await fs.readFile(source.path)) === source.sha256))).every(Boolean);
  report.status = report.cases.some(c => c.status === 'FAIL') || !report.sourceStable ? 'FAIL' : report.cases.every(c => c.status === 'PASS') ? 'PARTIAL' : 'BLOCKED';
  for (const context of contexts) await context.close();
} catch (error) {
  report.status = error.blocked ? 'BLOCKED' : 'FAIL';
  report.blockers.push({ reason: error.blocked ? error.message : 'Harness prerequisite or assertion failed; raw error withheld to prevent credential leakage', errorType: error.name });
} finally {
  if (browser) await browser.close();
  await save();
  console.log(JSON.stringify({ report: path.join(output, 'e2e-verification.json'), status: report.status, cases: report.cases.map(({ cu, status }) => ({ cu, status })) }, null, 2));
  if (['FAIL', 'BLOCKED'].includes(report.status)) process.exitCode = report.status === 'FAIL' ? 1 : 2;
}
