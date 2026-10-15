import { afterEach, describe, expect, it, vi } from 'vitest';
import { isolatedNativeTargets, isolatedPgEnvironment, isolatedApiFetch, safeNativeFailure } from '../scripts/lib/test-isolated-native-target.mjs';

const confirmation = { ZARIX_ISOLATED_DATABASE_CONFIRM: 'synthetic-only' };

afterEach(() => vi.unstubAllGlobals());

describe('isolated native harness connection safety without network access', () => {
  it('excludes SQL/API messages, Auth row details and capabilities from failure evidence', () => {
    const fixture = 'SYNTHETIC_CAPABILITY_NEVER_PUBLIC';
    const error = Object.assign(new Error(`Failing Auth row contains ${fixture}`), { code: '23514', privateDetails: fixture });
    const evidence = safeNativeFailure(error, 'restore catalog');
    expect(evidence).toEqual({ type: 'Error', code: '23514', context: 'restore catalog' });
    expect(JSON.stringify(evidence)).not.toContain(fixture);
    expect(safeNativeFailure({ name: fixture, code: fixture }, 'restore catalog')).toEqual({ type: 'Error', code: null, context: 'restore catalog' });
  });
  it('requires the disposable synthetic-only acknowledgement', () => {
    expect(() => isolatedNativeTargets({})).toThrow('synthetic-only');
  });

  it('uses only loopback defaults', () => {
    const { apiUrl, databaseUrl, database } = isolatedNativeTargets(confirmation);
    expect(apiUrl.hostname).toBe('127.0.0.1');
    expect(databaseUrl.hostname).toBe('127.0.0.1');
    expect(database).toBe('postgres');
  });

  it.each(['https://example.com', 'https://project.supabase.co', 'http://127.0.0.1.example.com'])('rejects remote API URL %s', url => {
    expect(() => isolatedNativeTargets({ ...confirmation, ZARIX_LOCAL_SUPABASE_URL: url })).toThrow('non-loopback');
  });

  it('rejects remote PostgreSQL even when API is loopback', () => {
    expect(() => isolatedNativeTargets({ ...confirmation, ZARIX_LOCAL_DATABASE_URL: 'postgresql://postgres:synthetic@db.example.com/postgres' })).toThrow('non-loopback');
  });

  it('pins localhost and clears inherited libpq routing, credentials and SQL settings', () => {
    const { databaseUrl } = isolatedNativeTargets({ ...confirmation, ZARIX_LOCAL_DATABASE_URL: 'postgresql://tester:synthetic@localhost:55432/isolated' });
    const env = isolatedPgEnvironment(databaseUrl, {
      PATH: '/usr/bin', PGHOSTADDR: '203.0.113.1', PGSERVICE: 'production', PGSERVICEFILE: '/private/service',
      PGPASSFILE: '/private/passwords', PGOPTIONS: '-c role=service_role', PGTARGETSESSIONATTRS: 'read-write',
    }) as Record<string, string | undefined>;
    expect(env).toMatchObject({ PATH: '/usr/bin', PGHOST: '127.0.0.1', PGHOSTADDR: '127.0.0.1', PGPORT: '55432', PGDATABASE: 'isolated', PGUSER: 'tester', PGPASSWORD: 'synthetic' });
    for (const key of ['PGSERVICE', 'PGSERVICEFILE', 'PGPASSFILE', 'PGOPTIONS', 'PGTARGETSESSIONATTRS']) expect(env[key]).toBeUndefined();
  });

  it('uses an unbracketed IPv6 loopback address for libpq', () => {
    const { databaseUrl } = isolatedNativeTargets({ ...confirmation, ZARIX_LOCAL_DATABASE_URL: 'postgresql://postgres:synthetic@[::1]:55432/postgres' });
    expect(isolatedPgEnvironment(databaseUrl, {}).PGHOSTADDR).toBe('::1');
  });

  it.each([
    { ZARIX_LOCAL_SUPABASE_URL: 'file://127.0.0.1/tmp' },
    { ZARIX_LOCAL_SUPABASE_URL: 'http://user:password@127.0.0.1' },
    { ZARIX_LOCAL_DATABASE_URL: 'https://127.0.0.1/postgres' },
    { ZARIX_LOCAL_DATABASE_URL: 'postgresql://127.0.0.1/postgres?host=example.com' },
    { ZARIX_LOCAL_DATABASE_URL: 'postgresql://127.0.0.1/host%3Dexample.com' },
  ])('rejects ambiguous or unsupported URL options: %j', override => {
    expect(() => isolatedNativeTargets({ ...confirmation, ...override })).toThrow();
  });

  it('prevents API redirects before a key could leave loopback', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('{}'));
    vi.stubGlobal('fetch', fetch);
    await isolatedApiFetch('http://127.0.0.1:54321/rest/v1/accounts', { redirect: 'follow' });
    expect(fetch).toHaveBeenCalledWith('http://127.0.0.1:54321/rest/v1/accounts', { redirect: 'error' });
  });
});
