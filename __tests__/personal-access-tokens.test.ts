import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { inspect } from 'node:util';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  insert: vi.fn(),
  select: vi.fn(),
  eq: vi.fn(),
  is: vi.fn(),
  maybeSingle: vi.fn(),
  single: vi.fn(),
  order: vi.fn(),
  update: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createServiceClientSync: () => ({ from: mocks.from }),
  createBareServiceClient: () => ({ from: mocks.from }),
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: '11111111-1111-4111-8111-111111111111' } } }) } }),
}));

import {
  generatePersonalAccessToken,
  hashPersonalAccessToken,
  hashPersonalAccessTokenForVersion,
  hashesMatch,
  looksLikePersonalAccessToken,
  parseBearerToken,
  parsePatExpiry,
  PAT_HASH_VERSION_HMAC,
  PAT_HASH_VERSION_SHA256,
} from '@/lib/auth/personal-access-token';
import { authenticatePersonalAccessToken } from '@/lib/services/personal-access-tokens';
import { POST as ingest } from '@/app/api/ingest/wallet/route';

const FIXTURE_USER = '11111111-1111-4111-8111-111111111111';
const OTHER_USER = '22222222-2222-4222-8222-222222222222';

function chain(result: unknown) {
  const q: any = {};
  q.select = mocks.select.mockReturnValue(q);
  q.insert = mocks.insert.mockReturnValue(q);
  q.update = mocks.update.mockReturnValue(q);
  q.eq = mocks.eq.mockReturnValue(q);
  q.is = mocks.is.mockReturnValue(q);
  q.order = mocks.order.mockReturnValue(q);
  q.maybeSingle = mocks.maybeSingle.mockResolvedValue(result);
  q.single = mocks.single.mockResolvedValue(result);
  q.limit = vi.fn().mockReturnValue(q);
  q.gte = vi.fn().mockReturnValue(q);
  q.in = vi.fn().mockReturnValue(q);
  q.or = vi.fn().mockReturnValue(q);
  q.not = vi.fn().mockReturnValue(q);
  return q;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => { vi.restoreAllMocks(); });

describe('personal access tokens', () => {
  it('hashes with sha256 in test without pepper and never stores the raw token', () => {
    const generated = generatePersonalAccessToken();
    expect(looksLikePersonalAccessToken(generated.token)).toBe(true);
    expect(generated.version).toBe(PAT_HASH_VERSION_SHA256);
    expect(generated.hash).toBe(hashPersonalAccessToken(generated.token));
    expect(generated.hash).not.toBe(generated.token);
    expect(generated.hash).toHaveLength(64);
  });

  it('issues SHA-256 v1 in production without SUPABASE_JWT_SECRET and leaves v2 disabled', () => {
    const prevPepper = process.env.SUPABASE_JWT_SECRET;
    delete process.env.SUPABASE_JWT_SECRET;
    try {
      const generated = generatePersonalAccessToken();
      expect(generated.version).toBe(PAT_HASH_VERSION_SHA256);
      expect(generated.hash).toBe(hashPersonalAccessToken(generated.token));
      expect(() => hashPersonalAccessTokenForVersion(generated.token, PAT_HASH_VERSION_HMAC)).toThrow(
        /not enabled/
      );
    } finally {
      if (prevPepper === undefined) delete process.env.SUPABASE_JWT_SECRET;
      else process.env.SUPABASE_JWT_SECRET = prevPepper;
    }
  });

  it('clamps null or overlong PAT expiry to one year, never immortal', () => {
    const fromNull = parsePatExpiry(null);
    expect(fromNull).toBeTruthy();
    const horizon = Date.now() + 366 * 24 * 60 * 60 * 1000;
    expect(Date.parse(fromNull)).toBeLessThan(horizon);
    const far = new Date(Date.now() + 5 * 365 * 24 * 60 * 60 * 1000).toISOString();
    expect(Date.parse(parsePatExpiry(far))).toBeLessThan(horizon);
  });

  it('compares hashes in constant time', () => {
    const { token, hash } = generatePersonalAccessToken();
    expect(hashesMatch(hashPersonalAccessToken(token), hash)).toBe(true);
    expect(hashesMatch(hashPersonalAccessToken(token), hash.replace(/a/g, 'b'))).toBe(false);
    expect(hashesMatch(hash, null)).toBe(false);
  });

  it('rejects missing, revoked, wrong-scope and foreign tokens', async () => {
    const generated = generatePersonalAccessToken();
    mocks.from.mockImplementation(() => chain({ data: {
      id: 'pat-1', user_id: FIXTURE_USER, scopes: ['read'], token_hash: generated.hash,
      hash_version: 1, revoked_at: '2026-01-01T00:00:00Z', last_used_at: null, expires_at: null,
    }, error: null }));
    await expect(authenticatePersonalAccessToken(
      new NextRequest('http://localhost/api/v1', { headers: { authorization: `Bearer ${generated.token}` } }),
      'read'
    )).rejects.toMatchObject({ status: 401 });

    mocks.from.mockImplementation(() => chain({ data: {
      id: 'pat-1', user_id: FIXTURE_USER, scopes: ['read'], token_hash: generated.hash,
      hash_version: 1, revoked_at: null, last_used_at: null, expires_at: null,
    }, error: null }));
    await expect(authenticatePersonalAccessToken(
      new NextRequest('http://localhost/api/v1', { headers: { authorization: `Bearer ${generated.token}` } }),
      'ingest'
    )).rejects.toMatchObject({ status: 403 });

    expect(parseBearerToken(null)).toBeNull();
    expect(OTHER_USER).not.toBe(FIXTURE_USER);
  });
});

describe('wallet ingest auth surface', () => {
  it('rejects oversized and malformed payloads without calling Gemini', async () => {
    const generated = generatePersonalAccessToken();
    mocks.from.mockImplementation((table: string) => {
      if (table === 'personal_access_tokens') {
        return chain({ data: {
          id: 'pat-1', user_id: FIXTURE_USER, scopes: ['ingest'], token_hash: generated.hash,
          hash_version: 1, revoked_at: null, last_used_at: null, expires_at: null,
        }, error: null });
      }
      return chain({ data: null, error: null });
    });
    const huge = new NextRequest('http://localhost/api/ingest/wallet', {
      method: 'POST',
      headers: { authorization: `Bearer ${generated.token}`, 'content-type': 'application/json', 'content-length': String(40_000) },
      body: '{"amount":1}',
    });
    const denied = await ingest(huge);
    expect(denied.status).toBe(413);

    const malformed = new NextRequest('http://localhost/api/ingest/wallet', {
      method: 'POST',
      headers: { authorization: `Bearer ${generated.token}`, 'content-type': 'application/json' },
      body: '{not-json',
    });
    const bad = await ingest(malformed);
    expect(bad.status).toBe(400);
    const output = inspect(vi.mocked(console.error).mock.calls, { depth: 8 });
    expect(output).not.toContain(generated.token);
  });
});
