// Actual frozen Next HTTP/API/SSR. Cookies, Auth responses and HTML stay in memory.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createServerClient } from '@supabase/ssr';
import { parseFlight } from '../../account-analysis-contracts/ssr-financial-read.mjs';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const root = process.env.ZARIX_DELTA_PRIVATE;
const report = { status: 'RUNNING', startedAt: new Date().toISOString(), checks: [], requests: [],
  scope: 'Real Next730 HTTP/cookies/API/SSR and PostgreSQL reads. No browser, hydration, visual layout, email delivery, password change or external provider acceptance.' };
const sessions = [];
let output;
function check(name, actual, expected) { report.checks.push({ name, passed: JSON.stringify(actual) === JSON.stringify(expected) }); assert.deepEqual(actual, expected, name); }
function values(file) { assert.equal(fs.lstatSync(file).isSymbolicLink(), false); assert.equal(fs.statSync(file).mode & 0o077, 0); return Object.fromEntries(fs.readFileSync(file, 'utf8').split('\n').filter(line => line && !line.startsWith('#')).map(line => { const at = line.indexOf('='); return [line.slice(0, at), JSON.parse(line.slice(at + 1))]; })); }
function write(file, object) { fs.writeFileSync(file, JSON.stringify(object, null, 2) + '\n', { mode: 0o600, flag: 'wx' }); }
function componentProps(html, copyRoot, route, component) {
  const file = path.join(copyRoot, `.next/server/app/${route}/page_client-reference-manifest.js`);
  const bytes = fs.readFileSync(file), text = bytes.toString(), marker = `globalThis.__RSC_MANIFEST["/${route}/page"]=`;
  const index = text.indexOf(marker); assert.ok(index >= 0);
  const manifest = JSON.parse(text.slice(index + marker.length).trim().replace(/;$/, ''));
  const candidates = Object.entries(manifest.clientModules).filter(([key]) => key.endsWith('/' + component));
  assert.equal(candidates.length, 1);
  const flight = parseFlight(html), moduleId = candidates[0][1].id;
  const refs = new Set([...flight.imports].filter(([, value]) => String(value[0]) === String(moduleId)).map(([id]) => '$L' + id));
  const found = [];
  function visit(value, seen = new Set()) {
    if (typeof value === 'string' && /^\$[\da-f]+$/i.test(value)) {
      const id = value.slice(1); if (!seen.has(id) && flight.rows.has(id)) visit(flight.rows.get(id), new Set([...seen, id]));
    } else if (Array.isArray(value)) {
      if (value[0] === '$' && refs.has(value[1]) && value[3]) found.push(value[3]);
      for (const child of value) visit(child, seen);
    } else if (value && typeof value === 'object') for (const child of Object.values(value)) visit(child, seen);
  }
  for (const value of flight.rows.values()) visit(value);
  const unique = [...new Map(found.map(value => [JSON.stringify(value), value])).values()];
  return { props: unique, binding: { component, manifestSha256: sha(bytes), moduleId } };
}
async function main() {
  assert.equal(process.env.ZARIX_DELTA_SSR_WINDOW, 'parent-released-real-next-ssr');
  assert.match(root ?? '', /^\/tmp\/zarix-runtime-20261015\/implementation-delta-[0-9a-f-]{36}$/);
  process.umask(0o077);
  const meta = JSON.parse(fs.readFileSync(path.join(root, 'targets.metadata.json'), 'utf8'));
  const proof = JSON.parse(fs.readFileSync(path.join(root, 'app-build.private.json'), 'utf8'));
  const state = JSON.parse(fs.readFileSync(path.join(root, 'app-state.private.json'), 'utf8'));
  const native = JSON.parse(fs.readFileSync(path.join(root, 'native-cases-result.private.json'), 'utf8'));
  assert.equal(native.status, 'PASS'); assert.equal(native.cleanup.authSessionsClosed, true);
  assert.equal(proof.revision, '730767b1723502b495d371e69c44df31eb230b56');
  assert.equal(proof.sourceStable, true); assert.equal(proof.exitCode, 0);
  assert.equal(state.revision, proof.revision); assert.equal(state.buildId, proof.buildId);
  assert.equal(fs.readFileSync(path.join(proof.copyRoot, '.next/BUILD_ID'), 'utf8').trim(), proof.buildId);
  assert.ok(proof.sources.every(source => sha(fs.readFileSync(path.join(proof.copyRoot, source.path))) === source.sha256));
  output = path.join(root, 'ssr-http-result.sanitized.json'); assert.equal(fs.existsSync(output), false);
  const publicEnv = values(meta.existingEnvironmentFile), database = new URL(publicEnv.ZARIX_PROOF_DATABASE_URL);
  const credentials = JSON.parse(fs.readFileSync(meta.loginFile, 'utf8')).users;
  assert.equal(credentials.length, 2);
  const env = { ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('PG'))),
    PGHOST: '127.0.0.1', PGHOSTADDR: '127.0.0.1', PGPORT: '58322', PGDATABASE: meta.newDatabaseName,
    PGUSER: 'supabase_admin', PGPASSWORD: decodeURIComponent(database.password), PGOPTIONS: '-c default_transaction_read_only=on', PGCONNECT_TIMEOUT: '10' };
  function query(sql) { const child = spawnSync(path.join(meta.pgBin, 'psql'), ['-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-c', sql], { env, encoding: 'utf8' }); assert.equal(child.status, 0, 'Readonly SQL succeeded; raw diagnostics withheld'); return child.stdout.trim(); }
  const tables = ['accounts', 'transactions', 'investments', 'investment_sales', 'net_worth_snapshots', 'portfolio_performance_snapshots', 'transaction_deletion_audit'];
  const fingerprint = () => Object.fromEntries(tables.map(table => [table, query(`SELECT count(*)||':'||md5(COALESCE(string_agg(j::text,E'\n' ORDER BY j::text),'')) FROM(SELECT to_jsonb(t)j FROM public.${table} t)x`)]));
  const before = fingerprint();
  report.binding = { revision: proof.revision, sqlApplicationBaseline: meta.revision, buildId: proof.buildId, copyRoot: proof.copyRoot,
    physicalSourceCount: proof.sourceCount, sourceManifestSha256: proof.sourceManifestSha256, appOrigin: state.appOrigin,
    apiOrigin: state.apiOrigin, newDatabaseName: meta.newDatabaseName, browserAssetExactValueScan: proof.browserAssetExactValueScan };
  check('Fresh cloned Auth sessions after NativeCases', Number(query('SELECT count(*) FROM auth.sessions')), 0);
  async function signIn(index, label) {
    const cookieJar = new Map();
    const client = createServerClient(state.apiOrigin, publicEnv.ZARIX_PROOF_ANON_KEY, { auth: { autoRefreshToken: false },
      cookies: { getAll: () => [...cookieJar].map(([name, value]) => ({ name, value })), setAll: list => { for (const cookie of list) cookie.options?.maxAge === 0 ? cookieJar.delete(cookie.name) : cookieJar.set(cookie.name, cookie.value); } } });
    const result = await client.auth.signInWithPassword({ email: credentials[index].email, password: credentials[index].password });
    check(label + ' normal GoTrue login', result.error, null); check(label + ' normal identity', result.data.user?.id, credentials[index].id);
    const item = { client, cookieJar, label, userId: credentials[index].id }; sessions.push(item); return item;
  }
  async function request(session, pathname, method = 'GET', body, headers = {}) {
    const response = await fetch(state.appOrigin + pathname, { method, headers: { ...(session ? { Cookie: [...session.cookieJar].map(([key, value]) => key + '=' + value).join('; ') } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined, redirect: 'manual' });
    const text = await response.text();
    report.requests.push({ actor: session?.label ?? 'anonymous', path: pathname.split('?')[0], method, status: response.status, bodySha256: sha(text) });
    return { status: response.status, text, headers: response.headers };
  }
  const a = await signIn(0, 'A-first'), b = await signIn(1, 'B');
  const pref = async session => { const result = await request(session, '/api/user/preferences'); check(session.label + ' preferences HTTP200', result.status, 200); return JSON.parse(result.text); };
  async function setPref(session, currency, visible, owner = session.userId) {
    return request(session, '/api/user/preferences', 'PUT', { default_currency: currency, net_worth_widget_visible: visible }, { 'X-Preferences-Owner': owner });
  }
  check('A USD visible save through actual Next cookie API', (await setPref(a, 'USD', true)).status, 200);
  const visible = await request(a, '/dashboard'); check('Actual A visible dashboard HTTP200', visible.status, 200);
  const hero = componentProps(visible.text, proof.copyRoot, '(authenticated)/dashboard', 'components/dashboard/NetWorthHero.tsx');
  check('One actual compiled Hero payload', hero.props.length, 1);
  check('Actual SSR USD base', hero.props[0].baseCurrency, 'USD');
  check('Actual SSR USD200 from ARS120000 and USD100 at1200', hero.props[0].now.totalUSD, 200);
  check('Actual SSR ARS240000', hero.props[0].now.totalARSBlue, 240000);
  report.visibleHero = { binding: hero.binding, baseCurrency: hero.props[0].baseCurrency, totalUSD: hero.props[0].now.totalUSD, totalARSBlue: hero.props[0].now.totalARSBlue };
  check('A hides widget through actual cookie API', (await setPref(a, 'USD', false)).status, 200);
  check('Old owner header is denied by actual Next API', (await setPref(a, 'ARS', true, b.userId)).status, 403);
  const closed = await a.client.auth.signOut({ scope: 'local' }); check('First A session local logout', closed.error, null); a.closed = true;
  const anew = await signIn(0, 'A-new');
  check('New A session retains USD and hidden widget', await pref(anew), { default_currency: 'USD', net_worth_widget_visible: false });
  check('B settings remain own ARS visible', await pref(b), { default_currency: 'ARS', net_worth_widget_visible: true });
  const hidden = await request(anew, '/dashboard'); check('Actual hidden dashboard HTTP200', hidden.status, 200);
  check('Hidden dashboard has no Hero Flight payload', componentProps(hidden.text, proof.copyRoot, '(authenticated)/dashboard', 'components/dashboard/NetWorthHero.tsx').props.length, 0);
  check('Hidden dashboard has no Sticky Flight payload', componentProps(hidden.text, proof.copyRoot, '(authenticated)/dashboard', 'components/dashboard/StickyNetWorthBar.tsx').props.length, 0);
  check('Hidden dashboard removes own hero sentinel', hidden.text.includes('id="networth-sentinel"'), false);
  for (const [session, currency, visibleFlag] of [[anew, 'USD', false], [b, 'ARS', true]]) {
    const settings = await request(session, '/settings'); check(session.label + ' actual Settings SSR200', settings.status, 200);
    const settingsProps = componentProps(settings.text, proof.copyRoot, '(authenticated)/settings', 'components/settings/SettingsForm.tsx');
    check(session.label + ' one bound SettingsForm', settingsProps.props.length, 1);
    const user = settingsProps.props[0].user;
    check(session.label + ' actual Settings owner', user.id, session.userId);
    check(session.label + ' actual Settings stored preference', { default_currency: user.default_currency, net_worth_widget_visible: user.net_worth_widget_visible }, { default_currency: currency, net_worth_widget_visible: visibleFlag });
    (report.settings ||= []).push({ actor: session.label, binding: settingsProps.binding, defaultCurrency: user.default_currency, netWorthVisible: user.net_worth_widget_visible, ownerMatchesSession: true });
  }
  const forgot = await request(null, '/auth/forgot-password'); check('Forgot password actual HTTP200 email form', forgot.status === 200 && /id="recovery-email"/.test(forgot.text), true);
  const unauthed = await request(null, '/auth/update-password'); check('Update without session has safe message and no password form', unauthed.status === 200 && /El enlace no es válido o venció/.test(unauthed.text) && !/id="recovery-password"/.test(unauthed.text), true);
  const authed = await request(anew, '/auth/update-password'); check('Update with normal session actual password form', authed.status === 200 && /id="recovery-password"/.test(authed.text), true);
  const recovery = componentProps(authed.text, proof.copyRoot, 'auth/update-password', 'components/auth/PasswordRecoveryForm.tsx');
  check('Update form is bound to actual current UID', recovery.props[0]?.expectedUserId, anew.userId);
  const invalidCode = 'zarix-invalid-recovery-fixture';
  const callback = await request(null, '/auth/callback?code=' + invalidCode + '&next=%2Fauth%2Fupdate-password');
  check('Invalid recovery callback redirects safely without reflection', [302, 303, 307, 308].includes(callback.status) && callback.headers.get('location') === state.appOrigin + '/auth/forgot-password?invalid_link=1' && !callback.headers.get('location').includes(invalidCode), true);
  check('Presentation and SSR preserve all seven financial/history inventories', fingerprint(), before);
  report.financialHistoryIntegrity = { tablesCompared: tables.length, unchanged: true };
  report.frozenCopyStable = proof.sources.every(source => sha(fs.readFileSync(path.join(proof.copyRoot, source.path))) === source.sha256);
  report.status = 'PASS';
}
try { await main(); }
catch (error) { report.status = 'FAIL'; report.error = { type: error.name, rawMessagePublished: false }; }
finally {
  const closed = [];
  for (const session of sessions) if (!session.closed) { const result = await session.client.auth.signOut({ scope: 'local' }); closed.push({ actor: session.label, errorIsNull: result.error === null }); }
  report.cleanup = { ownedSessionLogoutResults: closed, tokensCookiesOnlyInMemory: true, credentialFilesCreated: 0 };
  if (closed.some(item => !item.errorIsNull)) report.status = 'FAIL';
  report.finishedAt = new Date().toISOString(); report.passed = report.checks.filter(item => item.passed).length; report.total = report.checks.length;
  if (output) write(output, report);
  console.log(JSON.stringify({ status: report.status, passed: report.passed, total: report.total, resultPath: output, rawResponsePersisted: false }));
  if (report.status !== 'PASS') process.exitCode = 1;
}
