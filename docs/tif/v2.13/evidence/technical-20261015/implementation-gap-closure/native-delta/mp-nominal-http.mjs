// Additional provider double for the literal CNF11 no-op payment replay only.
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
const file = path.join(root, 'mp-nominal-control.metadata.json');
assert.equal(fs.lstatSync(file).isSymbolicLink(), false);
const config = JSON.parse(fs.readFileSync(file, 'utf8'));
assert.equal(config.resourceId, 'zarix-delta-preapproval-nominal');
assert.equal(config.nextPaymentDate, '2026-11-06T12:00:00.000Z');
assert.match(config.userId, /^[0-9a-f-]{36}$/);
const journal = fs.openSync(path.join(root, 'mp-nominal-journal.metadata.jsonl'), 'wx', 0o600);
let sequence = 0;
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1:61339');
  if (url.origin !== 'http://127.0.0.1:61339' || req.method !== 'GET') { res.writeHead(400).end(); return; }
  if (url.pathname === '/health') { res.writeHead(200).end('{"synthetic":true,"kind":"mp-nominal"}'); return; }
  const status = url.pathname === '/preapproval/' + config.resourceId ? 200 : 404;
  fs.writeSync(journal, JSON.stringify({ sequence: ++sequence, resource: status === 200 ? 'nominal-preapproval' : 'unknown', status }) + '\n');
  fs.fsyncSync(journal);
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(status === 200 ? { id: config.resourceId, external_reference: config.userId,
    status: 'authorized', next_payment_date: config.nextPaymentDate } : { synthetic: true }));
});
server.listen(61339, '127.0.0.1', () => console.log(JSON.stringify({
  kind: 'mp-nominal', pid: process.pid, port: 61339,
  sourceSha256: createHash('sha256').update(fs.readFileSync(fileURLToPath(import.meta.url))).digest('hex'),
})));
process.once('SIGTERM', () => server.close(() => { fs.closeSync(journal); process.exit(0); }));
