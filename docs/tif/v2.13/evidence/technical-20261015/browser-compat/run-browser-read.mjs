// Official-browser W3C WebDriver, bounded reading proof. No software downloads.
// This runner never approves a complete original CP/CU/CNF from its subchecks.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { isolatedNativeTargets, isolatedPgEnvironment } from '../../../../../../scripts/lib/test-isolated-native-target.mjs';

const directory = path.dirname(fileURLToPath(import.meta.url));
const repository = path.resolve(directory, '../../../../../..');
const sha = content => createHash('sha256').update(content).digest('hex');
const literal = value => `'${String(value).replaceAll("'", "''")}'`;
const uuid = value => assert.match(value, /^[0-9a-f-]{36}$/i);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const products = new Set(['safari', 'firefox', 'edge']);
const browser = process.env.ZARIX_BROWSER_COMPAT_PRODUCT || 'safari';
assert.ok(products.has(browser), 'Only official Safari, Firefox and Edge are supported');
const output = path.resolve(process.env.ZARIX_BROWSER_COMPAT_OUTPUT || `/tmp/zarix-browser-compat-${browser}`);
const report = {
  startedAt: new Date().toISOString(), status: 'BLOCKED', product: browser,
  scope: 'Exactly four bounded CU reading subcases. No complete original CP, CU, RNF05 or CNF-09 acceptance inferred. UI login creates Auth sessions; dashboard may update snapshots/cache. No financial writes requested.',
  environment: { node: process.version, platform: process.platform, arch: process.arch, kernel: os.release() },
  cases: ['CU001', 'CU002', 'CU003', 'CU004'].map(cu => ({ cu, status: 'BLOCKED', scope: 'partial reading proof only', checks: [] })),
  screenshots: [], blockers: [], cleanup: {},
};
let driver, session;
const port = { safari: 45673, firefox: 45671, edge: 45672 }[browser];
const driverOrigin = `http://127.0.0.1:${port}`;
const elementKey = 'element-6066-11e4-a52e-4f735466cecf';
const knownWebDriverErrors = new Set(['invalid session id', 'no such element', 'stale element reference', 'session not created', 'timeout', 'unexpected alert open', 'unknown error', 'unsupported operation']);
let profiles;
async function save() {
  await fs.mkdir(output, { recursive: true, mode: 0o700 });
  report.finishedAt = new Date().toISOString();
  await fs.writeFile(path.join(output, 'browser-read-verification.json'), JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
}
function blocked(code) { return Object.assign(new Error(code), { blocked: true, safeCode: code }); }
function configuration(env = process.env) {
  assert.equal(env.ZARIX_BROWSER_COMPAT_EXECUTE, 'authorized-window');
  assert.equal(env.ZARIX_BROWSER_COMPAT_APP_READY, 'isolated-e2e-57321');
  assert.equal(env.ZARIX_API_TARGET_PURPOSE, 'isolated-api-e2e-replica');
  assert.equal(env.ZARIX_BROWSER_COMPAT_PROVIDER_GUARD, 'loopback-fixtures-confirmed');
  const { apiUrl, databaseUrl } = isolatedNativeTargets(env);
  assert.equal(`${apiUrl.port}:${databaseUrl.port}`, '57321:57322');
  const appUrl = new URL(env.ZARIX_E2E_APP_URL || 'http://127.0.0.1:3000');
  assert.equal(appUrl.origin, 'http://127.0.0.1:3000');
  assert.ok(!appUrl.username && !appUrl.password && appUrl.pathname === '/' && !appUrl.search && !appUrl.hash);
  if (browser === 'safari') {
    if (!env.ZARIX_SAFARI_AUTOMATION_AUTHORIZATION) throw blocked('SAFARI_AUTHORIZATION_RECEIPT_REQUIRED');
  } else {
    if (!env.ZARIX_BROWSER_TERMS_AUTHORIZATION) throw blocked('FIREFOX_EDGE_TERMS_AUTHORIZATION_REQUIRED');
    if (env.ZARIX_BROWSER_COMPAT_SOFTWARE_VERIFIED !== 'publisher-checks-pass') throw blocked('PUBLISHER_SIGNATURE_CHECKS_REQUIRED');
    for (const key of ['ZARIX_BROWSER_COMPAT_BINARY', 'ZARIX_BROWSER_COMPAT_DRIVER']) {
      assert.ok(path.resolve(env[key] || '').startsWith('/tmp/zarix-browser-compat-software/'));
    }
  }
  return { apiUrl, databaseUrl, appUrl };
}
async function wire(method, endpoint, data) {
  const response = await fetch(new URL(endpoint, driverOrigin), {
    method, redirect: 'error', signal: AbortSignal.timeout(65000),
    headers: data === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: data === undefined ? undefined : JSON.stringify(data),
  });
  const result = await response.json();
  if (!response.ok || result.value?.error) {
    const code = knownWebDriverErrors.has(result.value?.error) ? result.value.error : 'unknown error';
    throw Object.assign(new Error('WebDriver command failed; raw response omitted'), { safeCode: code });
  }
  return result.value;
}
const command = (method, endpoint, data) => wire(method, `/session/${session}${endpoint}`, data);
const execute = (script, args = []) => command('POST', '/execute/sync', { script, args });
async function waitUntil(check, timeout = 45000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    if (await check()) return;
    await sleep(200);
  }
  throw Object.assign(new Error('Condition timeout; no page/URL content stored'), { safeCode: 'timeout' });
}
async function find(selector) {
  return (await command('POST', '/element', { using: 'css selector', value: selector }))[elementKey];
}
async function fill(selector, value) {
  const id = await find(selector);
  await command('POST', `/element/${id}/clear`, {});
  await command('POST', `/element/${id}/value`, { text: value });
}
async function clickButton(text) {
  const id = await execute('return Array.from(document.querySelectorAll("button")).find(b => b.textContent.trim() === arguments[0]);', [text]);
  assert.ok(id?.[elementKey], 'Required button must exist');
  await command('POST', `/element/${id[elementKey]}/click`, {});
}
async function navigate(appUrl, route) {
  assert.ok(route.startsWith('/') && !route.startsWith('//'));
  await command('POST', '/url', { url: new URL(route, appUrl).href });
}
async function pageHeading(title) {
  await waitUntil(() => execute('return Array.from(document.querySelectorAll("h1,h2")).some(e => e.textContent.trim() === arguments[0]);', [title]));
}
async function apiGet(endpoint) {
  assert.ok(endpoint.startsWith('/api/') && !endpoint.includes('://'));
  return command('POST', '/execute/async', { script: 'const done=arguments[arguments.length-1]; fetch(arguments[0],{method:"GET",credentials:"same-origin",redirect:"error"}).then(async r=>{let data=null;try{data=await r.json()}catch{}done({status:r.status,data})}).catch(()=>done({status:0,data:null}));', args: [endpoint] });
}
async function screenshot(cu) {
  // WebDriver captures page pixels, without address bar or raw URL. Never login.
  const pathname = await execute('return location.pathname;');
  assert.ok(['/expenses', '/accounts', '/analysis', '/investments'].includes(pathname));
  const file = `${cu}-${browser}.png`;
  const pixels = Buffer.from(await command('GET', '/screenshot'), 'base64');
  await fs.writeFile(path.join(output, file), pixels, { mode: 0o600 });
  report.screenshots.push({ path: file, sha256: sha(pixels), syntheticOnly: true });
}
async function closeSession() {
  if (!session) return;
  try { await wire('DELETE', `/session/${session}`); report.cleanup.sessionsClosed = (report.cleanup.sessionsClosed || 0) + 1; }
  finally { session = null; }
}
async function openSession(identity) {
  await closeSession();
  const common = { browserName: { safari: 'safari', firefox: 'firefox', edge: 'MicrosoftEdge' }[browser], acceptInsecureCerts: false };
  if (browser !== 'safari') {
    common.proxy = { proxyType: 'manual', httpProxy: '127.0.0.1:9', sslProxy: '127.0.0.1:9', noProxy: ['127.0.0.1', 'localhost', '[::1]'] };
    if (browser === 'firefox') common['moz:firefoxOptions'] = { binary: process.env.ZARIX_BROWSER_COMPAT_BINARY };
    else common['ms:edgeOptions'] = { binary: process.env.ZARIX_BROWSER_COMPAT_BINARY, args: [
      `--user-data-dir=${path.join(profiles, identity)}`, '--password-store=basic', '--use-mock-keychain',
      '--disable-background-networking', '--disable-sync', '--disable-component-update',
    ], prefs: { credentials_enable_service: false, 'profile.password_manager_enabled': false } };
  }
  const opened = await wire('POST', '/session', { capabilities: { alwaysMatch: common } });
  session = opened.sessionId;
  assert.ok(session);
  const observed = opened.capabilities;
  assert.equal(String(observed.browserName).toLowerCase(), common.browserName.toLowerCase());
  assert.ok(observed.browserVersion);
  report.environment.browser = { product: observed.browserName, version: observed.browserVersion, platformName: observed.platformName, automation: 'official browser and official W3C WebDriver; no Playwright browser substitute' };
  await command('POST', '/timeouts', { script: 30000, pageLoad: 60000, implicit: 0 });
  await command('POST', '/window/rect', { width: 1440, height: 900 });
}
async function login(appUrl, user) {
  await navigate(appUrl, '/login');
  await fill('input[type="email"]', user.email);
  await fill('#password', user.password);
  await clickButton('Ingresar');
  await waitUntil(() => execute('return location.pathname === "/dashboard";'));
}

try {
  if (process.env.ZARIX_BROWSER_COMPAT_EXECUTE !== 'authorized-window') throw blocked('EXECUTION_WINDOW_NOT_AUTHORIZED');
  const { apiUrl, databaseUrl, appUrl } = configuration();
  report.target = { appOrigin: appUrl.origin, apiOrigin: apiUrl.origin, databasePort: databaseUrl.port, purpose: 'isolated-api-e2e-replica' };
  const credentialFile = process.env.ZARIX_TEST_LOGIN_FILE;
  assert.ok(credentialFile && path.resolve(credentialFile).startsWith('/tmp/'));
  assert.equal((await fs.stat(credentialFile)).mode & 0o077, 0);
  const fixture = JSON.parse(await fs.readFile(credentialFile, 'utf8'));
  assert.equal(fixture.purpose, 'isolated-api-e2e-replica');
  assert.equal(fixture.users.length, 2);
  assert.ok(fixture.guest);
  for (const user of fixture.users) { uuid(user.id); assert.match(user.email, /^zarix-e2e-.+@example\.invalid$/i); }
  uuid(fixture.guest.groupId);
  assert.match(fixture.guest.token, /^[a-f0-9]{32}$/i);
  const pgEnvironment = { ...isolatedPgEnvironment(databaseUrl), PGOPTIONS: '-c default_transaction_read_only=on', PGAPPNAME: 'zarix-browser-compat-readonly' };
  const psql = path.join(process.env.ZARIX_PG_BIN || '', 'psql');
  function sql(statement) {
    assert.match(statement, /^SELECT /);
    const result = spawnSync(psql, ['-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-c', statement], { env: pgEnvironment, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
    assert.equal(result.status, 0, 'Readonly SQL failed; private stderr omitted');
    return result.stdout.trim();
  }
  const rows = query => JSON.parse(sql(`SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM (${query}) t`));
  assert.equal(sql('SELECT current_setting(\'default_transaction_read_only\')'), 'on');
  const owners = fixture.users.map(u => literal(u.id)).join(',');
  if (Number(sql(`SELECT count(*) FROM investments WHERE user_id IN (${owners}) AND is_active=true AND ticker IS NOT NULL AND is_manual_price=false`)) > 0) throw blocked('LOGIN_DASHBOARD_COULD_REFRESH_NONMANUAL_PRICES_READONLY_SCOPE');
  const financialFingerprint = () => sha(sql(`SELECT jsonb_build_object('accounts',(SELECT jsonb_agg(to_jsonb(t) ORDER BY t.id) FROM accounts t WHERE t.user_id IN (${owners})),'transactions',(SELECT jsonb_agg(to_jsonb(t) ORDER BY t.id) FROM transactions t WHERE t.user_id IN (${owners})),'investments',(SELECT jsonb_agg(to_jsonb(t) ORDER BY t.id) FROM investments t WHERE t.user_id IN (${owners})),'sales',(SELECT jsonb_agg(to_jsonb(t) ORDER BY t.id) FROM investment_sales t WHERE t.user_id IN (${owners})))`));
  report.financialFacts = { beforeSha256: financialFingerprint(), scope: 'Only pre-existing test owners: accounts, transactions, investments, investment_sales. Excludes expected Auth sessions, quote cache and net worth snapshots.' };
  report.fixture = { users: fixture.users.map(u => u.id), guest: 'one existing anonymous capability member; no Auth identity inferred', credentials: 'private 0600 fixture used in memory; never copied' };
  const sourcePaths = ['docs/tif/v2.13/evidence/technical-20261015/browser-compat/run-browser-read.mjs', 'app/login/page.tsx', 'app/(authenticated)/expenses/page.tsx', 'app/(authenticated)/accounts/page.tsx', 'app/(authenticated)/analysis/page.tsx', 'app/(authenticated)/investments/page.tsx', 'components/investments/InvestmentSimulationPanel.tsx', 'lib/investment-simulation.ts', 'supabase/schema.sql', 'package-lock.json'];
  const manifest = () => Promise.all(sourcePaths.map(async relative => ({ path: relative, sha256: sha(await fs.readFile(path.join(repository, relative))) })));
  report.sourceManifest = await manifest();
  report.revision = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: repository, encoding: 'utf8', env: { ...process.env, DEVELOPER_DIR: '/Library/Developer/CommandLineTools' } }).stdout.trim();
  await fs.mkdir(output, { recursive: true, mode: 0o700 });
  profiles = await fs.mkdtemp('/tmp/zarix-browser-compat-profiles-');
  await fs.chmod(profiles, 0o700);
  const binary = browser === 'safari' ? '/usr/bin/safaridriver' : process.env.ZARIX_BROWSER_COMPAT_DRIVER;
  await fs.access(binary);
  const args = browser === 'safari' ? ['--port', String(port)] : browser === 'firefox'
    ? ['--host', '127.0.0.1', '--port', String(port), '--profile-root', profiles, '--log', 'fatal']
    : [`--port=${port}`, '--allowed-ips=127.0.0.1', '--silent'];
  let occupied = false;
  try {
    await fetch(`${driverOrigin}/status`, { signal: AbortSignal.timeout(1500), redirect: 'error' });
    occupied = true;
  } catch { /* No connection is expected for this runner's unused local port. */ }
  if (occupied) throw blocked('DRIVER_PORT_ALREADY_IN_USE_EXISTING_PROCESS_PRESERVED');
  // No enable/diagnose/system-access flags; permission toggling is owned by E2E.
  driver = spawn(binary, args, { stdio: 'ignore', env: { PATH: process.env.PATH, TMPDIR: `${profiles}/` } });
  driver.on('error', () => { report.blockers.push('DRIVER_PROCESS_START_FAILED'); });
  await waitUntil(async () => {
    if (driver.exitCode !== null) throw blocked('DRIVER_PROCESS_EXITED_BEFORE_SESSION');
    try { const status = await wire('GET', '/status'); return status.ready === true; } catch { return false; }
  }, 10000);

  async function subcase(cu, proof) {
    const result = report.cases.find(item => item.cu === cu);
    try { await proof(result.checks); result.status = 'PASS'; await screenshot(cu); }
    catch (error) {
      result.status = error.blocked ? 'BLOCKED' : 'FAIL';
      result.failure = { type: error.name === 'AssertionError' ? 'AssertionError' : 'Error', code: error.safeCode || null, context: 'Bounded CU assertion or WebDriver action; raw error omitted to protect credentials/capabilities' };
      result.failure.line = error.stack?.match(/run-browser-read\.mjs:(\d+):\d+/)?.[1] || null;
    }
    await save();
  }
  const [a, b] = fixture.users;
  await openSession('user-a');
  await login(appUrl, a);
  const owner = literal(a.id);
  await subcase('CU001', async checks => {
    await navigate(appUrl, '/expenses'); await pageHeading('Movimientos');
    const response = await apiGet('/api/transactions?limit=100');
    assert.equal(response.status, 200); assert.ok(Array.isArray(response.data));
    const expected = rows(`SELECT t.id FROM transactions t JOIN accounts a ON a.id=t.account_id LEFT JOIN accounts d ON d.id=t.destination_account_id WHERE t.user_id=${owner} AND a.user_id=${owner} AND a.is_active=true AND (t.destination_account_id IS NULL OR (d.user_id=${owner} AND d.is_active=true)) ORDER BY t.transaction_date DESC,t.id DESC LIMIT 100`);
    assert.deepEqual(response.data.map(t => t.id), expected.map(t => t.id));
    assert.ok(response.data.every(t => t.user_id === a.id));
    if (expected.length === 100) throw blocked('MOVEMENT_UI_COMPLETE_COUNT_ORACLE_REQUIRES_SMALL_EXISTING_FIXTURE');
    assert.equal(await execute('return document.body.textContent.includes(arguments[0]);', [`Traídos: ${expected.length}`]), true);
    checks.push({ name: 'Movements UI count and normal session GET agree with owner-only SQL, same explicit 100-row API reading limit; existing fixture smaller than limit', status: 'PASS', count: expected.length });
  });
  await subcase('CU002', async checks => {
    await navigate(appUrl, '/accounts'); await pageHeading('Cuentas');
    const response = await apiGet('/api/accounts');
    assert.equal(response.status, 200); assert.ok(Array.isArray(response.data));
    const expected = rows(`SELECT id,name,currency,balance FROM accounts WHERE user_id=${owner} AND is_active=true ORDER BY id`);
    assert.deepEqual(response.data.map(item => item.id).sort(), expected.map(item => item.id).sort());
    for (const stored of expected) {
      const actual = response.data.find(item => item.id === stored.id);
      assert.equal(actual.user_id, a.id); assert.equal(actual.name, stored.name);
      assert.equal(actual.currency, stored.currency); assert.equal(Number(actual.balance), Number(stored.balance));
      assert.equal(await execute('return document.body.textContent.includes(arguments[0]);', [stored.name]), true);
    }
    checks.push({ name: 'Accounts page and normal session GET contain exactly active SQL accounts owned by A, same name/currency/stored balance; profile edit/export not exercised', status: 'PASS', count: expected.length });
  });
  await subcase('CU003', async checks => {
    const today = new Date().toISOString().slice(0, 10);
    const start = process.env.ZARIX_BROWSER_COMPAT_START_DATE || `${today.slice(0, 8)}01`;
    const end = process.env.ZARIX_BROWSER_COMPAT_END_DATE || today;
    assert.match(start, /^\d{4}-\d{2}-\d{2}$/); assert.match(end, /^\d{4}-\d{2}-\d{2}$/);
    // lib/transaction-date ymdToQueryStartIso/EndIso use UTC literals regardless of TZ.
    const timezone = 'UTC';
    const filter = `t.user_id=${owner} AND t.transaction_date>=${literal(`${start}T00:00:00.000Z`)}::timestamptz AND t.transaction_date<=${literal(`${end}T23:59:59.999Z`)}::timestamptz AND a.is_active IS DISTINCT FROM false AND t.type IN ('expense','income')`;
    const currencies = rows(`SELECT DISTINCT t.currency FROM transactions t LEFT JOIN accounts a ON a.id=t.account_id WHERE ${filter}`);
    if (currencies.some(t => t.currency !== 'ARS' && t.currency !== null)) throw blocked('ANALYSIS_READING_ORACLE_REQUIRES_EXISTING_ARS_ONLY_PERIOD');
    const totals = rows(`SELECT COALESCE(SUM(t.amount) FILTER(WHERE t.type='expense'),0) expenses,COALESCE(SUM(t.amount) FILTER(WHERE t.type='income'),0) income FROM transactions t LEFT JOIN accounts a ON a.id=t.account_id WHERE ${filter}`)[0];
    await navigate(appUrl, `/analysis?period=custom&startDate=${start}&endDate=${end}`); await pageHeading('Análisis financiero');
    assert.equal(await execute('return document.body.textContent.includes("No se pudo cargar el análisis de este período");'), false);
    const displayed = await execute('return ["Gastos","Ingresos","Balance"].map(label=>{const e=Array.from(document.querySelectorAll("div.text-xs")).find(n=>n.textContent.trim()===label);return e?.parentElement?.querySelector("div.text-2xl")?.textContent.trim()??null});');
    const money = n => Number(n).toLocaleString('es-AR', { maximumFractionDigits: 0 });
    const net = Number(totals.income) - Number(totals.expenses);
    assert.deepEqual(displayed, [`$${money(totals.expenses)}`, `$${money(totals.income)}`, `${net >= 0 ? '+' : ''}$${money(net)}`]);
    checks.push({ name: 'Displayed expenses/income/net equal independent owner/date/active-account ARS SQL aggregates; transfer excluded', status: 'PASS', startDate: start, endDate: end, timezone, totals: { expenses: Number(totals.expenses), income: Number(totals.income), balance: net } });
  });
  await subcase('CU004', async checks => {
    await navigate(appUrl, '/investments'); await pageHeading('Inversiones');
    if (Number(sql(`SELECT count(*) FROM investments WHERE user_id=${owner} AND is_active=true AND ticker IS NOT NULL AND is_manual_price=false`)) > 0) throw blocked('INVESTMENTS_GET_COULD_REFRESH_NONMANUAL_PRICES_READONLY_SCOPE');
    const response = await apiGet('/api/investments');
    assert.equal(response.status, 200); assert.ok(Array.isArray(response.data));
    const expected = rows(`SELECT id,name,quantity,purchase_price,current_price,is_manual_price,type,purchase_currency,market_currency FROM investments WHERE user_id=${owner} AND is_active=true ORDER BY id`);
    assert.deepEqual(response.data.map(item => item.id).sort(), expected.map(item => item.id).sort());
    for (const item of response.data) {
      assert.equal(item.user_id, a.id);
      const stored = expected.find(row => row.id === item.id);
      assert.equal(Number(item.quantity), Number(stored.quantity));
      assert.equal(Number(item.purchase_price), Number(stored.purchase_price));
      const quantity = Number(stored.quantity).toLocaleString('es-AR', { maximumFractionDigits: 8 });
      const purchase = Number(stored.purchase_price).toLocaleString('en-US', { minimumFractionDigits: 2 });
      const line = `${stored.type === 'bond' ? 'VN ' : ''}${quantity}${stored.type !== 'bond' ? ' unidades' : ''} · Compra: ${stored.purchase_currency} ${purchase}`;
      assert.equal(await execute('const span=Array.from(document.querySelectorAll("span")).find(s=>s.textContent.trim()===arguments[0]);return span?.closest(".card")?.textContent.replace(/\\s+/g," ").includes(arguments[1])??false;', [stored.name, line]), true);
    }
    checks.push({ name: 'Investments page and ordinary GET agree with owner-only active SQL positions, quantities and purchase price', status: 'PASS', count: expected.length });
    // Canonical CP4-08-derived subcheck only when the existing manual fixture matches.
    const canonical = expected.find(item => item.is_manual_price === true && item.type !== 'bond' && (item.market_currency || item.purchase_currency) === 'USD' && Number(item.quantity) === 6 && Number(item.current_price) === 110);
    if (!canonical) { checks.push({ name: 'CP4-08-derived local simulation 660 to 726', status: 'BLOCKED', reason: 'Canonical existing manual quantity6/price110 fixture absent; no fixture is invented or rewritten' }); return; }
    const available = await execute('return Array.from(document.querySelectorAll("button")).some(b=>b.textContent.trim()==="Simular escenario"&&!b.disabled);');
    if (!available) { checks.push({ name: 'CP4-08-derived local simulation 660 to 726', status: 'BLOCKED', reason: 'Existing user lacks usable Premium simulation; no plan change requested' }); return; }
    const before = financialFingerprint();
    await clickButton('Simular escenario');
    const select = await find('#investment-simulation-form select');
    await execute('const select=arguments[0];select.value=arguments[1];select.dispatchEvent(new Event("change",{bubbles:true}));', [{ [elementKey]: select }, canonical.id]);
    await fill('#investment-simulation-form input', '10'); await clickButton('Simular');
    await waitUntil(() => execute('return !!document.querySelector("[data-testid=simulation-hypothetical-value]");'));
    const values = await execute('return ["simulation-current-value","simulation-hypothetical-value"].map(id=>document.querySelector(`[data-testid="${id}"]`)?.textContent.trim());');
    assert.deepEqual(values, ['USD 660,00', 'USD 726,00']);
    await clickButton('Cerrar simulación');
    assert.equal(financialFingerprint(), before);
    checks.push({ name: 'CP4-08-derived UI simulation 660 to 726 then close preserves four financial fact tables', status: 'PASS', currentValue: 660, hypotheticalValue: 726 });
  });
  await openSession('user-b'); await login(appUrl, b);
  const bAccounts = await apiGet('/api/accounts?lite=1'); assert.equal(bAccounts.status, 200);
  const bExpected = rows(`SELECT id FROM accounts WHERE user_id=${literal(b.id)} AND is_active=true ORDER BY id`);
  assert.deepEqual(bAccounts.data.map(item => item.id).sort(), bExpected.map(item => item.id).sort());
  const aIds = rows(`SELECT id FROM accounts WHERE user_id=${owner}`).map(item => item.id);
  assert.ok(bAccounts.data.every(item => !aIds.includes(item.id)));
  report.cases.find(c => c.cu === 'CU002').checks.push({ name: 'Second ordinary UI login GET agrees with B SQL owner and excludes A accounts', status: 'PASS', count: bExpected.length });
  await openSession('existing-guest');
  await navigate(appUrl, '/login');
  assert.equal((await apiGet('/api/accounts')).status, 401, 'Guest browser session must have no ordinary Auth session');
  const group = rows(`SELECT id,is_active FROM shared_groups WHERE id=${literal(fixture.guest.groupId)}`)[0];
  assert.ok(group);
  const guestResponse = await apiGet(`/api/shared/${fixture.guest.token}`);
  if (!group.is_active) {
    assert.equal(guestResponse.status, 404);
    report.cases.find(c => c.cu === 'CU001').checks.push({ name: 'Existing revoked guest capability denied404, matching readonly SQL inactive group; no join/token rotation', status: 'PASS' });
  } else {
    assert.equal(guestResponse.status, 200);
    assert.equal(guestResponse.data.group.id, fixture.guest.groupId);
    const memberIds = rows(`SELECT id FROM shared_group_members WHERE group_id=${literal(fixture.guest.groupId)}`).map(m => m.id).sort();
    assert.deepEqual(guestResponse.data.members.map(m => m.id).sort(), memberIds);
    report.cases.find(c => c.cu === 'CU001').checks.push({ name: 'Existing guest capability reads exactly its SQL group members; no Auth identity inferred', status: 'PASS', members: memberIds.length });
  }
  report.financialFacts.afterSha256 = financialFingerprint();
  report.financialFacts.unchanged = report.financialFacts.beforeSha256 === report.financialFacts.afterSha256;
  assert.equal(report.financialFacts.unchanged, true);
  report.sourceStable = JSON.stringify(await manifest()) === JSON.stringify(report.sourceManifest);
  assert.equal(report.sourceStable, true);
  report.status = report.cases.some(c => c.status === 'FAIL') ? 'FAIL' : report.cases.some(c => c.status === 'BLOCKED') ? 'PARTIAL_BLOCKED' : 'PASS_BOUNDED_READS_ONLY';
  report.cnf09 = { status: 'BLOCKED', reason: 'Full original critical CP suite, all four browsers and stable previous versions are outside this bounded reading proof; original matrix cells stay unapproved. OCR/AI and other real-provider acceptance not exercised.' };
} catch (error) {
  report.status = error.blocked ? 'BLOCKED' : 'FAIL';
  report.blockers.push(error.safeCode || 'PREFLIGHT_OR_ASSERTION_FAILED_RAW_ERROR_OMITTED');
  report.failureLocation = error.stack?.match(/run-browser-read\.mjs:(\d+):\d+/)?.[1] || null;
  process.exitCode = error.blocked ? 2 : 1;
} finally {
  try { await closeSession(); } catch { report.cleanup.sessionClose = 'FAILED_RAW_ERROR_OMITTED'; report.status = 'FAIL'; }
  if (driver && driver.exitCode === null && driver.signalCode === null) {
    driver.kill('SIGTERM');
    await Promise.race([new Promise(resolve => driver.once('exit', resolve)), sleep(3000)]);
    if (driver.exitCode === null && driver.signalCode === null) {
      driver.kill('SIGKILL'); report.cleanup.driverForcedStop = true;
      await Promise.race([new Promise(resolve => driver.once('exit', resolve)), sleep(3000)]);
    }
    report.cleanup.driverStopped = driver.exitCode !== null || driver.signalCode !== null;
  } else if (driver) {
    report.cleanup.driverStopped = true;
  }
  if (driver && !report.cleanup.driverStopped) { report.status = 'FAIL'; report.blockers.push('OWN_DRIVER_STOP_NOT_CONFIRMED'); }
  report.cleanup.remoteAutomationPreference = 'Not modified by runner; E2E owner activates/restores only the explicitly authorized Safari setting';
  if (profiles && (!driver || report.cleanup.driverStopped)) {
    assert.match(profiles, /^\/tmp\/zarix-browser-compat-profiles-[A-Za-z0-9]+$/);
    try { await fs.rm(profiles, { recursive: true }); report.cleanup.ownTemporaryProfilesRemoved = true; }
    catch { report.cleanup.ownTemporaryProfilesRemoved = false; }
  }
  if (report.status === 'FAIL') process.exitCode = 1;
  else if (['BLOCKED', 'PARTIAL_BLOCKED'].includes(report.status)) process.exitCode = 2;
  await save();
  console.log(JSON.stringify({ status: report.status, product: browser, report: path.join(output, 'browser-read-verification.json'), cases: report.cases.map(c => ({ cu: c.cu, status: c.status })), blockers: report.blockers }, null, 2));
}
