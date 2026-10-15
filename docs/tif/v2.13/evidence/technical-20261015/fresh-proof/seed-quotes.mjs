// Normal Auth -> real Next API -> synthetic local provider -> auxiliary FX persistence.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createServerClient } from '@supabase/ssr';
import dotenv from 'dotenv';
assert.equal(process.env.ZARIX_PROOF_QUOTES_WINDOW, 'isolated-provider-fixture');
const base = '/tmp/zarix-runtime-20261015';
const output = `${base}/proof-live-synthetic-quote-read.json`;
assert.equal(await fs.access(output).then(() => true, () => false), false);
const config = dotenv.parse(await fs.readFile(`${base}/proof.env`));
assert.equal(config.ZARIX_PROOF_SUPABASE_URL, 'http://127.0.0.1:58321');
const state = JSON.parse(await fs.readFile(`${base}/proof-app-state.json`, 'utf8'));
assert.equal(state.purpose, 'account-analysis-proof');
assert.equal(state.appOrigin, 'http://127.0.0.1:3002');
assert.equal(state.apiOrigin, config.ZARIX_PROOF_SUPABASE_URL);
const providerBefore = JSON.parse(await fs.readFile(`${base}/proof-quote-server-state.json`, 'utf8'));
assert.equal(providerBefore.purpose, 'synthetic-proof-quotes');
assert.equal(providerBefore.origin, 'http://127.0.0.1:57910');
const mode = JSON.parse(await fs.readFile(`${base}/proof-quote-mode.json`, 'utf8'));
assert.equal(mode.mode, 'offline503');
await fs.writeFile(`${base}/proof-quote-mode.next.json`, JSON.stringify({ mode: 'fx1200', sourceTimestamp: null }) + '\n', { mode: 0o600, flag: 'wx' });
await fs.rename(`${base}/proof-quote-mode.next.json`, `${base}/proof-quote-mode.json`);
const logins = JSON.parse(await fs.readFile(`${base}/proof-logins.json`, 'utf8'));
assert.equal(logins.purpose, 'fifth-isolated-acceptance-replica');
const jar = new Map();
const client = createServerClient(config.ZARIX_PROOF_SUPABASE_URL, config.ZARIX_PROOF_ANON_KEY, {
  cookies: { getAll: () => [...jar].map(([name, value]) => ({ name, value })), setAll: items => items.forEach(({ name, value }) => jar.set(name, value)) },
  global: { fetch: (input, init) => fetch(input, { ...init, redirect: 'error' }) },
});
const report = { startedAt: new Date().toISOString(), scope: 'Synthetic configured-provider strategy only. Normal local password Auth and actual Next cotizaciones API; no real market-provider, browser or financial acceptance claim.', buildId: state.buildId, appOrigin: state.appOrigin, apiOrigin: state.apiOrigin, providerOrigin: providerBefore.origin, providerPid: providerBefore.pid, status: 'RUNNING' };
try {
  const login = await client.auth.signInWithPassword({ email: logins.users[0].email, password: logins.users[0].password });
  assert.equal(login.error, null);
  assert.equal((await client.auth.getUser()).data.user?.id, logins.users[0].id);
  const response = await fetch(`${state.appOrigin}/api/cotizaciones`, { headers: { Cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; ') }, redirect: 'error', signal: AbortSignal.timeout(15000) });
  const raw = await response.text();
  report.httpStatus = response.status;
  report.responseSha256 = createHash('sha256').update(raw).digest('hex');
  assert.equal(response.status, 200);
  const body = JSON.parse(raw);
  assert.equal(body.dolar.blue.sell, 1200);
  assert.equal(body.crypto.btc.priceUSD, 60000);
  assert.equal(body.crypto.eth.priceUSD, 2500);
  assert.equal(body.crypto.usdt.priceUSD, 1);
  report.selected = { blue: body.dolar.blue, cryptoUSD: { btc: body.crypto.btc.priceUSD, eth: body.crypto.eth.priceUSD, usdt: body.crypto.usdt.priceUSD } };
  report.normalAuth = true;
  report.providerAfter = JSON.parse(await fs.readFile(`${base}/proof-quote-server-state.json`, 'utf8'));
  report.status = 'PASS';
} catch (error) {
  report.status = 'FAIL';
  report.failure = { type: error.name, location: error.stack?.match(/seed-quotes\.mjs:(\d+):\d+/)?.[1] || null };
} finally {
  const logout = await client.auth.signOut({ scope: 'local' });
  report.localSignOut = !logout.error;
  report.finishedAt = new Date().toISOString();
  await fs.writeFile(output, JSON.stringify(report, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
  console.log(JSON.stringify({ status: report.status, httpStatus: report.httpStatus, output }));
  if (report.status !== 'PASS') process.exitCode = 1;
}
