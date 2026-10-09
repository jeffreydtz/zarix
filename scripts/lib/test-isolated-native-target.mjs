// Pure configuration guards. Importing this module never opens a socket.
const loopbackHosts = new Set(['localhost', '127.0.0.1', '[::1]']);

/** @param {Record<string, string | undefined>} env */
export function isolatedNativeTargets(env = process.env) {
  if (env.ZARIX_ISOLATED_DATABASE_CONFIRM !== 'synthetic-only') {
    throw new Error('Set ZARIX_ISOLATED_DATABASE_CONFIRM=synthetic-only only for a fresh disposable local stack.');
  }
  const apiUrl = new URL(env.ZARIX_LOCAL_SUPABASE_URL || 'http://127.0.0.1:54321');
  const databaseUrl = new URL(env.ZARIX_LOCAL_DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres');
  for (const url of [apiUrl, databaseUrl]) {
    if (!loopbackHosts.has(url.hostname)) throw new Error('Refusing non-loopback target');
    // Pin localhost to loopback rather than letting DNS/service configuration
    // redirect an otherwise apparently safe target.
    if (url.hostname === 'localhost') url.hostname = '127.0.0.1';
    if (url.search || url.hash) throw new Error('Connection query parameters and fragments are not supported by this isolated harness');
  }
  if (!['http:', 'https:'].includes(apiUrl.protocol)) throw new Error('Expected a local HTTP(S) API URL');
  if (apiUrl.username || apiUrl.password) throw new Error('API credentials must not appear in the URL');
  if (!['postgres:', 'postgresql:'].includes(databaseUrl.protocol)) throw new Error('Expected a local PostgreSQL URL');
  const database = decodeURIComponent(databaseUrl.pathname.slice(1));
  if (!/^[A-Za-z0-9_][A-Za-z0-9_-]*$/.test(database)) throw new Error('Expected a simple isolated database name');
  return { apiUrl, databaseUrl, database };
}

/** @param {URL} databaseUrl @param {Record<string, string | undefined>} env */
export function isolatedPgEnvironment(databaseUrl, env = process.env) {
  // libpq's PGHOSTADDR and PGSERVICE can override routing despite PGHOST.
  // Do not inherit connection services, alternate credentials, SQL options,
  // or unrelated session settings from the invoking shell.
  const clean = Object.fromEntries(Object.entries(env).filter(([key]) => !key.startsWith('PG')));
  const host = databaseUrl.hostname.replace(/^\[|\]$/g, '');
  return {
    ...clean,
    PGHOST: host,
    PGHOSTADDR: host,
    PGPORT: databaseUrl.port || '54322',
    PGDATABASE: decodeURIComponent(databaseUrl.pathname.slice(1)),
    PGUSER: decodeURIComponent(databaseUrl.username),
    PGPASSWORD: decodeURIComponent(databaseUrl.password),
    PGCONNECT_TIMEOUT: '10',
    PGAPPNAME: 'zarix-isolated-verification',
  };
}

export function isolatedApiFetch(input, init = {}) {
  // Never forward a local stack key to a redirect destination.
  return fetch(input, { ...init, redirect: 'error' });
}
