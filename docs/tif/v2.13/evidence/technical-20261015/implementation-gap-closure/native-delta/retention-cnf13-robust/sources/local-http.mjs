// Explicit local test infrastructure. No external forwarding or request bodies in logs.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

assert.equal(process.env.ZARIX_DELTA_NATIVE_WINDOW, 'parent-released-frozen-delta');
process.umask(0o077);
const root = process.env.ZARIX_DELTA_PRIVATE;
assert.match(root ?? '', /^\/tmp\/zarix-runtime-20261015\/implementation-delta-[0-9a-f-]{36}$/);
assert.equal(fs.lstatSync(root).isSymbolicLink(), false);
assert.equal(fs.statSync(root).mode & 0o777, 0o700);
const targets = JSON.parse(fs.readFileSync(path.join(root, 'targets.metadata.json'), 'utf8'));
assert.match(targets.newDatabaseName, /^zarix_delta_[0-9a-f]{32}$/);
const kind = process.argv[2];
assert.ok(['gateway', 'provider'].includes(kind));
const port = kind === 'gateway' ? 61321 : 61329;
const journal = fs.openSync(path.join(root, `${kind}-journal.private.jsonl`), 'wx', 0o600);
let sequence = 0;
function record(category, status) {
  fs.writeSync(journal, JSON.stringify({ sequence: ++sequence, category, status }) + '\n');
  fs.fsyncSync(journal);
}
function json(res, status, value, category) {
  if (category) record(category, status);
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(value));
}
const server = http.createServer((req, res) => {
  let url;
  try { url = new URL(req.url, `http://127.0.0.1:${port}`); } catch { res.writeHead(400).end(); return; }
  if (url.origin !== `http://127.0.0.1:${port}`) { res.writeHead(400).end(); return; }
  if (url.pathname === '/health') { json(res, 200, { kind, localSynthetic: true, pid: process.pid }); return; }
  if (kind === 'provider') {
    const controlPath = path.join(root, 'provider-control.private.json');
    assert.equal(fs.lstatSync(controlPath).isSymbolicLink(), false);
    assert.equal(fs.statSync(controlPath).mode & 0o777, 0o600);
    const control = JSON.parse(fs.readFileSync(controlPath, 'utf8'));
    assert.equal(control.purpose, 'zarix-delta-provider-control');
    assert.ok(['valid', 'failure'].includes(control.mp));
    if (req.method !== 'GET') { json(res, 405, { synthetic: true }, 'unsupported'); return; }
    const timestamp = Math.floor(Date.now() / 1000);
    if (url.pathname === '/dolar') {
      const simple = { bid: 1200, ask: 1200, timestamp };
      const bond = { al30: { '24hs': { price: 1200, timestamp } } };
      json(res, 200, { blue: simple, oficial: simple, mep: bond, ccl: bond }, 'quotes'); return;
    }
    if (url.pathname === '/dolares') {
      json(res, 200, ['blue', 'oficial', 'bolsa', 'contadoconliqui'].map(casa => ({
        casa, compra: 1200, venta: 1200, fechaActualizacion: new Date().toISOString(),
      })), 'quotes'); return;
    }
    if (url.pathname === '/preapproval/' + control.resourceId) {
      json(res, control.mp === 'failure' ? 503 : 200, control.mp === 'failure'
        ? { synthetic: true, unavailable: true }
        : { id: control.resourceId, status: 'cancelled', external_reference: control.userId }, 'mp'); return;
    }
    json(res, 404, { synthetic: true }, 'unknown'); return;
  }
  let upstream, prefix, category;
  if (url.pathname.startsWith('/auth/v1/')) { upstream = 61327; prefix = '/auth/v1'; category = 'auth'; }
  else if (url.pathname.startsWith('/rest/v1/')) { upstream = 61323; prefix = '/rest/v1'; category = 'rest'; }
  else { res.writeHead(404).end(); return; }
  const headers = { ...req.headers, host: `127.0.0.1:${upstream}`, connection: 'close',
    'x-forwarded-proto': 'http', 'x-forwarded-host': '127.0.0.1:61321' };
  delete headers['proxy-authorization']; delete headers['proxy-authenticate'];
  let recorded = false;
  const once = status => { if (!recorded) { recorded = true; record(category, status); } };
  const proxy = http.request({ hostname: '127.0.0.1', port: upstream, method: req.method,
    path: url.pathname.slice(prefix.length) + url.search, headers, timeout: 10000 }, response => {
    once(response.statusCode); res.writeHead(response.statusCode, { ...response.headers, 'cache-control': 'no-store' });
    response.pipe(res);
  });
  proxy.on('timeout', () => proxy.destroy());
  proxy.on('error', () => { once(502); if (!res.headersSent) res.writeHead(502); res.end(); });
  req.pipe(proxy);
});
const sourceSha256 = createHash('sha256').update(fs.readFileSync(fileURLToPath(import.meta.url))).digest('hex');
server.listen(port, '127.0.0.1', () => {
  fs.writeFileSync(path.join(root, `${kind}-state.private.json`), JSON.stringify({
    kind, pid: process.pid, origin: `http://127.0.0.1:${port}`, sourceSha256,
    newDatabaseName: targets.newDatabaseName, startedAt: new Date().toISOString(),
  }, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
  console.log(JSON.stringify({ kind, status: 'LISTENING', pid: process.pid, port }));
});
process.once('SIGTERM', () => server.close(() => { fs.closeSync(journal); process.exit(0); }));
