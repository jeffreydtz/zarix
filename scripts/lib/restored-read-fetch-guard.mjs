/**
 * Test-only preload: node --import ./scripts/lib/restored-read-fetch-guard.mjs …
 * Set ZARIX_RESTORE_FETCH_GUARD_LOG to a fresh task-specific path matching
 * /tmp/zarix-restored-read-fetch-guard-<task-id>.jsonl before starting Node.
 *
 * This restricts globalThis.fetch only. It is not a firewall or a universal TCP
 * guard: other HTTP clients, sockets, subprocesses, and later fetch replacement
 * require separate controls. Import it before the Next server imports app code.
 */
import {
  closeSync, constants, fstatSync, lstatSync, openSync, writeSync,
} from 'node:fs';

const allowedHosts = new Set(['127.0.0.1', 'localhost', '[::1]']);
const allowedMethods = new Set(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'CONNECT', 'TRACE']);
// Exact static paths only. All other paths, including capability IDs, are omitted.
const auditedPaths = new Set(['/', '/health', '/healthz']);
const auditPathPattern = /^\/tmp\/zarix-restored-read-fetch-guard-[A-Za-z0-9][A-Za-z0-9._-]{0,95}\.jsonl$/;
const nativeFetch = globalThis.fetch;
const NativeURL = globalThis.URL;
const urlHref = Object.getOwnPropertyDescriptor(NativeURL.prototype, 'href').get;
const requestURL = Object.getOwnPropertyDescriptor(globalThis.Request.prototype, 'url').get;
const requestMethod = Object.getOwnPropertyDescriptor(globalThis.Request.prototype, 'method').get;
const auditError = () => new Error('Restored-read fetch guard audit is unavailable; fetch is disabled.');
const blockedError = () => new TypeError('Restored-read fetch guard permits only loopback HTTP(S) requests without userinfo.');

let auditFD;
let auditPath;
let auditIdentity;
let auditFailed = false;

function privateRegularFile(stat) {
  return stat.isFile()
    && stat.nlink === 1
    && (stat.mode & 0o7777) === 0o600
    && typeof process.getuid === 'function'
    && stat.uid === process.getuid();
}

function sameFile(a, b) {
  return a.dev === b.dev && a.ino === b.ino;
}

function openAudit() {
  auditPath = process.env.ZARIX_RESTORE_FETCH_GUARD_LOG;
  if (typeof auditPath !== 'string' || !auditPathPattern.test(auditPath)
      || typeof constants.O_NOFOLLOW !== 'number') throw auditError();
  let existing;
  try {
    existing = lstatSync(auditPath);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw auditError();
  }
  if (existing && !privateRegularFile(existing)) throw auditError();
  const creation = existing ? 0 : constants.O_CREAT | constants.O_EXCL;
  auditFD = openSync(auditPath, constants.O_WRONLY | constants.O_APPEND | constants.O_NOFOLLOW | creation, 0o600);
  auditIdentity = fstatSync(auditFD);
  if (!privateRegularFile(auditIdentity) || (existing && !sameFile(existing, auditIdentity))) throw auditError();
}

function appendAudit(entry) {
  if (auditFailed) throw auditError();
  try {
    const opened = fstatSync(auditFD);
    const named = lstatSync(auditPath);
    if (!privateRegularFile(opened) || !privateRegularFile(named)
        || !sameFile(opened, auditIdentity) || !sameFile(opened, named)) throw auditError();
    const line = `${JSON.stringify(entry)}\n`;
    if (writeSync(auditFD, line, null, 'utf8') !== Buffer.byteLength(line, 'utf8')) throw auditError();
  } catch {
    auditFailed = true;
    throw auditError();
  }
}

function describeInput(input) {
  let href;
  let forwarded = input;
  let method = 'GET';
  if (typeof input === 'string') {
    href = input;
  } else {
    // Use native brand-checking accessors. Overridden URL.toString / Request.url
    // must not describe one destination while the native fetch uses another.
    try {
      href = requestURL.call(input);
      method = requestMethod.call(input);
    } catch {
      try {
        href = urlHref.call(input);
        forwarded = href;
      } catch {
        return { allowed: false, origin: 'unavailable', method };
      }
    }
  }
  let url;
  try {
    url = new NativeURL(href);
  } catch {
    return { allowed: false, origin: 'unavailable', method };
  }
  // A strict textual authority also rejects empty userinfo and noncanonical
  // string aliases such as 127.1. URL / Request objects already contain a
  // canonical URL. Nothing from this authority is copied into the audit.
  const authority = href.replace(/[\t\r\n]/g, '').trim().match(/^https?:\/\/([^/?#]*)/i)?.[1];
  const host = authority?.match(/^(\[[^\]]+\]|[^:]+)(?::[0-9]*)?$/)?.[1]?.toLowerCase();
  const allowed = ['http:', 'https:'].includes(url.protocol)
    && allowedHosts.has(url.hostname)
    && allowedHosts.has(host)
    && !url.username && !url.password
    && !authority.includes('@');
  return { allowed, origin: allowed ? url.origin : (url.hostname || 'unavailable'), method, url, forwarded };
}

function auditMethod(value) {
  if (typeof value !== 'string') return 'OTHER';
  const normalized = value.toUpperCase();
  return allowedMethods.has(normalized) ? normalized : 'OTHER';
}

async function guardedFetch(input, init) {
  if (auditFailed) throw auditError();
  const destination = describeInput(input);
  if (init != null && typeof init !== 'object' && typeof init !== 'function') {
    throw new TypeError('Restored-read fetch guard requires an object RequestInit.');
  }
  const source = init ?? Object.create(null);
  const suppliedMethod = Reflect.get(source, 'method', source);
  // RequestInit is a WebIDL dictionary, read by property lookup. Delegate its
  // lookups without copying/serializing values, keeping getter receivers and
  // inherited/nonenumerable fields intact. An empty proxy target also permits
  // overriding redirect when the caller's dictionary is frozen. Method is read
  // once so auditing does not invoke a caller getter a second time.
  const guardedInit = new Proxy(Object.create(null), {
    get(_target, key) {
      if (key === 'redirect') return 'error';
      if (key === 'method') return suppliedMethod;
      return Reflect.get(source, key, source);
    },
  });
  const entry = {
    allowed: destination.allowed,
    origin: destination.origin,
    method: auditMethod(suppliedMethod === undefined ? destination.method : suppliedMethod),
  };
  if (destination.allowed && auditedPaths.has(destination.url.pathname)) entry.path = destination.url.pathname;
  appendAudit(entry);
  if (!destination.allowed) throw blockedError();
  return Reflect.apply(nativeFetch, this, [destination.forwarded, guardedInit]);
}

try {
  if (typeof nativeFetch !== 'function') throw auditError();
  openAudit();
  appendAudit({ event: 'installed', pid: process.pid, timestamp: new Date().toISOString() });
  globalThis.fetch = guardedFetch;
  process.once('exit', () => {
    try { closeSync(auditFD); } catch { /* Process shutdown never serializes errors. */ }
  });
} catch {
  auditFailed = true;
  if (auditFD !== undefined) {
    try { closeSync(auditFD); } catch { /* Preserve the sanitized startup error. */ }
  }
  globalThis.fetch = async function disabledFetch() { throw auditError(); };
  throw auditError();
}
