// Explicit synthetic local provider. Never proxies or contacts an external service.
import http from 'node:http';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const base = '/tmp/zarix-runtime-20261015';
const control = `${base}/proof-quote-mode.json`;
const statePath = `${base}/proof-quote-server-state.json`;
assert.equal(process.env.ZARIX_PROOF_QUOTES_WINDOW, 'isolated-provider-fixture');
assert.equal(fs.statSync(control).mode & 0o077, 0);
assert.equal(fs.existsSync(statePath), false, 'Never overwrite a previous provider session');
const state = { purpose: 'synthetic-proof-quotes', pid: process.pid, origin: 'http://127.0.0.1:57910', startedAt: new Date().toISOString(), requests: 0, counts: {} };
const checkpoint = () => fs.writeFileSync(statePath, JSON.stringify(state, null, 2) + '\n', { mode: 0o600 });
const server = http.createServer((request, response) => {
  let mode;
  try { mode = JSON.parse(fs.readFileSync(control, 'utf8')); }
  catch { response.writeHead(503).end(); return; }
  const pathname = new URL(request.url, state.origin).pathname;
  const kind = pathname === '/dolar' ? 'dolar-primary' : pathname === '/dolares' ? 'dolar-secondary' : pathname === '/simple/price' ? 'crypto' : 'other';
  state.requests++;
  const status = mode.mode === 'offline503' ? 503 : mode.mode === 'fx1200' ? 200 : 503;
  const key = `${mode.mode}:${kind}:${status}`;
  state.counts[key] = (state.counts[key] || 0) + 1;
  checkpoint();
  response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  if (status !== 200) { response.end(JSON.stringify({ synthetic: true, unavailable: true })); return; }
  const at = mode.sourceTimestamp ? new Date(mode.sourceTimestamp) : new Date();
  assert.ok(Number.isFinite(at.getTime()));
  const timestamp = at.getTime() / 1000;
  if (kind === 'dolar-primary') {
    response.end(JSON.stringify({ blue: { bid: 1190, ask: 1200, timestamp }, oficial: { bid: 1190, ask: 1200, timestamp }, mep: { al30: { '24hs': { price: 1200, timestamp } } }, ccl: { al30: { '24hs': { price: 1200, timestamp } } } }));
  } else if (kind === 'dolar-secondary') {
    response.end(JSON.stringify(['blue', 'oficial', 'bolsa', 'contadoconliqui'].map(casa => ({ casa, compra: 1190, venta: 1200, fechaActualizacion: at.toISOString() }))));
  } else if (kind === 'crypto') {
    const payload = Object.fromEntries(Object.entries({ bitcoin: 60000, ethereum: 2500, tether: 1, 'usd-coin': 1, dai: 1 }).map(([id, usd]) => [id, { usd, ars: usd * 1200, usd_24h_change: 0, last_updated_at: timestamp }]));
    response.end(JSON.stringify(payload));
  } else response.end(JSON.stringify({ synthetic: true }));
});
server.listen(57910, '127.0.0.1', () => { checkpoint(); console.log(JSON.stringify({ status: 'LISTENING', purpose: state.purpose, pid: state.pid, origin: state.origin })); });
process.once('SIGTERM', () => server.close(() => { state.stoppedAt = new Date().toISOString(); checkpoint(); process.exit(0); }));
