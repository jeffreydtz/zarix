// Four scoped post-restore reads; no complete CNF-12 or backup-plan acceptance.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { createRestoreOracle } from './lib/restored-ui-oracles.mjs';

assert.equal(process.env.ZARIX_RESTORE_UI_WINDOW_CONFIRM, 'post-load-exclusive', 'Parent must release LOAD first');
const runtime = '/tmp/zarix-runtime-20261015';
const appOrigin = 'http://127.0.0.1:3002';
const apiOrigin = 'http://127.0.0.1:55321';
const hash = value => createHash('sha256').update(value).digest('hex');
const report = { startedAt: new Date().toISOString(), status: 'RUNNING', cases: [], screenshots: [], requests: [], guards: [],
  scope: 'Exactly four scoped restored CU reads via ordinary Auth, restored API and independent SQL. Original Native22 fixture preserved; eight explicitly auxiliary synthetic FX cache rows added after restore. No financial submit, new identity, provider acceptance, original nominal CNF12 fixture or contracted-backup claim.' };
const output = path.resolve(process.env.ZARIX_RESTORE_UI_OUTPUT || runtime + '/restored-ui-read-' + report.startedAt.replace(/[^0-9]/g, ''));
assert.ok(output.startsWith(runtime + '/'));
await fs.mkdir(output, { mode: 0o700 }); // A retry never replaces an earlier attempt's report/captures.
let browser, context, uiAccess, sdkB, ownLock = false;
const setupPath = runtime + '/restored-read-aux-setup.json';
const lockPath = runtime + '/restored-read-ui.lock';
const save = async () => fs.writeFile(path.join(output, 'restored-ui-read.json'), JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
const readPrivate = async file => { const stat = await fs.lstat(file); assert.ok(stat.isFile() && stat.nlink === 1); assert.equal(stat.mode & 0o077, 0); assert.equal(stat.uid, process.getuid()); return JSON.parse(await fs.readFile(file, 'utf8')); };
async function durablePrivate(file, value) {
  const temporary = file + '.' + process.pid + '.tmp';
  const handle = await fs.open(temporary, 'wx', 0o600);
  try { await handle.writeFile(JSON.stringify(value, null, 2) + '\n'); await handle.sync(); } finally { await handle.close(); }
  await fs.rename(temporary, file);
  const directory = await fs.open(path.dirname(file), 'r');
  try { await directory.sync(); } finally { await directory.close(); }
}
const values = {};
const nativeFetch = (input, init = {}) => fetch(input, { ...init, redirect: 'error' });
try {
  for (const line of (await fs.readFile(runtime + '/restore.env', 'utf8')).split('\n')) {
    if (line && !line.startsWith('#')) { const index = line.indexOf('='); values[line.slice(0, index)] = JSON.parse(line.slice(index + 1)); }
  }
  assert.equal(values.ZARIX_RESTORE_SUPABASE_URL, apiOrigin);
  const db = new URL(values.ZARIX_RESTORE_DATABASE_URL);
  assert.equal(db.hostname, '127.0.0.1'); assert.equal(db.port, '55322'); assert.equal(db.pathname, '/postgres'); assert.equal(db.search, '');
  const state = await readPrivate(runtime + '/restored-read-app-state.json');
  assert.equal(state.purpose, 'restored-ui-read-only'); assert.equal(state.appOrigin, appOrigin); assert.equal(state.restoreOrigin, apiOrigin);
  assert.equal(state.revision, 'bb2e8a6aa5de7f7f26ba745da67257b0f1f25e81');
  const proof = await readPrivate(runtime + '/restored-read-build-proof.json');
  assert.equal(proof.buildId, state.buildId); assert.equal((await fs.readFile(path.join(state.copyRoot, '.next/BUILD_ID'), 'utf8')).trim(), state.buildId);
  for (const source of proof.sources) assert.equal(hash(await fs.readFile(path.join(state.copyRoot, source.path))), source.sha256);
  const listener = spawnSync('/usr/sbin/lsof', ['-nP', '-t', '-iTCP:3002', '-sTCP:LISTEN'], { encoding: 'utf8' });
  assert.equal(listener.status, 0); assert.deepEqual([...new Set(listener.stdout.trim().split(/\s+/).map(Number))], [state.pid], 'Do not adopt another listener');
  process.kill(state.pid, 0);
  report.buildBinding = { revision: state.revision, buildId: state.buildId, sourceCount: proof.sources.length,
    sourceManifestSha256: hash(JSON.stringify(proof.sources)), nextPid: state.pid, sourceCopyBound: true };
  const fixture = await readPrivate(runtime + '/source-native-logins.json');
  assert.equal(fixture.users.length, 2); assert.ok(fixture.users.every(user => /^zarix-.+@example\.invalid$/.test(user.email)));
  for (const user of fixture.users) assert.match(user.id, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  const [a, b] = fixture.users;
  const lock = await fs.open(lockPath, 'wx', 0o600);
  try { await lock.writeFile(JSON.stringify({ purpose: 'restored-ui-read-only', pid: process.pid, startedAt: report.startedAt }) + '\n'); await lock.sync(); } finally { await lock.close(); }
  ownLock = true;
  const oracle = createRestoreOracle({ databaseUrl: db, pgBin: values.ZARIX_PG_BIN });
  assert.equal(oracle.sqlRead(`SELECT count(*) FROM auth.users WHERE id IN ('${a.id}','${b.id}')`), '2');
  assert.equal(oracle.sqlRead('SHOW default_transaction_read_only'), 'on');
  report.sqlReadControl = { scope: 'Only the independently queried psql sessions use PGOPTIONS default_transaction_read_only=on; no global DB/REST read-only claim', observed: 'on' };
  const target = { apiOrigin, database: 'postgres', databasePort: 55322,
    restoreEnvSha256: hash(await fs.readFile(runtime + '/restore.env')), existingUserIds: fixture.users.map(user => user.id).sort() };
  let setup;
  try { setup = await readPrivate(setupPath); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    setup = { phase: 'planned', target, plannedAt: new Date().toISOString(),
      canonical25Before: oracle.captureCanonical25(), originalFxBefore: oracle.captureFx(),
      marketCacheBefore: oracle.captureMarketCache(), grantsBefore: oracle.grantsDigest(), plan: oracle.prepareAuxFx1200() };
    await durablePrivate(setupPath, setup); // Persist stable IDs/baselines before the only permitted INSERT.
  }
  assert.ok(['planned', 'committed'].includes(setup.phase)); assert.deepEqual(setup.target, target);
  const beforeSeed = setup.canonical25Before, originalFx = setup.originalFxBefore, grantsBefore = setup.grantsBefore;
  assert.deepEqual(oracle.captureCanonical25(), beforeSeed); assert.deepEqual(oracle.captureMarketCache(), setup.marketCacheBefore); assert.deepEqual(oracle.grantsDigest(), grantsBefore);
  const fxNow = oracle.captureFx();
  assert.ok(Object.entries(originalFx.rows).every(([id, sha256]) => fxNow.rows[id] === sha256), 'Preserve all original FX before any insert/reuse');
  assert.ok(Object.keys(fxNow.rows).filter(id => !Object.hasOwn(originalFx.rows, id)).every(id => setup.plan.insertedIds.includes(id)), 'Unexpected auxiliary FX must not be rebaselined');
  if (setup.phase === 'committed') assert.equal(oracle.verifyAuxFxPreserved(originalFx, setup.result), true, 'Do not rebaseline changed committed auxiliary rows');
  report.auxiliaryFxSetup = oracle.appendAuxFx1200(setup.plan, { alreadyCommitted: setup.phase === 'committed' });
  assert.equal(report.auxiliaryFxSetup.insertedCount, 8);
  assert.equal(oracle.verifyAuxFxPreserved(originalFx, report.auxiliaryFxSetup), true);
  setup = { ...setup, phase: 'committed', committedAt: setup.committedAt || new Date().toISOString(), result: report.auxiliaryFxSetup };
  await durablePrivate(setupPath, setup);
  report.auxiliaryCheckpoint = { path: setupPath, phase: setup.phase, stablePlanReused: report.auxiliaryFxSetup.action === 'reused', privateMode: '0600', writtenAndFsyncedBeforeInsert: true };
  const afterSeed = oracle.captureCanonical25();
  assert.deepEqual(afterSeed, beforeSeed, 'Only explicitly auxiliary FX/cache may change');
  const expected = oracle.ownerFixture(a.id);
  report.harnessSources = Object.fromEntries(await Promise.all(['scripts/test-restored-ui-read.mjs','scripts/lib/restored-ui-oracles.mjs','scripts/lib/restored-read-fetch-guard.mjs'].map(async relative => [relative, hash(await fs.readFile(new URL('../' + relative, import.meta.url)))])));
  report.fixture = { ordinaryExistingUsers: 2, userIds: fixture.users.map(user => user.id), actualRestored: expected,
    nominalOriginalCnf12FixtureClaimed: false, originalFxBefore: originalFx, credentialsPublished: false };
  const { chromium } = await import(pathToFileURL(process.env.ZARIX_PLAYWRIGHT_MODULE || '/tmp/zarix-e2e-20261015/node_modules/playwright/index.mjs').href);
  browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  context = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });
  report.browser = { product: 'Installed Google Chrome', version: browser.version(), headless: true, privateEphemeralContext: true };
  const origins = new Set([appOrigin, apiOrigin]);
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (['data:', 'blob:'].includes(url.protocol)) return route.continue();
    if (!origins.has(url.origin)) { report.guards.push({ kind: 'browser-egress-denied', hostname: url.hostname }); return route.abort('blockedbyclient'); }
    if (url.origin === appOrigin && url.pathname === '/api/market-data') {
      report.guards.push({ kind: 'market-widget-refresh-denied', reason: 'The market widget can upsert original cache; this proof reads stored financial positions only' });
      return route.abort('blockedbyclient');
    }
    if (url.origin === appOrigin && url.pathname === '/dashboard') {
      report.guards.push({ kind: 'dashboard-navigation-denied', reason: 'Avoid automatic derived net-worth snapshot while reading only four requested CU pages' });
      return route.abort('blockedbyclient');
    }
    if (url.origin === appOrigin && url.pathname.startsWith('/api/') && !['GET', 'HEAD'].includes(request.method())) {
      report.guards.push({ kind: 'unrequested-api-write-denied', method: request.method() }); return route.abort('blockedbyclient');
    }
    // Playwright only routes the initial URL of a redirect chain. Do not let
    // the browser follow any HTTP redirect after allowing a loopback origin.
    try {
      const response = await route.fetch({ maxRedirects: 0 });
      if (response.status() >= 300 && response.status() < 400) {
        report.guards.push({ kind: 'http-redirect-denied', status: response.status() });
        return route.abort('blockedbyclient');
      }
      return route.fulfill({ response });
    } catch {
      report.guards.push({ kind: 'browser-route-transport-failure' });
      return route.abort('failed');
    }
  });
  const page = await context.newPage(); page.setDefaultTimeout(20000);
  await page.goto(appOrigin + '/login');
  await page.getByLabel('Email', { exact: true }).fill(a.email); await page.locator('#password').fill(a.password);
  const signed = page.waitForResponse(response => response.url().startsWith(apiOrigin + '/auth/v1/token') && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Ingresar', exact: true }).click();
  const authResponse = await signed; assert.equal(authResponse.status(), 200);
  const authBody = await authResponse.json(); assert.equal(authBody.user.id, a.id); uiAccess = authBody.access_token;
  const userCheck = await nativeFetch(apiOrigin + '/auth/v1/user', { headers: { apikey: values.ZARIX_RESTORE_ANON_KEY, Authorization: 'Bearer ' + uiAccess } });
  assert.equal(userCheck.status, 200); assert.equal((await userCheck.json()).id, a.id);
  report.normalUiPasswordAuth = true;
  page.on('response', response => {
    const url = new URL(response.url());
    if (url.origin === appOrigin && ['/api/accounts', '/api/transactions', '/api/transactions/summary', '/api/investments/portfolio', '/api/market-data'].includes(url.pathname)) report.requests.push({ path: url.pathname, method: response.request().method(), status: response.status() });
  });
  const apiGet = async endpoint => { const response = await page.request.get(appOrigin + endpoint, { maxRedirects: 0 }); assert.equal(response.status(), 200); return response.json(); };
  async function ready(heading) {
    await page.getByRole('heading', { name: heading, exact: true }).first().waitFor();
    await page.evaluate(async title => {
      await document.fonts.ready;
      await new Promise((resolve, reject) => {
        let previous = '', stable = 0;
        const timeout = setTimeout(() => reject(new Error('Read capture did not settle')), 15000);
        const sample = () => {
          const node = [...document.querySelectorAll('h1,h2,h3')].find(item => item.textContent.trim() === title);
          let opaque = Boolean(node);
          for (let item = node; item; item = item.parentElement) if (Number(getComputedStyle(item).opacity) < 0.99) opaque = false;
          const financial = [...document.querySelectorAll('.page-shell section,.page-shell .card,.page-shell .zx-num,.page-shell [style*="opacity"]')].filter(item => {
            const rect = item.getBoundingClientRect(); return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < innerHeight && rect.right > 0 && rect.left < innerWidth;
          });
          for (const item of financial) for (let ancestor = item; ancestor; ancestor = ancestor.parentElement) if (Number(getComputedStyle(ancestor).opacity) < 0.99) opaque = false;
          const busy = document.querySelector('[aria-busy="true"][aria-label="Cargando gráfico"]');
          const rect = node?.getBoundingClientRect();
          const signature = node && opaque && !busy && rect.width > 0 ? JSON.stringify([rect.x, rect.y, rect.width, rect.height, document.querySelector('.page-shell')?.textContent]) : '';
          stable = signature && signature === previous ? stable + 1 : 0; previous = signature;
          if (stable >= 6) { clearTimeout(timeout); resolve(); } else requestAnimationFrame(sample);
        }; sample();
      });
    }, heading);
  }
  async function capture(cu) {
    const file = cu + '-restored-read.png'; await page.screenshot({ path: path.join(output, file), fullPage: false });
    report.screenshots.push({ path: file, sha256: hash(await fs.readFile(path.join(output, file))), readiness: 'Fonts, exact heading, visible financial card/section/number ancestors opacity>=0.99 and page-shell text stable for six frames; CU002 each rendered balance matches exact independent SQL target. No login/credentials captured' });
  }
  async function check(cu, title, pathname, verify) {
    const result = { cu, name: title, status: 'RUNNING', scope: 'Restored ordinary authenticated reading only; no complete original CU/CNF acceptance' }; report.cases.push(result);
    try { await page.goto(appOrigin + pathname, { waitUntil: 'domcontentloaded' }); await ready(title); result.evidence = await verify(); await capture(cu); result.status = 'PASS'; }
    catch (error) { result.status = 'FAIL'; result.errorType = error.name; result.failureLocation = error.stack?.match(/test-restored-ui-read\.mjs:(\d+):\d+/)?.[1] || null; }
    await save();
  }
  await check('CU001', 'Movimientos', '/expenses', async () => {
    const rows = await apiGet('/api/transactions?limit=2000'); assert.equal(rows.length, expected.transactions.length);
    assert.deepEqual(rows.map(row => row.id).sort(), expected.transactions.map(row => row.id).sort());
    for (const row of rows) { const source = expected.transactions.find(item => item.id === row.id); assert.equal(Number(row.amount), Number(source.amount)); assert.equal(row.user_id, a.id); }
    await page.getByText('Traídos: ' + expected.transactions.length, { exact: true }).waitFor();
    for (const row of expected.transactions.filter(item => item.description).slice(0, 3)) assert.ok((await page.locator('.page-shell').innerText()).includes(row.description));
    return { restoredRows: rows.length, exactIdsAmountsAndOwner: true, api: '/api/transactions', transferImpacts: expected.transferImpacts };
  });
  await check('CU002', 'Cuentas', '/accounts', async () => {
    const rows = await apiGet('/api/accounts'); assert.equal(rows.length, expected.accounts.length);
    assert.deepEqual(rows.map(row => row.id).sort(), expected.accounts.map(row => row.id).sort());
    const renderedBalances = [];
    for (const source of expected.accounts) {
      const actual = rows.find(row => row.id === source.id); assert.equal(Number(actual.balance), Number(source.balance)); assert.equal(actual.user_id, a.id); await page.getByText(source.name, { exact: true }).first().waitFor();
      const rendered = '$' + Number(source.balance).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      await page.waitForFunction(({ href, text }) => { const card = document.querySelector(`a[href="${href}"]`)?.closest('.card'); return card?.querySelector('.zx-num')?.textContent === text; }, { href: '/accounts/' + source.id, text: rendered });
      renderedBalances.push({ id: source.id, text: rendered });
    }
    await ready('Cuentas');
    return { restoredAccounts: rows.length, exactIdsBalancesOwnerAndVisibleNames: true, renderedBalances, uiBalancesEqualIndependentSql: true, api: '/api/accounts' };
  });
  await check('CU003', 'Análisis financiero', '/analysis?period=custom&startDate=' + expected.analysis.startDate + '&endDate=' + expected.analysis.endDate, async () => {
    const actual = await apiGet('/api/transactions/summary?month=' + expected.analysis.month);
    for (const field of ['totalIncome', 'totalExpenses', 'balance']) assert.ok(Math.abs(Number(actual[field]) - Number(expected.analysis[field])) < 0.00000001, 'Independent SQL summary differs');
    for (const [label, field] of [['Gastos', 'totalExpenses'], ['Ingresos', 'totalIncome'], ['Balance', 'balance']]) {
      const value = Number(expected.analysis[field]); const card = page.getByText(label, { exact: true }).first().locator('..');
      const text = (await card.locator('.text-2xl').innerText()).replace(/\s/g, '');
      assert.equal(text, (field === 'balance' && value >= 0 ? '+' : '') + '$' + Math.round(value).toLocaleString('es-AR'));
    }
    return { independentSql: expected.analysis, displayedRoundedValuesMatch: true, auxiliaryArsPerUsd: 1200, api: '/api/transactions/summary' };
  });
  await check('CU004', 'Inversiones', '/investments', async () => {
    const actual = await apiGet('/api/investments/portfolio');
    assert.deepEqual(actual.investments.map(row => row.id).sort(), expected.investments.map(row => row.id).sort());
    for (const field of ['totalCurrentValue', 'totalPurchaseValue', 'totalPnL', 'totalRealizedPnLUsd']) assert.ok(Math.abs(Number(actual[field]) - Number(expected.portfolio[field])) < 0.00000001, 'Independent SQL portfolio differs');
    for (const position of expected.investments) await page.getByText(position.name, { exact: true }).first().waitFor();
    const usd = value => Number(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    await page.getByText('USD ' + usd(expected.portfolio.totalCurrentValue), { exact: true }).first().waitFor();
    if (Number(expected.portfolio.totalRealizedPnLUsd) !== 0) {
      const row = page.getByText('P&L realizado (ventas)', { exact: true }).locator('..').locator('..');
      assert.ok((await row.innerText()).includes('USD ' + usd(expected.portfolio.totalRealizedPnLUsd)));
    }
    return { positions: actual.investments.length, independentSqlPortfolio: expected.portfolio, uiStoredPositionsAndPnlVisible: true, api: '/api/investments/portfolio', liveQuoteRefresh: false };
  });
  sdkB = createClient(apiOrigin, values.ZARIX_RESTORE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: nativeFetch } });
  const signedB = await sdkB.auth.signInWithPassword({ email: b.email, password: b.password }); assert.equal(signedB.error, null); assert.equal(signedB.data.user.id, b.id);
  const userB = await sdkB.auth.getUser(); assert.equal(userB.error, null); assert.equal(userB.data.user.id, b.id);
  const foreign = await sdkB.from('accounts').select('id').eq('user_id', a.id); assert.equal(foreign.error, null); assert.deepEqual(foreign.data, []);
  report.normalRestoredBReadRls = { verifiedUser: true, foreignOwnerAccounts: 0 };
  const after = oracle.captureCanonical25(); const fxAfter = oracle.captureFx();
  assert.deepEqual(after, beforeSeed); assert.deepEqual(oracle.grantsDigest(), grantsBefore); assert.deepEqual(oracle.captureMarketCache(), setup.marketCacheBefore);
  report.integrity = { canonical25Before: beforeSeed, canonical25After: after, exactMatch: true, grantsBefore, grantsAfter: oracle.grantsDigest(), originalFxBefore: originalFx, fxAfter,
    auxiliaryFxOnly: oracle.verifyAuxFxPreserved(originalFx, report.auxiliaryFxSetup), marketCacheBefore: setup.marketCacheBefore,
    marketCacheAfter: oracle.captureMarketCache(), originalMarketCacheExactMatch: true, authSessionWritesExpected: true, noFinancialMutations: true };
  assert.equal(report.integrity.auxiliaryFxOnly, true);
  const audit = (await fs.readFile('/tmp/zarix-restored-read-fetch-guard-20261015.jsonl', 'utf8')).trim().split('\n').map(line => JSON.parse(line));
  assert.ok(audit.some(item => item.event === 'installed' && item.pid === state.pid), 'Guard must attest exact Next process');
  report.serverFetchGuard = { installedBeforeNext: true, guardSha256: state.fetchGuardSha256, decisions: audit.length,
    deniedExternal: audit.filter(item => item.allowed === false), scope: 'globalThis.fetch only, not firewall/universal TCP; browser also bounded to restore/app loopback origins' };
  report.sourceStable = (await Promise.all(proof.sources.map(async source => hash(await fs.readFile(path.join(state.copyRoot, source.path))) === source.sha256))).every(Boolean);
  report.harnessStable = (await Promise.all(Object.entries(report.harnessSources).map(async ([relative, sha256]) => hash(await fs.readFile(new URL('../' + relative, import.meta.url))) === sha256))).every(Boolean);
  report.status = report.cases.length === 4 && report.cases.every(item => item.status === 'PASS') && report.sourceStable && report.harnessStable ? 'PARTIAL' : 'FAIL';
  report.blockers = ['Original CNF12 contracted-backup plan and nominal2accounts/20movements/3lots/1rule/1group/timing/boundaries not claimed', 'Eight1200 auxiliary FX rows are declared post-restore test references, not contents of the original backup', 'No live provider, TLS, full four-CU acceptance, host/power failure or complete network isolation claim'];
} catch (error) {
  report.status = 'FAIL'; report.failure = { type: error.name, location: error.stack?.match(/test-restored-ui-read\.mjs:(\d+):\d+/)?.[1] || null, rawExceptionPublished: false };
} finally {
  report.cleanup = [];
  if (sdkB) {
    try { const result = await sdkB.auth.signOut({ scope: 'local' }); report.cleanup.push({ operation: 'own-sdk-session-local-signout', status: result.error ? 'FAIL' : 'PASS' }); }
    catch { report.cleanup.push({ operation: 'own-sdk-session-local-signout', status: 'FAIL' }); }
  }
  if (uiAccess) {
    try { const response = await nativeFetch(apiOrigin + '/auth/v1/logout?scope=local', { method: 'POST', headers: { apikey: values.ZARIX_RESTORE_ANON_KEY, Authorization: 'Bearer ' + uiAccess } }); report.cleanup.push({ operation: 'own-ui-session-local-signout', status: response.status === 204 ? 'PASS' : 'FAIL', httpStatus: response.status }); }
    catch { report.cleanup.push({ operation: 'own-ui-session-local-signout', status: 'FAIL' }); }
  }
  let browserClosed = !browser;
  if (browser) {
    try { await browser.close(); browserClosed = true; report.cleanup.push({ operation: 'own-chrome-close', status: 'PASS' }); }
    catch { report.cleanup.push({ operation: 'own-chrome-close', status: 'FAIL', lockRetained: true }); }
  }
  if (report.cleanup.some(item => item.status === 'FAIL')) report.status = 'FAIL';
  report.finishedAt = new Date().toISOString(); await save(); // Retain the lock if final evidence cannot be saved.
  if (ownLock && browserClosed) { const lock = await readPrivate(lockPath); assert.equal(lock.pid, process.pid); await fs.unlink(lockPath); }
  console.log(JSON.stringify({ status: report.status, scopedCases: report.cases.map(item => ({ cu: item.cu, status: item.status })), report: path.join(output, 'restored-ui-read.json') }));
  if (report.status === 'FAIL') process.exitCode = 1;
}
