// CNF-01 local browser evidence. Never seeds, deletes or resets a database.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { performance } from 'node:perf_hooks';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { isolatedNativeTargets, isolatedPgEnvironment, isolatedApiFetch } from './lib/test-isolated-native-target.mjs';
import { createProfileController } from './lib/test-isolated-browser-profile-controller.mjs';

const sha = value => createHash('sha256').update(value).digest('hex');
const literal = value => `'${String(value).replaceAll("'", "''")}'`;
const output = path.resolve(process.env.ZARIX_LOAD_OUTPUT || '/tmp/zarix-isolated-browser-load');
const report = {
  startedAt: new Date().toISOString(), status: 'RUNNING', criterion: 'CNF-01',
  command: 'node scripts/test-isolated-browser-load.mjs',
  scope: 'Local installed Chrome, 20 ordinary password-authenticated contexts, 100 warm full dashboard navigations. SQL checks all fixture rows and actual visible financial values; local measurements do not establish deployment equivalence or whole CNF-01 acceptance.',
  environment: { node: process.version, platform: process.platform, arch: process.arch, release: os.release(), cpu: os.cpus()[0]?.model },
  network: { mechanism: 'Chrome CDP Network.emulateNetworkConditions', downloadBitsPerSecond: 20_000_000, uploadBitsPerSecond: 20_000_000, latencyMs: 50, scope: 'Per browser target; not a shared 20 Mbps pipe and not server-to-provider shaping', browserHttpCache: 'Disabled implicitly by Playwright routing used for the loopback guard; warmup refers to application/server state and persisted quote cache' },
  profiles: {
    warm: { status: 'RUNNING', scheduledObservations: 100, concurrentContexts: 20, warmupNavigations: 20, observations: [] },
    coldStart: { status: 'BLOCKED', observations: [], reason: 'Normal UI login already navigates to dashboard. No instrumented fresh application process/cache reset with pre-existing sessions was supplied; warm timings cannot stand for cold start.' },
    providerOutage: { status: 'BLOCKED', observations: [], reason: 'No separately identified server-side outage profile and independent fallback oracle were supplied. Browser loopback restriction does not simulate a server provider outage.' },
  },
  blockers: ['Deployment-equivalent hardware, topology and device profile not established by this isolated local run', 'Separate legitimate cold-start and provider-outage profiles remain required'],
  screenshots: [],
};
let browser, controller, activeProfile = 'warm';
await fs.mkdir(output, { recursive: true, mode: 0o700 });
async function save() {
  report.finishedAt = new Date().toISOString();
  await fs.writeFile(path.join(output, 'browser-load.json'), JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
  const fields = ['netWorthARS', 'netWorthUSD', 'incomeARS', 'spentARS', 'balanceARS'];
  for (const [profile, result] of Object.entries(report.profiles)) {
    const rows = result.observations.map(item => [item.index, item.wave, item.context, item.user, item.startedAt, item.durationMs, item.status, item.failure || '', item.httpStatus ?? '', item.pageErrors, item.financialRequestFailures, ...fields.map(field => item.observedFinancialValues?.[field] ?? '')].join(','));
    await fs.writeFile(path.join(output, `${profile}-observations.csv`), 'index,wave,context,user,startedAt,durationMs,status,failure,httpStatus,pageErrors,financialRequestFailures,netWorthARS,netWorthUSD,incomeARS,spentARS,balanceARS\n' + rows.join('\n') + '\n', { mode: 0o600 });
  }
}
function blocked(message) { return Object.assign(new Error(message), { blocked: true }); }
function summary(observations) {
  const sorted = observations.map(item => item.durationMs).sort((a, b) => a - b);
  const rank = percentile => sorted.length ? sorted[Math.ceil(percentile * sorted.length) - 1] : null;
  return { count: observations.length, failures: observations.filter(item => item.status === 'FAIL').length, p50Ms: rank(0.50), p95Ms: rank(0.95), maxMs: sorted.at(-1) ?? null, percentileMethod: 'Nearest rank over all recorded durations, including errors and timeouts; no failed sample removed' };
}
try {
  if (!/^v(?:22|23|24)\./.test(process.version)) throw blocked('Use Node 22–24');
  const { apiUrl, databaseUrl, database } = isolatedNativeTargets();
  const appUrl = new URL(process.env.ZARIX_E2E_APP_URL || 'http://127.0.0.1:3100');
  assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(appUrl.hostname), 'Non-loopback app refused');
  assert.ok(['http:', 'https:'].includes(appUrl.protocol) && !appUrl.username && !appUrl.password && !appUrl.search && !appUrl.hash);
  if (appUrl.hostname === 'localhost') appUrl.hostname = '127.0.0.1';
  if (!process.env.ZARIX_LOCAL_ANON_KEY) throw blocked('ZARIX_LOCAL_ANON_KEY is required');
  const fixtureFile = process.env.ZARIX_LOAD_FIXTURE_FILE;
  if (!fixtureFile) throw blocked('ZARIX_LOAD_FIXTURE_FILE must identify an existing private canonical fixture in a separate isolated replica');
  if ((await fs.stat(fixtureFile)).mode & 0o077) throw blocked('The fixture credential file must be private (0600)');
  const fixture = JSON.parse(await fs.readFile(fixtureFile, 'utf8'));
  assert.equal(fixture.purpose, 'isolated-load-replica');
  assert.equal(fixture.databaseName, database, 'Fixture and SQL instance differ');
  assert.equal(fixture.serverTimeZone, 'Etc/UTC', 'Month-flow oracle requires the application process timezone to be UTC');
  assert.equal(fixture.users?.length, 2, 'Exactly two normal synthetic users required');
  assert.equal(fixture.accountNamePrefix, 'ZARIX LOAD ');
  for (const user of fixture.users) {
    assert.match(user.id, /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i);
    assert.match(user.email, /^(zarix-|test-).+@(example\.invalid|zarix\.invalid)$/i);
    assert.ok(typeof user.password === 'string' && user.password.length >= 8);
  }
  const pgEnv = { ...isolatedPgEnvironment(databaseUrl), PGOPTIONS: '-c default_transaction_read_only=on' };
  const psql = path.join(process.env.ZARIX_PG_BIN || '', 'psql');
  function sql(statement) {
    const child = spawnSync(psql, ['-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-c', statement], { env: pgEnv, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
    assert.equal(child.status, 0, 'Read-only isolated SQL failed; private stderr is omitted');
    return child.stdout.trim();
  }
  const rows = query => JSON.parse(sql(`SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM (${query}) t`));
  const sourcePaths = [
    'scripts/test-isolated-browser-load.mjs', 'docs/testing/isolated-browser-load.md',
    'scripts/lib/test-isolated-browser-profile-controller.mjs',
    'scripts/lib/test-isolated-native-target.mjs', 'docs/tif/v2.13/casos_prueba.csv',
    'app/(authenticated)/dashboard/page.tsx', 'components/dashboard/NetWorthHero.tsx',
    'components/dashboard/MonthFlowCard.tsx', 'components/dashboard/AccountCards.tsx',
    'components/dashboard/RecentTransactions.tsx', 'components/ui/Amount.tsx',
    'lib/services/month-flow.ts', 'lib/services/accounts.ts', 'lib/services/investments.ts',
    'lib/services/cotizaciones.ts', 'supabase/schema.sql', 'package-lock.json',
  ];
  report.sourceManifest = await Promise.all(sourcePaths.map(async file => ({ path: file, sha256: sha(await fs.readFile(file)) })));
  const gitEnv = { ...process.env, DEVELOPER_DIR: '/Library/Developer/CommandLineTools' };
  const git = args => spawnSync('git', args, { encoding: 'utf8', env: gitEnv }).stdout.trim();
  report.revision = git(['rev-parse', 'HEAD']);
  report.trackedWorkingTreeChanges = git(['diff', '--name-only', 'HEAD']).split('\n').filter(Boolean);
  report.environment.postgres = sql('SELECT version()');
  report.environment.instance = { database, apiOrigin: apiUrl.origin, appOrigin: appUrl.origin, applicationMode: fixture.applicationMode || 'not independently established', applicationTimeZone: fixture.serverTimeZone };
  const fx = rows(`SELECT DISTINCT ON(source) source,rate,timestamp FROM exchange_rates WHERE from_currency='USD' AND to_currency='ARS' AND source IN ('blue','oficial','mep','ccl') ORDER BY source,timestamp DESC`);
  assert.equal(fx.length, 4, 'All four current synthetic sell references are required');
  for (const quote of fx) {
    const age = Date.now() - Date.parse(quote.timestamp);
    if (!(Number(quote.rate) > 0 && age >= -300_000 && age <= 300_000)) throw blocked('Canonical fixture requires fresh positive synthetic FX cache at the start');
    const buy = rows(`SELECT rate FROM exchange_rates WHERE source=${literal(quote.source + '_buy')} AND from_currency='USD' AND to_currency='ARS' AND timestamp=${literal(quote.timestamp)}::timestamptz`);
    assert.equal(buy.length, 1, 'Buy and sell must belong to the same cache sample');
    assert.ok(Number(buy[0].rate) > 0);
  }
  const blue = Number(fx.find(quote => quote.source === 'blue').rate);
  report.fixture = { syntheticOnly: true, countsPerUser: { accounts: 10, transactions: 5000, positions: 100 }, users: [], quoteMode: 'Synthetic persisted local reference; no real provider acceptance', fx: fx.map(quote => ({ source: quote.source, rate: Number(quote.rate), timestamp: quote.timestamp })) };
  const oracles = [];
  for (const [index, user] of fixture.users.entries()) {
    assert.equal(sql(`SELECT email FROM auth.users WHERE id=${literal(user.id)}`), user.email, 'Auth and SQL fixture must share one instance');
    assert.equal(sql(`SELECT onboarding_done AND status='ACTIVE' AND current_period_end>now() FROM users WHERE id=${literal(user.id)}`), 't', 'Fixture must already be onboarded with a valid synthetic Premium plan');
    const accounts = rows(`SELECT id,name,type,currency,balance,is_active,is_debt,is_multicurrency,include_in_total FROM accounts WHERE user_id=${literal(user.id)} ORDER BY id`);
    const transactions = rows(`SELECT id,account_id,type,amount,currency,amount_in_account_currency,transaction_date,description FROM transactions WHERE user_id=${literal(user.id)} ORDER BY transaction_date DESC,id DESC`);
    const positions = rows(`SELECT id,account_id,name,quantity,purchase_price,purchase_currency,current_price,current_price_updated_at,market_currency,is_active,is_manual_price FROM investments WHERE user_id=${literal(user.id)} ORDER BY id`);
    if (accounts.length !== 10 || transactions.length !== 5000 || positions.length !== 100) throw blocked('Canonical counts are not 10 accounts / 5000 movements / 100 positions for each user; existing rows are never deleted or overwritten');
    const accountIds = new Set(accounts.map(account => account.id));
    assert.ok(accounts.every(account => account.name.startsWith(fixture.accountNamePrefix) && account.is_active && !account.is_debt && !account.is_multicurrency && account.include_in_total && ['ARS', 'USD'].includes(account.currency) && account.type !== 'credit_card'), 'Only the documented simple synthetic account fixture is supported');
    assert.ok(transactions.every(transaction => accountIds.has(transaction.account_id) && transaction.description?.startsWith(fixture.accountNamePrefix) && ['income', 'expense', 'adjustment'].includes(transaction.type) && ['ARS', 'USD'].includes(transaction.currency)), 'Only the documented synthetic ledger fixture is supported');
    assert.equal(transactions.filter(transaction => transaction.type === 'adjustment').length, 10, 'Exactly ten opening adjustments are included in the 5000-row fixture');
    assert.ok(positions.every(position => accountIds.has(position.account_id) && position.name.startsWith(fixture.accountNamePrefix) && position.is_active && position.is_manual_price && position.purchase_currency === 'USD' && [null, 'USD'].includes(position.market_currency) && Number(position.current_price) > 0), 'All 100 positions require documented manual USD references');
    const flow = rows(`SELECT COALESCE(sum(amount*(CASE currency WHEN 'ARS' THEN 1 ELSE ${blue} END)) FILTER(WHERE type='income'),0) AS income_ars, COALESCE(sum(amount*(CASE currency WHEN 'ARS' THEN 1 ELSE ${blue} END)) FILTER(WHERE type='expense'),0) AS spent_ars FROM transactions WHERE user_id=${literal(user.id)} AND transaction_date>=date_trunc('month',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' AND transaction_date<=now()`)[0];
    const accountUSD = accounts.reduce((total, account) => total + Number(account.balance) / (account.currency === 'USD' ? 1 : blue), 0);
    const positionUSD = positions.reduce((total, position) => total + Number(position.quantity) * Number(position.current_price), 0);
    const oracle = { user: index + 1, id: user.id, netWorthARS: (accountUSD + positionUSD) * blue, netWorthUSD: accountUSD + positionUSD, incomeARS: Number(flow.income_ars), spentARS: Number(flow.spent_ars), balanceARS: Number(flow.income_ars) - Number(flow.spent_ars), accountIds: accounts.map(account => account.id), accountNames: accounts.map(account => account.name), recentDescriptions: transactions.slice(0, 5).map(transaction => transaction.description), fingerprint: sha(JSON.stringify({ accounts, transactions, positions })) };
    oracles.push(oracle);
    report.fixture.users.push({ id: user.id, user: index + 1, fingerprint: oracle.fingerprint, oracle: { netWorthARS: oracle.netWorthARS, netWorthUSD: oracle.netWorthUSD, incomeARS: oracle.incomeARS, spentARS: oracle.spentARS, balanceARS: oracle.balanceARS }, rows: { accounts: accounts.length, transactions: transactions.length, positions: positions.length } });
  }
  controller = await createProfileController({ appUrl, output, fx });
  if (controller) {
    await controller.start('normal');
    report.environment.managedProfiles = { appPort: appUrl.port, scope: controller.scope, providerMode: 'Explicit loopback HTTP provider double; no real integration', build: controller.buildEvidence };
  }
  const playwrightPath = process.env.ZARIX_PLAYWRIGHT_MODULE;
  if (!playwrightPath) throw blocked('ZARIX_PLAYWRIGHT_MODULE must identify an existing isolated Playwright installation');
  const { chromium } = await import(pathToFileURL(playwrightPath).href);
  const executablePath = process.env.ZARIX_CHROME_EXECUTABLE || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  await fs.access(executablePath);
  browser = await chromium.launch({ executablePath, headless: process.env.ZARIX_E2E_HEADED !== '1' });
  report.environment.browser = { product: 'Installed Google Chrome', version: browser.version(), executablePath, headless: process.env.ZARIX_E2E_HEADED !== '1', playwrightModuleSha256: sha(await fs.readFile(playwrightPath)) };
  // Verify ordinary GoTrue password login, never substitute service_role browser sessions.
  for (const [index, user] of fixture.users.entries()) {
    const client = createClient(apiUrl.href, process.env.ZARIX_LOCAL_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { fetch: isolatedApiFetch } });
    const signed = await client.auth.signInWithPassword({ email: user.email, password: user.password });
    assert.ok(!signed.error && signed.data.user?.id === user.id, 'Normal password authentication failed');
    const verified = await client.auth.getUser();
    assert.ok(!verified.error && verified.data.user.id === oracles[index].id);
  }
  const participants = await Promise.all(Array.from({ length: 20 }, async (_, index) => {
    const userIndex = index % 2, user = fixture.users[userIndex];
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block', timezoneId: 'Etc/UTC' });
    await context.route('**/*', route => {
      const requestUrl = new URL(route.request().url());
      return ['127.0.0.1', 'localhost', '[::1]'].includes(requestUrl.hostname) || ['data:', 'blob:'].includes(requestUrl.protocol) ? route.continue() : route.abort('blockedbyclient');
    });
    await context.addInitScript(() => { localStorage.setItem('zarix.networth.view', 'ars'); localStorage.setItem('zarix.privacy', '0'); });
    const page = await context.newPage();
    page.setDefaultTimeout(30_000);
    await page.goto(new URL('/login', appUrl).href, { waitUntil: 'domcontentloaded' });
    await page.getByLabel('Email', { exact: true }).fill(user.email);
    await page.locator('#password').fill(user.password);
    await page.getByRole('button', { name: 'Ingresar', exact: true }).click();
    await page.waitForURL('**/dashboard', { timeout: 60_000 });
    const own = await page.request.get(new URL('/api/accounts?lite=1', appUrl).href);
    assert.equal(own.status(), 200);
    const ownRows = await own.json();
    assert.equal(ownRows.length, 10);
    assert.deepEqual(ownRows.map(account => account.id).sort(), [...oracles[userIndex].accountIds].sort(), 'Each ordinary browser session must return exactly its owner SQL account IDs; lite need not expose user_id');
    const cdp = await context.newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 50, downloadThroughput: 20_000_000 / 8, uploadThroughput: 20_000_000 / 8, connectionType: 'wifi' });
    const participant = { page, context, oracle: oracles[userIndex], index: index + 1, errors: 0, financialFailures: 0 };
    page.on('pageerror', () => participant.errors++);
    page.on('response', response => {
      const url = new URL(response.url());
      if (url.origin === appUrl.origin && /^\/api\/(accounts|transactions|investments)(?:\/|$)/.test(url.pathname) && response.status() >= 400) participant.financialFailures++;
    });
    page.on('requestfailed', request => {
      const url = new URL(request.url());
      if (url.origin === appUrl.origin && /^\/api\/(accounts|transactions|investments)(?:\/|$)/.test(url.pathname)) participant.financialFailures++;
    });
    return participant;
  }));
  report.authentication = { normalPasswordLogins: 20, verifiedBrowserContexts: participants.length, distinctUsers: 2, simultaneousContexts: 20, serviceRoleBrowserSessions: 0 };
  async function expectValue(locator, expected) {
    await locator.waitFor({ state: 'visible' });
    await locator.evaluate((element, value) => new Promise((resolve, reject) => {
      const start = performance.now();
      function check() {
        const actual = Number(element.getAttribute('value'));
        if (element.getAttribute('value') !== '' && Number.isFinite(actual) && Math.abs(actual - value) <= Math.max(0.001, Math.abs(value) * 1e-10) && element.textContent?.trim()) return resolve(true);
        if (performance.now() - start >= 20_000) return reject(new Error('Financial value mismatch'));
        requestAnimationFrame(check);
      }
      check();
    }), expected);
  }
  async function completeDashboard(participant) {
    const { page, oracle } = participant;
    assert.equal(new URL(page.url()).pathname, '/dashboard');
    const hero = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Patrimonio total', exact: true }) });
    await expectValue(hero.locator('data').nth(0), oracle.netWorthARS);
    await expectValue(hero.locator('data').nth(1), oracle.netWorthUSD);
    const flow = page.getByRole('link').filter({ has: page.getByRole('heading', { name: 'Este mes', exact: true }) });
    await expectValue(flow.locator('data').nth(0), oracle.incomeARS);
    await expectValue(flow.locator('data').nth(1), oracle.spentARS);
    await expectValue(flow.locator('data').nth(2), oracle.balanceARS);
    await page.getByRole('heading', { name: 'Tus Cuentas', exact: true }).waitFor({ state: 'visible' });
    for (const name of oracle.accountNames) await page.getByRole('link', { name: `Ver movimientos de ${name}`, exact: true }).waitFor({ state: 'visible' });
    await page.getByRole('heading', { name: 'Ultimos Movimientos', exact: true }).waitFor({ state: 'visible' });
    for (const description of oracle.recentDescriptions) await page.getByText(description, { exact: true }).waitFor({ state: 'visible' });
    assert.equal(participant.errors, 0, 'Browser JavaScript error');
    assert.equal(participant.financialFailures, 0, 'Financial API failure');
  }
  async function observedFinancialValues(page) {
    // Numeric synthetic diagnostics only; do not copy body text, URLs or session data.
    return page.evaluate(() => {
      const heading = name => [...document.querySelectorAll('h2,h3')].find(element => element.textContent?.trim() === name);
      const hero = heading('Patrimonio total')?.closest('section');
      const flow = heading('Este mes')?.closest('a');
      const value = (container, index) => {
        const raw = container?.querySelectorAll('data')[index]?.getAttribute('value');
        const numeric = raw === undefined || raw === null || raw === '' ? NaN : Number(raw);
        return Number.isFinite(numeric) ? numeric : null;
      };
      return { netWorthARS: value(hero, 0), netWorthUSD: value(hero, 1), incomeARS: value(flow, 0), spentARS: value(flow, 1), balanceARS: value(flow, 2) };
    });
  }
  // Warm all targets and the application before the measured 5 waves × 20 navigations.
  const warmup = await Promise.allSettled(participants.map(async participant => {
    participant.errors = 0; participant.financialFailures = 0;
    const response = await participant.page.goto(new URL('/dashboard', appUrl).href, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    assert.equal(response.status(), 200);
    await completeDashboard(participant);
  }));
  report.profiles.warm.warmupFailures = warmup.filter(result => result.status === 'rejected').length;
  // Warmup failures are disclosed; all 100 measured samples still run and retain failures.
  for (let wave = 1; wave <= 5; wave++) {
    const observations = await Promise.all(participants.map(async participant => {
      participant.errors = 0; participant.financialFailures = 0;
      const observation = { index: (wave - 1) * 20 + participant.index, wave, context: participant.index, user: participant.oracle.user, startedAt: new Date().toISOString(), status: 'RUNNING' };
      const start = performance.now();
      try {
        const response = await participant.page.goto(new URL('/dashboard', appUrl).href, { waitUntil: 'domcontentloaded', timeout: 30_000 });
        observation.httpStatus = response?.status();
        assert.equal(observation.httpStatus, 200);
        await completeDashboard(participant);
        observation.status = 'PASS';
      } catch (error) {
        observation.status = 'FAIL';
        observation.failure = ['AssertionError', 'TimeoutError'].includes(error.name) ? error.name : 'BrowserOrOracleError';
      }
      observation.durationMs = performance.now() - start;
      observation.pageErrors = participant.errors;
      observation.financialRequestFailures = participant.financialFailures;
      // Read after stopping the timer so recording diagnostics does not inflate the SLO.
      observation.observedFinancialValues = await observedFinancialValues(participant.page).catch(() => null);
      const fields = ['netWorthARS', 'netWorthUSD', 'incomeARS', 'spentARS', 'balanceARS'];
      observation.financialMismatches = fields.filter(field => {
        const actual = observation.observedFinancialValues?.[field], expected = participant.oracle[field];
        return actual === null || actual === undefined || Math.abs(actual - expected) > Math.max(0.001, Math.abs(expected) * 1e-10);
      }).map(field => ({ field, expected: participant.oracle[field], observed: observation.observedFinancialValues?.[field] ?? null }));
      return observation;
    }));
    report.profiles.warm.observations.push(...observations);
    await save();
  }
  const warm = report.profiles.warm;
  warm.summary = summary(warm.observations);
  warm.measurementBoundary = 'Immediately before page.goto through rendered non-hidden own net worth, month income/expense/balance, all ten account links and five recent descriptions matching independent full SQL. Login, post-measurement screenshots and SQL integrity checks excluded.';
  warm.localThreshold = { required: 'p95 < 2000 ms AND zero failed observations AND successful warmup', met: warm.summary.count === 100 && warm.summary.failures === 0 && warm.warmupFailures === 0 && warm.summary.p95Ms < 2000 };
  warm.status = warm.localThreshold.met ? 'PASS' : 'FAIL';
  async function measureProfileWave(profile, wave) {
    const observations = await Promise.all(participants.map(async participant => {
      participant.errors = 0; participant.financialFailures = 0;
      const observation = { index: (wave - 1) * 20 + participant.index, wave, context: participant.index, user: participant.oracle.user, startedAt: new Date().toISOString(), status: 'RUNNING' };
      const start = performance.now();
      try {
        const response = await participant.page.goto(new URL('/dashboard', appUrl).href, { waitUntil: 'domcontentloaded', timeout: 30_000 });
        observation.httpStatus = response?.status(); assert.equal(observation.httpStatus, 200);
        await completeDashboard(participant); observation.status = 'PASS';
      } catch (error) { observation.status = 'FAIL'; observation.failure = ['AssertionError', 'TimeoutError'].includes(error.name) ? error.name : 'BrowserOrOracleError'; }
      observation.durationMs = performance.now() - start;
      observation.pageErrors = participant.errors; observation.financialRequestFailures = participant.financialFailures;
      observation.observedFinancialValues = await observedFinancialValues(participant.page).catch(() => null);
      return observation;
    }));
    report.profiles[profile].observations.push(...observations); await save();
  }
  if (controller) {
    activeProfile = 'coldStart';
    const cold = report.profiles.coldStart;
    Object.assign(cold, { status: 'RUNNING', reason: undefined, scheduledObservations: 100, concurrentContexts: 20, processEvents: [], scope: controller.scope, sessionScope: 'The same 20 normally authenticated browser contexts retain sessions across five owned Next process restarts; no login occurs in the measured boundary.' });
    for (let wave = 1; wave <= 5; wave++) {
      cold.processEvents.push(await controller.start('normal'));
      await measureProfileWave('coldStart', wave);
    }
    cold.summary = summary(cold.observations); cold.status = cold.summary.failures === 0 && cold.summary.p95Ms < 2000 ? 'PASS' : 'FAIL';
    activeProfile = 'providerOutage';
    const outage = report.profiles.providerOutage;
    Object.assign(outage, { status: 'RUNNING', reason: undefined, scheduledObservations: 100, concurrentContexts: 20, processEvents: [], protectedApiProbes: [], scope: 'Fresh owned application process per wave, persisted SQL FX valid, upstream quote-provider HTTP503 doubles. Authenticated /api/cotizaciones probes actually invoke upstream routes; their timing is separate from dashboard navigation.' });
    for (let wave = 1; wave <= 5; wave++) {
      outage.processEvents.push(await controller.start('outage'));
      const before = controller.counters().outage503;
      const probeStarted = performance.now();
      const probe = await participants[0].page.request.get(new URL('/api/cotizaciones', appUrl).href, { timeout: 15_000 });
      const probeDuration = performance.now() - probeStarted;
      const responseBody = await probe.text();
      // Promise.all may reject on crypto before the dollar fallback completes.
      // Allow the other real requests to reach the explicit HTTP503 fixture.
      for (let n = 0; n < 20 && controller.counters().outage503 <= before; n++) await new Promise(resolve => setTimeout(resolve, 50));
      const observed503 = controller.counters().outage503 - before;
      outage.protectedApiProbes.push({ wave, path: '/api/cotizaciones', status: probe.status(), durationMs: probeDuration, responseSha256: sha(responseBody), observedUpstream503: observed503, normalBrowserSession: true, expected: '500 explicitly reports unavailable fresh crypto; dollar SQL reference remains available to financial dashboard' });
      assert.equal(probe.status(), 500); assert.ok(observed503 > 0, 'No actual upstream HTTP503 observed; do not claim provider outage fallback');
      await measureProfileWave('providerOutage', wave);
    }
    outage.summary = summary(outage.observations); outage.status = outage.summary.failures === 0 && outage.summary.p95Ms < 2000 ? 'PASS' : 'FAIL';
    outage.providerCounters = controller.counters(); outage.providerRequests = controller.requests;
    assert.ok(outage.providerRequests.some(request => request.mode === 'outage' && request.path === '/cripto/dolar' && request.status === 503));
    assert.ok(outage.providerRequests.some(request => request.mode === 'outage' && request.path === '/dolarapi/dolares' && request.status === 503));
    report.blockers = ['Deployment-equivalent hardware, topology and device profile not established by this isolated local run'];
  }
  report.fixture.integrity = [];
  for (const oracle of oracles) {
    const id = literal(oracle.id);
    const accounts = rows(`SELECT id,name,type,currency,balance,is_active,is_debt,is_multicurrency,include_in_total FROM accounts WHERE user_id=${id} ORDER BY id`);
    const transactions = rows(`SELECT id,account_id,type,amount,currency,amount_in_account_currency,transaction_date,description FROM transactions WHERE user_id=${id} ORDER BY transaction_date DESC,id DESC`);
    const positions = rows(`SELECT id,account_id,name,quantity,purchase_price,purchase_currency,current_price,current_price_updated_at,market_currency,is_active,is_manual_price FROM investments WHERE user_id=${id} ORDER BY id`);
    const fingerprint = sha(JSON.stringify({ accounts, transactions, positions }));
    report.fixture.integrity.push({ user: oracle.user, beforeSha256: oracle.fingerprint, afterSha256: fingerprint, status: fingerprint === oracle.fingerprint ? 'PASS' : 'FAIL' });
  }
  report.fixture.integrityScope = 'Accounts, monetary transaction fields and investment positions unchanged. Normal dashboard may write derived net-worth snapshots; Auth session state is expected to change during ordinary login.';
  report.sourceStable = (await Promise.all(report.sourceManifest.map(async source => sha(await fs.readFile(source.path)) === source.sha256))).every(Boolean);
  const representative = warm.observations.find(observation => observation.status === 'PASS') || warm.observations[0];
  if (representative) {
    const page = participants[representative.context - 1].page;
    if (new URL(page.url()).pathname === '/dashboard') {
      const file = 'warm-dashboard.png';
      await page.screenshot({ path: path.join(output, file), fullPage: true });
      report.screenshots.push({ path: file, sha256: sha(await fs.readFile(path.join(output, file))), context: representative.context, afterWave: 5, scope: 'Post-measurement dashboard state; not a trace of an earlier observation' });
    }
  }
  report.status = Object.values(report.profiles).some(profile => profile.status === 'FAIL') || report.fixture.integrity.some(item => item.status === 'FAIL') || !report.sourceStable ? 'FAIL' : 'PARTIAL';
  report.cnf01Acceptance = controller ? 'BLOCKED: three explicit local profiles cannot establish deployment-equivalent hardware/topology/device; upstream outage uses declared provider doubles' : 'BLOCKED: local warm profile alone cannot establish deployment equivalence or separate cold-start/provider-outage evidence';
  if (report.status === 'FAIL') process.exitCode = 1;
} catch (error) {
  report.status = error.blocked ? 'BLOCKED' : 'FAIL';
  report.failure = error.blocked ? error.message : 'Setup or assertion failed; raw error omitted because it may include credentials/session data';
  report.failureProfile = activeProfile;
  report.profiles[activeProfile].status = report.status;
  report.profiles[activeProfile].summary = summary(report.profiles[activeProfile].observations);
  process.exitCode = error.blocked ? 2 : 1;
} finally {
  if (browser) await browser.close();
  if (controller) await controller.close();
  await save();
  console.log(JSON.stringify({ report: path.join(output, 'browser-load.json'), status: report.status, warm: report.profiles.warm.summary || null, coldStart: report.profiles.coldStart.status, providerOutage: report.profiles.providerOutage.status, failure: report.failure || null }, null, 2));
}
