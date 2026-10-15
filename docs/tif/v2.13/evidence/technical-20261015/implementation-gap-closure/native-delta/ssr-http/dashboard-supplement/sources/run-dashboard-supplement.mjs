// CP3-17 composition supplement only. No browser; Auth/HTML/cookies remain RAM.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createServerClient } from '@supabase/ssr';
import { parseFlight } from '../../account-analysis-contracts/ssr-financial-read.mjs';
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const root = process.env.ZARIX_DELTA_PRIVATE;
const sessions = [];
const report = { status: 'RUNNING', startedAt: new Date().toISOString(), checks: [], requests: [],
  scope: 'CP3-17 supplement to SSR38: actual Next730 cookie API saves and Dashboard SSR for both owners. No browser, hydration or integration-provider claim.' };
let output, query;
function check(name, actual, expected) { report.checks.push({ name, passed: JSON.stringify(actual) === JSON.stringify(expected) }); assert.deepEqual(actual, expected, name); }
function props(html, copy, component) {
  const file = path.join(copy, '.next/server/app/(authenticated)/dashboard/page_client-reference-manifest.js');
  const bytes = fs.readFileSync(file), text = bytes.toString(), marker = 'globalThis.__RSC_MANIFEST["/(authenticated)/dashboard/page"]=';
  const at = text.indexOf(marker); assert.ok(at >= 0);
  const manifest = JSON.parse(text.slice(at + marker.length).trim().replace(/;$/, ''));
  const entries = Object.entries(manifest.clientModules).filter(([key]) => key.endsWith('/' + component)); assert.equal(entries.length, 1);
  const moduleId = entries[0][1].id, flight = parseFlight(html);
  const refs = new Set([...flight.imports].filter(([, value]) => String(value[0]) === String(moduleId)).map(([id]) => '$L' + id));
  const found = [];
  function visit(value, seen = new Set()) {
    if (typeof value === 'string' && /^\$[\da-f]+$/i.test(value)) { const id = value.slice(1); if (!seen.has(id) && flight.rows.has(id)) visit(flight.rows.get(id), new Set([...seen, id])); }
    else if (Array.isArray(value)) { if (value[0] === '$' && refs.has(value[1]) && value[3]) found.push({ key: value[2], props: value[3] }); for (const item of value) visit(item, seen); }
    else if (value && typeof value === 'object') for (const item of Object.values(value)) visit(item, seen);
  }
  for (const value of flight.rows.values()) visit(value);
  return { entries: [...new Map(found.map(item => [JSON.stringify(item), item])).values()],
    binding: { component, moduleId, manifestSha256: digest(bytes) } };
}
try {
  assert.equal(process.env.ZARIX_DELTA_SSR_WINDOW, 'parent-released-real-next-ssr');
  assert.match(root ?? '', /^\/tmp\/zarix-runtime-20261015\/implementation-delta-[0-9a-f-]{36}$/);
  process.umask(0o077);
  const meta = JSON.parse(fs.readFileSync(path.join(root, 'targets.metadata.json'), 'utf8'));
  const proof = JSON.parse(fs.readFileSync(path.join(root, 'app-build.private.json'), 'utf8'));
  const state = JSON.parse(fs.readFileSync(path.join(root, 'app-state.private.json'), 'utf8'));
  assert.equal(proof.revision, '730767b1723502b495d371e69c44df31eb230b56'); assert.equal(proof.sourceStable, true);
  assert.ok(proof.sources.every(source => digest(fs.readFileSync(path.join(proof.copyRoot, source.path))) === source.sha256));
  output = path.join(root, 'dashboard-supplement.sanitized.json'); assert.equal(fs.existsSync(output), false);
  const values = Object.fromEntries(fs.readFileSync(meta.existingEnvironmentFile, 'utf8').split('\n').filter(line => line && !line.startsWith('#')).map(line => { const at = line.indexOf('='); return [line.slice(0, at), JSON.parse(line.slice(at + 1))]; }));
  const userRows = JSON.parse(fs.readFileSync(meta.loginFile, 'utf8')).users, database = new URL(values.ZARIX_PROOF_DATABASE_URL);
  const env = { ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('PG'))),
    PGHOST: '127.0.0.1', PGHOSTADDR: '127.0.0.1', PGPORT: '58322', PGDATABASE: meta.newDatabaseName,
    PGUSER: 'supabase_admin', PGPASSWORD: decodeURIComponent(database.password), PGOPTIONS: '-c default_transaction_read_only=on' };
  query = sql => { const child = spawnSync(path.join(meta.pgBin, 'psql'), ['-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-c', sql], { env, encoding: 'utf8' }); assert.equal(child.status, 0); return child.stdout.trim(); };
  const tables = ['accounts', 'transactions', 'investments', 'investment_sales', 'net_worth_snapshots', 'portfolio_performance_snapshots', 'transaction_deletion_audit'];
  const fingerprints = () => Object.fromEntries(tables.map(table => [table, query(`SELECT count(*)||':'||md5(COALESCE(string_agg(j::text,E'\n' ORDER BY j::text),''))FROM(SELECT to_jsonb(t)j FROM public.${table} t)x`)]));
  const before = fingerprints(); check('No existing Auth sessions before supplement', Number(query('SELECT count(*) FROM auth.sessions')), 0);
  report.binding = { revision: proof.revision, buildId: proof.buildId, sourceManifestSha256: proof.sourceManifestSha256 };
  for (const [index, currency, visible] of [[0, 'USD', false], [1, 'ARS', true]]) {
    const label = index ? 'B' : 'A', cookieJar = new Map();
    const client = createServerClient(state.apiOrigin, values.ZARIX_PROOF_ANON_KEY, { auth: { autoRefreshToken: false }, cookies: {
      getAll: () => [...cookieJar].map(([name, value]) => ({ name, value })), setAll: cookies => { for (const cookie of cookies) cookie.options?.maxAge === 0 ? cookieJar.delete(cookie.name) : cookieJar.set(cookie.name, cookie.value); } } });
    const login = await client.auth.signInWithPassword({ email: userRows[index].email, password: userRows[index].password });
    check(label + ' normal Auth login', login.error, null); check(label + ' verified actual owner', login.data.user?.id, userRows[index].id); sessions.push({ label, client });
    const cookie = () => [...cookieJar].map(([name, value]) => name + '=' + value).join('; ');
    const saved = await fetch(state.appOrigin + '/api/user/preferences', { method: 'PUT', headers: { Cookie: cookie(), 'Content-Type': 'application/json', 'X-Preferences-Owner': userRows[index].id }, body: JSON.stringify({ default_currency: currency, net_worth_widget_visible: visible }), redirect: 'manual' });
    check(label + ' own preference HTTP save', saved.status, 200);
    check(label + ' own saved values', await saved.json(), { default_currency: currency, net_worth_widget_visible: visible });
    const response = await fetch(state.appOrigin + '/dashboard', { headers: { Cookie: cookie() }, redirect: 'manual' });
    const html = await response.text(); check(label + ' actual Dashboard HTTP200', response.status, 200);
    check(label + ' Dashboard did not fall back to the safe financial error page', html.includes('No pudimos cargar tus datos financieros'), false);
    const hero = props(html, proof.copyRoot, 'components/dashboard/NetWorthHero.tsx');
    const sticky = props(html, proof.copyRoot, 'components/dashboard/StickyNetWorthBar.tsx');
    check(label + ' own Hero visibility', hero.entries.length, visible ? 1 : 0);
    check(label + ' own Sticky visibility', sticky.entries.length, visible ? 1 : 0);
    check(label + ' actual HTML Hero visibility', /<h2\b[^>]*>Patrimonio total<\/h2>/.test(html), visible);
    check(label + ' actual HTML sentinel visibility', html.includes('id="networth-sentinel"'), visible);
    if (visible) {
      check('B actual Hero base ARS', hero.entries[0].props.baseCurrency, 'ARS');
      check('B own owner-key', hero.entries[0].key, userRows[index].id);
      check('B own total excludes A200USD', hero.entries[0].props.now.totalUSD, 0);
    }
    report.requests.push({ actor: label, status: response.status, responseSha256: digest(html), baseCurrency: currency, visible,
      hero: hero.binding, sticky: sticky.binding, ...(visible ? { actualHeroBaseCurrency: hero.entries[0].props.baseCurrency, actualTotalUSD: hero.entries[0].props.now.totalUSD } : {}) });
  }
  check('Presentation-only supplement preserves seven financial/history inventories', fingerprints(), before);
  report.sourceStable = proof.sources.every(source => digest(fs.readFileSync(path.join(proof.copyRoot, source.path))) === source.sha256);
  check('Frozen Next730 source copy unchanged', report.sourceStable, true);
  report.status = 'PASS';
} catch (error) { report.status = 'FAIL'; report.error = { type: error.name, rawMessagePublished: false }; }
finally {
  const logouts = [];
  for (const session of sessions) { const result = await session.client.auth.signOut({ scope: 'local' }); logouts.push({ actor: session.label, errorIsNull: result.error === null }); }
  report.cleanup = { sdkLocalLogouts: logouts, tokensCookiesOnlyInMemory: true };
  if (query) { report.cleanup.authSessionsRemaining = Number(query('SELECT count(*) FROM auth.sessions')); report.cleanup.authRefreshTokensRemaining = Number(query('SELECT count(*) FROM auth.refresh_tokens')); }
  if (logouts.some(item => !item.errorIsNull) || report.cleanup.authSessionsRemaining !== 0 || report.cleanup.authRefreshTokensRemaining !== 0) report.status = 'FAIL';
  report.finishedAt = new Date().toISOString(); report.passed = report.checks.filter(item => item.passed).length; report.total = report.checks.length;
  if (output) fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  console.log(JSON.stringify({ status: report.status, passed: report.passed, total: report.total, resultPath: output }));
  if (report.status !== 'PASS') process.exitCode = 1;
}
