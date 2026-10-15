// Scoped publication check; no network, Auth, DB, message decoding or value output.
import fs from 'node:fs/promises';
import path from 'node:path';
import dotenv from 'dotenv';

const repo = process.cwd();
const base = path.join(repo, 'docs/tif/v2.13/evidence/technical-20261015');
const runtime = '/tmp/zarix-runtime-20261015';
const packages = ['empty-account-contracts', 'auth-recovery-valid'];
const checkpoints = [
  runtime + '/auth-valid-recovery-7f219369-42f2-4224-86d7-d0b32349aaf8/password-restoration.private.json',
  runtime + '/auth-valid-recovery-24fab6d7-8360-4636-bd67-b5dbe3552c97/password-restoration.private.json',
];
const values = new Set();
const add = value => { if (typeof value === 'string' && value.length >= 12) values.add(value); };
function collect(value) {
  if (Array.isArray(value)) for (const item of value) collect(item);
  else if (value && typeof value === 'object') for (const [key, item] of Object.entries(value)) {
    if (/password|token|recoveryhash|(?:^|_)key|secret/i.test(key)) add(item);
    if (/JWT_KEYS/.test(key) && typeof item === 'string') { try { collectJwk(JSON.parse(item)); } catch { /* Full private string is already compared. */ } }
    collect(item);
  }
}
function collectJwk(value) {
  if (Array.isArray(value)) for (const item of value) collectJwk(item);
  else if (value && typeof value === 'object') for (const [key, item] of Object.entries(value)) { if (['d', 'k'].includes(key)) add(item); collectJwk(item); }
}
for (const file of checkpoints) collect(JSON.parse(await fs.readFile(file)));
for (const file of ['empty-proof.env', 'restore.env']) collect(dotenv.parse(await fs.readFile(path.join(runtime, file))));
const targets = JSON.parse(await fs.readFile(path.join(runtime, 'empty-account-private/targets.json')));
collect(JSON.parse(await fs.readFile(targets.authConfigFile)));
collect(JSON.parse(await fs.readFile(targets.authLoginFile)));
async function files(directory) {
  const found = [];
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    if (entry.name === 'node_modules') continue;
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) found.push(...await files(file));
    else if (entry.isFile()) found.push(file);
  }
  return found;
}
let checkedFiles = 0;
const findings = [];
for (const name of packages) for (const file of await files(path.join(base, name))) {
  const bytes = await fs.readFile(file); checkedFiles++;
  if ([...values].some(value => bytes.includes(Buffer.from(value)))) findings.push({ path: path.relative(repo, file), exactPrivateValuePresent: true });
}
const report = { status: findings.length ? 'FAIL' : 'PASS', checkedFiles, privateValuesCompared: values.size, findings, valuesOrValueHashesPublished: false, scope: 'Exact strings of12or more characters in the two explicit recovery checkpoints, selected existing env/login/Auth config and private JWK d/k values against only these two public evidence packages, excluding generated node_modules cache. Short local defaults, other repository files and universal absence of secrets are outside this scoped check; parent final scanner is separate.' };
await fs.writeFile(path.join(base, 'auth-recovery-valid/private-value-scan.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report));
process.exitCode = findings.length ? 1 : 0;
