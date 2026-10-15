// Heuristic publication review. Never print or store a suspected value.
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const output = path.join(path.dirname(fileURLToPath(import.meta.url)), 'evidence-secret-scan-checkpoint-0426.json');
const roots = ['20261013', '20261014', '20261015'].map(day => `docs/tif/v2.13/evidence/technical-${day}`);
const files = [], binaries = [], candidates = [];
const secretField = /^(?:password|access_token|refresh_token|service_role_key|serviceRoleKey|anon_key|anonKey|jwt|cookie|authorization|bot_token|api_key|apiKey|share_token|shareToken)$/i;
const jwt = /eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/;
const capabilityPath = /\/api\/shared\/[a-f0-9]{32,}(?:\/|[?"'\s]|$)/i;
const keyShapes = [
  ['supabase-key-shape', /\bsb_(?:secret|publishable)_[A-Za-z0-9_-]{15,}\b/],
  ['google-key-shape', /AIza[A-Za-z0-9_-]{35}/],
  ['telegram-token-shape', /\b\d{8,12}:[A-Za-z0-9_-]{30,50}\b/],
  ['mercadopago-key-shape', /\b(?:TEST|APP_USR)-[A-Za-z0-9_-]{20,}\b/],
];
const decoder = new TextDecoder('utf-8', { fatal: true });
async function walk(directory) {
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const filename = path.posix.join(directory, entry.name);
    if (entry.isDirectory()) await walk(filename);
    else if (entry.isFile()) {
      const buffer = await fs.readFile(filename);
      try {
        if (buffer.includes(0)) throw new Error('Binary NUL');
        decoder.decode(buffer); files.push(filename);
      } catch { binaries.push(filename); }
    }
  }
}
for (const root of roots) await walk(root);
function fields(value, filename, location = '$') {
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    if (secretField.test(key) && typeof child === 'string' && child.length > 0) {
      candidates.push({ path: filename, rule: 'credential-field', field: `${location}.${key}` });
    }
    fields(child, filename, `${location}.${key}`);
  }
}
for (const filename of files.sort()) {
  const text = await fs.readFile(filename, 'utf8');
  if (jwt.test(text)) candidates.push({ path: filename, rule: 'jwt-shape' });
  if (capabilityPath.test(text)) candidates.push({ path: filename, rule: 'unredacted-shared-capability-path' });
  for (const [rule, expression] of keyShapes) if (expression.test(text)) candidates.push({ path: filename, rule });
  if (filename.endsWith('.json')) {
    try { fields(JSON.parse(text), filename); } catch { /* JSON parse failure is not a secret finding. */ }
  }
}
const report = {
  scannedAt: new Date().toISOString(),
  command: `node ${path.relative(process.cwd(), fileURLToPath(import.meta.url))}`,
  scannerSha256: createHash('sha256').update(await fs.readFile(fileURLToPath(import.meta.url))).digest('hex'),
  roots, textFiles: files.length, binaryFilesNotInspected: binaries.length,
  scope: 'Heuristic scan of every UTF-8 evidence file under the three named roots, including scripts and snapshots. Credential fields are checked in JSON and JWT/shared-capability/provider-key patterns in all text. Suspected values are never printed or stored. Binary/image contents are not inspected; candidates need independent review and zero findings do not prove absence of all secrets.',
  candidates,
};
await fs.writeFile(output, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ report: path.relative(process.cwd(), output), textFiles: files.length, binaryFilesNotInspected: binaries.length, candidates: candidates.length }));
