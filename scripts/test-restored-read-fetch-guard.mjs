// Pure local unit runner: the fetch captured by every guard import is a stub.
// It never starts a server, opens a socket, uses credentials, or calls native fetch.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import {
  chmodSync, existsSync, linkSync, lstatSync, mkdirSync, readFileSync,
  rmSync, symlinkSync, writeFileSync,
} from 'node:fs';

const savedFetch = globalThis.fetch;
const savedLog = process.env.ZARIX_RESTORE_FETCH_GUARD_LOG;
const identifier = `unit-${process.pid}-${randomUUID()}`;
const auditPath = `/tmp/zarix-restored-read-fetch-guard-${identifier}.jsonl`;
const invalidPaths = [];
const calls = [];
const stubResponse = new Response('synthetic stub response');
const stubFetch = async (input, init) => {
  calls.push({ input, init });
  return stubResponse;
};
let imports = 0;
let assertions = 0;
const check = (condition, message) => { assert.ok(condition, message); assertions += 1; };
const equal = (actual, expected, message) => { assert.equal(actual, expected, message); assertions += 1; };
async function load(log) {
  globalThis.fetch = stubFetch;
  if (log === undefined) delete process.env.ZARIX_RESTORE_FETCH_GUARD_LOG;
  else process.env.ZARIX_RESTORE_FETCH_GUARD_LOG = log;
  await import(`./lib/restored-read-fetch-guard.mjs?unit=${identifier}-${imports++}`);
}
async function blocked(input, init) {
  const before = calls.length;
  await assert.rejects(globalThis.fetch(input, init), /Restored-read fetch guard/);
  assertions += 1;
  equal(calls.length, before, 'blocked request must not reach the original fetch');
}
async function invalidAudit(log) {
  await assert.rejects(load(log), /audit is unavailable/);
  assertions += 1;
  await blocked('http://127.0.0.1/');
}

try {
  await invalidAudit(undefined);
  await invalidAudit(`/tmp/unscoped-${identifier}.jsonl`);
  equal(existsSync(`/tmp/unscoped-${identifier}.jsonl`), false);
  await invalidAudit(`/tmp/../tmp/zarix-restored-read-fetch-guard-${identifier}.jsonl`);

  const insecure = `${auditPath.slice(0, -6)}-insecure.jsonl`;
  invalidPaths.push(insecure);
  writeFileSync(insecure, '', { mode: 0o600 });
  chmodSync(insecure, 0o640);
  await invalidAudit(insecure);
  chmodSync(insecure, 0o660);
  await invalidAudit(insecure);

  const directory = `${auditPath.slice(0, -6)}-directory.jsonl`;
  invalidPaths.push(directory);
  mkdirSync(directory, { mode: 0o700 });
  await invalidAudit(directory);

  const target = `${auditPath.slice(0, -6)}-target.jsonl`;
  const symbolic = `${auditPath.slice(0, -6)}-symbolic.jsonl`;
  const hard = `${auditPath.slice(0, -6)}-hard.jsonl`;
  invalidPaths.push(symbolic, hard, target);
  writeFileSync(target, '', { mode: 0o600 });
  symlinkSync(target, symbolic);
  await invalidAudit(symbolic);
  linkSync(target, hard);
  await invalidAudit(hard);
  equal(readFileSync(target, 'utf8'), '', 'invalid audit files must not be appended');

  await load(auditPath);
  equal(lstatSync(auditPath).mode & 0o7777, 0o600);
  const installed = JSON.parse(readFileSync(auditPath, 'utf8').trim());
  equal(installed.event, 'installed');
  equal(installed.pid, process.pid);
  check(Number.isFinite(Date.parse(installed.timestamp)), 'installation timestamp is recorded');

  for (const targetURL of ['http://127.0.0.1:54321/', 'https://localhost:443/health', 'http://[::1]:3000/healthz']) {
    equal(await fetch(targetURL), stubResponse);
    equal(calls.at(-1).init.redirect, 'error');
  }
  const headers = new Headers({ authorization: 'Bearer SYNTHETIC_HEADER_SECRET' });
  const body = 'SYNTHETIC_BODY_SECRET';
  const controller = new AbortController();
  const options = { method: 'POST', headers, body, signal: controller.signal, redirect: 'follow', credentials: 'include' };
  const sensitiveURL = 'http://127.0.0.1:54321/capability/SYNTHETIC_PATH_SECRET?token=SYNTHETIC_QUERY_SECRET';
  equal(await fetch(sensitiveURL, options), stubResponse);
  const forwarded = calls.at(-1);
  equal(forwarded.input, sensitiveURL);
  for (const field of ['headers', 'body', 'signal', 'credentials', 'method']) equal(forwarded.init[field], options[field]);
  equal(forwarded.init.redirect, 'error');
  equal(options.redirect, 'follow', 'caller dictionary must remain unchanged');
  equal(headers.get('authorization'), 'Bearer SYNTHETIC_HEADER_SECRET');

  let methodReads = 0;
  const inheritedOptions = Object.create({ headers, body, cache: 'no-store' });
  Object.defineProperty(inheritedOptions, 'method', { get() { methodReads += 1; return 'PUT'; } });
  await fetch('http://localhost/inherited', inheritedOptions);
  equal(calls.at(-1).init.headers, headers);
  equal(calls.at(-1).init.body, body);
  equal(calls.at(-1).init.cache, 'no-store');
  equal(calls.at(-1).init.method, 'PUT');
  equal(methodReads, 1);

  const receiverOptions = { redirect: 'follow' };
  const receiverHeaders = new WeakMap([[receiverOptions, headers]]);
  Object.defineProperties(receiverOptions, {
    headers: { get() { return receiverHeaders.get(this); } },
    method: { get() { equal(this, receiverOptions, 'dictionary getters retain their original receiver'); return 'PATCH'; } },
    body: { value: body },
  });
  Object.freeze(receiverOptions);
  await fetch('http://localhost/frozen', receiverOptions);
  equal(calls.at(-1).init.headers, headers);
  equal(calls.at(-1).init.body, body);
  equal(calls.at(-1).init.method, 'PATCH');
  equal(calls.at(-1).init.redirect, 'error');

  const request = new Request('http://localhost/request?token=SYNTHETIC_REQUEST_QUERY', { method: 'POST', headers, body });
  await fetch(request, { redirect: 'manual' });
  equal(calls.at(-1).input, request, 'Request body and internal state are forwarded without cloning');
  equal(calls.at(-1).init.redirect, 'error');
  equal(request.bodyUsed, false);
  const localURL = new URL('http://127.0.0.1/url');
  localURL.toString = () => 'https://external.invalid/';
  await fetch(localURL);
  equal(calls.at(-1).input, 'http://127.0.0.1/url', 'URL overrides cannot switch the inspected destination');

  class DisguisedRequest extends Request { get url() { return 'http://localhost/'; } }
  const denied = [
    'https://external.invalid/private?token=SYNTHETIC_DENIED_QUERY',
    new URL('https://external.invalid/url'),
    new Request('https://external.invalid/request', { headers }),
    new DisguisedRequest('https://external.invalid/internal'),
    'http://localhost.external.invalid/', 'http://127.0.0.1.external.invalid/',
    'http://localhost./', 'http://127.1/', 'http://0x7f000001/',
    'http://SYNTHETIC_USER:SYNTHETIC_PASSWORD@localhost/', 'http://@localhost/',
    new URL('http://SYNTHETIC_URL_USER@127.0.0.1/'),
    'ftp://localhost/', 'file:///tmp/SYNTHETIC_FILE_SECRET', 'data:text/plain,SYNTHETIC_DATA_SECRET',
    '/relative', 'SYNTHETIC_INVALID_URL', { toString: () => 'http://localhost/' },
  ];
  for (const input of denied) await blocked(input);
  await blocked('https://external.invalid/', { method: 'SYNTHETIC_METHOD_SECRET' });

  const entries = readFileSync(auditPath, 'utf8').trim().split('\n').map((line) => JSON.parse(line));
  const decisions = entries.slice(1);
  check(decisions.some((entry) => entry.allowed && entry.path === '/health'), 'only whitelisted static paths are recorded');
  check(decisions.some((entry) => entry.allowed && !('path' in entry)), 'dynamic paths are omitted');
  for (const entry of decisions) {
    check(Object.keys(entry).every((key) => ['allowed', 'origin', 'method', 'path'].includes(key)), 'decision schema contains no request material');
    if (!entry.allowed) {
      check(!('path' in entry), 'denial audit omits paths');
      check(!entry.origin.includes('://') && !entry.origin.includes('@') && !entry.origin.includes('?'), 'denial origin contains only a hostname or a constant');
    }
  }
  const audit = readFileSync(auditPath, 'utf8');
  check(!audit.includes('SYNTHETIC_'), 'audit excludes synthetic tokens, userinfo, headers, bodies, queries, and custom methods');
  check(!audit.includes('authorization'), 'audit excludes header names');
  check(!audit.includes('Bearer'), 'audit excludes token prefixes');

  const beforeFailure = calls.length;
  chmodSync(auditPath, 0o640);
  await blocked('http://localhost/');
  chmodSync(auditPath, 0o600);
  await blocked('http://localhost/');
  equal(calls.length, beforeFailure, 'audit failure poisons the guard until restart');
  const retainedAudit = readFileSync(auditPath, 'utf8');
  await load(auditPath);
  check(readFileSync(auditPath, 'utf8').startsWith(retainedAudit), 'reinstallation appends to an existing private audit');
  equal(await fetch('http://localhost/'), stubResponse);
  console.log(`PASS restored-read fetch guard: ${assertions} assertions; original fetch stubbed; no sockets or servers.`);
} finally {
  globalThis.fetch = savedFetch;
  if (savedLog === undefined) delete process.env.ZARIX_RESTORE_FETCH_GUARD_LOG;
  else process.env.ZARIX_RESTORE_FETCH_GUARD_LOG = savedLog;
  for (const path of [auditPath, ...invalidPaths]) rmSync(path, { force: true, recursive: true });
}
