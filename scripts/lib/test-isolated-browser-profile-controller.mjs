// Test-only owned Next process and explicit local quote-provider double.
// Never stops another process, changes PostgreSQL, or contacts real providers.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import net from 'node:net';
import { spawn, spawnSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { createHash } from 'node:crypto';
import dotenv from 'dotenv';

export async function createProfileController({ appUrl, output, fx, env = process.env }) {
  if (!env.ZARIX_LOAD_MANAGED_APP || !env.ZARIX_LOAD_APP_ENV) return null;
  const appDirectory = await fs.realpath(env.ZARIX_LOAD_MANAGED_APP);
  assert.ok(appDirectory.startsWith('/private/tmp/zarix-app-load') || appDirectory.startsWith('/tmp/zarix-app-load'), 'Only a separately copied temporary load application may be managed');
  assert.equal(appUrl.hostname, '127.0.0.1'); assert.equal(appUrl.port, '3101', 'Managed profiles use their own port, not the root E2E or external load server');
  assert.equal((await fs.stat(env.ZARIX_LOAD_APP_ENV)).mode & 0o077, 0, 'Managed application environment must remain private');
  const supplied = dotenv.parse(await fs.readFile(env.ZARIX_LOAD_APP_ENV, 'utf8'));
  assert.ok(!supplied.GEMINI_API_KEY && !supplied.TELEGRAM_BOT_TOKEN && !supplied.MP_ACCESS_TOKEN, 'No paid/messaging/payment provider credentials may enter the local double profile');
  const target = new URL(supplied.NEXT_PUBLIC_SUPABASE_URL || supplied.ZARIX_LOAD_SUPABASE_URL || '');
  assert.equal(target.origin, 'http://127.0.0.1:56321', 'Managed app must point exclusively to the load replica');
  const nextCli = path.join(appDirectory, 'node_modules/next/dist/bin/next');
  await fs.access(nextCli); await fs.access(path.join(appDirectory, '.next/BUILD_ID'));
  assert.ok(env.ZARIX_LOAD_FROZEN_MANIFEST, 'A root frozen source manifest is required');
  const copiedManifestBytes = await fs.readFile(path.join(appDirectory, 'copy-source-manifest.json'));
  const copiedManifest = JSON.parse(copiedManifestBytes);
  const frozenManifest = JSON.parse(await fs.readFile(env.ZARIX_LOAD_FROZEN_MANIFEST, 'utf8'));
  assert.deepEqual(copiedManifest.sources, frozenManifest.sources, 'Physical copy and root frozen source manifest differ');
  assert.equal(copiedManifest.revision, frozenManifest.revision, 'Physical copy and root revision differ');
  assert.ok(copiedManifest.sources?.length, 'An empty physical source manifest is not evidence');
  const hash = value => createHash('sha256').update(value).digest('hex');
  for (const source of copiedManifest.sources) {
    assert.ok(!path.isAbsolute(source.path) && !source.path.split('/').includes('..'), 'Source paths must remain inside the copied application');
    assert.equal(hash(await fs.readFile(path.join(appDirectory, source.path))), source.sha256, 'Copied source file differs from frozen manifest');
  }
  const buildId = (await fs.readFile(path.join(appDirectory, '.next/BUILD_ID'), 'utf8')).trim();
  if (copiedManifest.buildId) assert.equal(buildId, copiedManifest.buildId);
  const buildEvidence = { buildId, copiedManifestSha256: hash(copiedManifestBytes), revision: copiedManifest.revision, sourceCount: copiedManifest.sources.length, frozenManifestEqual: true };
  const providerPort = 3311;
  const sell = Object.fromEntries(fx.map(quote => [quote.source, Number(quote.rate)]));
  const sourceTime = fx.find(quote => quote.source === 'blue').timestamp;
  const timestamp = Math.floor(Date.parse(sourceTime) / 1000);
  let mode = 'normal', child = null, processIndex = 0;
  const events = [], requests = [];
  const server = http.createServer((request, response) => {
    const requestPath = new URL(request.url, `http://127.0.0.1:${providerPort}`).pathname;
    const pathname = requestPath.replace(/^\/(normal|outage)(?=\/)/, '');
    const known = ['/cripto/dolar', '/dolarapi/dolares', '/coingecko/simple/price'].includes(pathname);
    const status = known ? (mode === 'outage' ? 503 : 200) : 404;
    requests.push({ at: new Date().toISOString(), mode, path: pathname, requestPath, status });
    response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    if (status !== 200) return response.end(JSON.stringify({ error: status === 503 ? 'SYNTHETIC_PROVIDER_OUTAGE' : 'UNKNOWN_TEST_ROUTE' }));
    if (pathname === '/cripto/dolar') return response.end(JSON.stringify({ blue: { bid: sell.blue - 10, ask: sell.blue, timestamp }, oficial: { bid: sell.oficial - 10, ask: sell.oficial, timestamp }, mep: { al30: { '24hs': { price: sell.mep, timestamp } } }, ccl: { al30: { '24hs': { price: sell.ccl, timestamp } } } }));
    if (pathname === '/dolarapi/dolares') return response.end(JSON.stringify(['blue', 'oficial', 'mep', 'ccl'].map((source, index) => ({ casa: ['blue', 'oficial', 'bolsa', 'contadoconliqui'][index], compra: sell[source] - 10, venta: sell[source], fechaActualizacion: sourceTime }))));
    return response.end(JSON.stringify({ bitcoin: { usd: 60000, ars: 60000 * sell.blue, usd_24h_change: 0, last_updated_at: timestamp }, ethereum: { usd: 2500, ars: 2500 * sell.blue, usd_24h_change: 0, last_updated_at: timestamp }, tether: { usd: 1, ars: sell.blue, usd_24h_change: 0, last_updated_at: timestamp } }));
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(providerPort, '127.0.0.1', resolve); });
  async function stop() {
    if (!child) return;
    const current = child; child = null;
    if (current.exitCode !== null) return;
    const exited = new Promise(resolve => current.once('exit', resolve));
    current.kill('SIGTERM');
    const timer = setTimeout(() => { if (current.exitCode === null) current.kill('SIGKILL'); }, 5000);
    await exited; clearTimeout(timer);
    events.push({ at: new Date().toISOString(), type: 'owned-process-stopped', pid: current.pid });
  }
  async function start(profileMode) {
    await stop(); mode = profileMode;
    const probe = net.createServer();
    await new Promise((resolve, reject) => { probe.once('error', () => reject(new Error('Owned application port is already occupied'))); probe.listen(Number(appUrl.port), '127.0.0.1', resolve); });
    await new Promise(resolve => probe.close(resolve));
    const startedAt = new Date().toISOString(), beginning = performance.now();
    const systemEnv = Object.fromEntries(['PATH', 'TMPDIR', 'LANG', 'DEVELOPER_DIR'].filter(key => env[key]).map(key => [key, env[key]]));
    const appEnv = { ...systemEnv, ...supplied, NODE_ENV: 'production', TZ: 'Etc/UTC',
      NEXT_PUBLIC_SUPABASE_URL: target.href.replace(/\/$/, ''),
      NEXT_PUBLIC_SUPABASE_ANON_KEY: supplied.NEXT_PUBLIC_SUPABASE_ANON_KEY || supplied.ZARIX_LOAD_ANON_KEY,
      SUPABASE_SERVICE_ROLE_KEY: supplied.SUPABASE_SERVICE_ROLE_KEY || supplied.ZARIX_LOAD_SERVICE_ROLE_KEY,
      ZARIX_ISOLATED_TEST_BUILD: '1',
      // A distinct declared outage endpoint prevents a persisted successful
      // Next fetch response from hiding the injected HTTP503 condition.
      CRIPTOYA_API_URL: `http://127.0.0.1:${providerPort}/${profileMode}/cripto`, DOLARAPI_URL: `http://127.0.0.1:${providerPort}/${profileMode}/dolarapi`, COINGECKO_API_URL: `http://127.0.0.1:${providerPort}/${profileMode}/coingecko`,
      MARKET_DATA_TIMEOUT_MS: '1000' };
    child = spawn(process.execPath, [nextCli, 'start', '--hostname', '127.0.0.1', '--port', appUrl.port], { cwd: appDirectory, env: appEnv, stdio: 'ignore' });
    let launchError = null; child.once('error', () => { launchError = true; });
    for (;;) {
      if (launchError || child.exitCode !== null) throw new Error('Owned Next process failed before readiness');
      try {
        const health = await fetch(new URL('/api/health', appUrl), { redirect: 'error', signal: AbortSignal.timeout(1500) });
        if (health.status === 200) {
          const listener = spawnSync('/usr/sbin/lsof', ['-nP', '-a', '-p', String(child.pid), `-iTCP:${appUrl.port}`, '-sTCP:LISTEN', '-Fpcn'], { encoding: 'utf8' });
          assert.equal(listener.status, 0, 'New owned Next PID is not the listener for the measured application');
          assert.ok(listener.stdout.split('\n').includes(`p${child.pid}`) && listener.stdout.includes(`:${appUrl.port}`), 'Health response cannot be attributed to the owned process');
          break;
        }
      } catch { /* process has not bound the loopback port yet */ }
      if (performance.now() - beginning > 45_000) throw new Error('Owned Next process readiness timeout');
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    const event = { at: startedAt, type: 'owned-process-ready', processIndex: ++processIndex, profileMode, pid: child.pid, listenerOwnedByPid: true, portPreviouslyFree: true, startupMs: performance.now() - beginning, readiness: '/api/health only; dashboard not visited by controller' };
    events.push(event); return event;
  }
  function counters() {
    return { normal: requests.filter(request => request.mode === 'normal').length, outage503: requests.filter(request => request.mode === 'outage' && request.status === 503).length, paths: Object.fromEntries([...new Set(requests.map(request => request.path))].map(pathname => [pathname, requests.filter(request => request.path === pathname).length])) };
  }
  async function close() { await stop(); await new Promise(resolve => server.close(resolve)); }
  return { start, stop, close, counters, requests, events, buildEvidence,
    scope: 'Fresh Next Node/JavaScript process per wave; persisted SQL FX remains valid. No OS, filesystem, Supabase, or browser-cache cold claim. Providers are explicit local doubles, never real integrations.',
    output };
}
