import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { timingSafeStringEqual } from '@/lib/secure-compare';

export const PAT_PREFIX = 'zrxp_';
export const PAT_SCOPES = ['read', 'write', 'ingest', 'write:confirm'] as const;
export type PatScope = (typeof PAT_SCOPES)[number];
export const PAT_DEFAULT_TTL_MS = 365 * 24 * 60 * 60 * 1000;

/** 1 = SHA-256 of the 256-bit random token (current). 2 = reserved HMAC with a dedicated pepper. */
export const PAT_HASH_VERSION_SHA256 = 1 as const;
export const PAT_HASH_VERSION_HMAC = 2 as const;
export type PatHashVersion = typeof PAT_HASH_VERSION_SHA256 | typeof PAT_HASH_VERSION_HMAC;

const DUMMY_HASH = createHash('sha256').update('zarix-pat-dummy').digest('hex');

function sha256Hex(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

/**
 * v1 is SHA-256 of a 256-bit random token. A future dedicated pepper (not
 * SUPABASE_JWT_SECRET) can enable v2 HMAC + dual lookup. v2 is not enabled.
 */
export function hashPersonalAccessTokenForVersion(token: string, version: PatHashVersion): string {
  if (version === PAT_HASH_VERSION_HMAC) {
    throw new Error('PAT hash_version 2 is not enabled.');
  }
  return sha256Hex(token);
}

export function issuePatHash(token: string): { hash: string; version: PatHashVersion } {
  return { hash: sha256Hex(token), version: PAT_HASH_VERSION_SHA256 };
}

export function hashPersonalAccessToken(token: string): string {
  return issuePatHash(token).hash;
}

/** Lookup hashes. Today only v1. Keep this hook for a future v2 pepper. */
export function patLookupHashes(token: string): string[] {
  return [sha256Hex(token)];
}

export function generatePersonalAccessToken(): {
  token: string;
  prefix: string;
  hash: string;
  version: PatHashVersion;
} {
  const token = `${PAT_PREFIX}${randomBytes(32).toString('hex')}`;
  const issued = issuePatHash(token);
  return { token, prefix: token.slice(0, 12), hash: issued.hash, version: issued.version };
}

export function looksLikePersonalAccessToken(value: unknown): value is string {
  return typeof value === 'string' && /^zrxp_[a-f0-9]{64}$/.test(value);
}

export function parseBearerToken(header: string | null): string | null {
  if (!header) return null;
  const match = header.match(/^Bearer\s+(\S+)/i);
  return match?.[1] ?? null;
}

export function hashesMatch(presentedHash: string, storedHash: string | null | undefined): boolean {
  if (!storedHash) {
    timingSafeStringEqual(presentedHash, DUMMY_HASH);
    return false;
  }
  const a = Buffer.from(presentedHash, 'utf8');
  const b = Buffer.from(storedHash, 'utf8');
  if (a.length !== b.length) {
    timingSafeEqual(a.subarray(0, Math.min(a.length, 32)), a.subarray(0, Math.min(a.length, 32)));
    return false;
  }
  return timingSafeEqual(a, b);
}

export function scopesInclude(scopes: string[] | null | undefined, needed: PatScope): boolean {
  return Array.isArray(scopes) && scopes.includes(needed);
}

export function normalizeScopes(input: unknown): PatScope[] {
  if (!Array.isArray(input)) return ['read'];
  const unique = [...new Set(input.map((s) => String(s).toLowerCase()))] as PatScope[];
  const valid = unique.filter((s): s is PatScope => (PAT_SCOPES as readonly string[]).includes(s));
  return valid.length ? valid : ['read'];
}

export function defaultPatExpiresAt(from = new Date()): string {
  return new Date(from.getTime() + PAT_DEFAULT_TTL_MS).toISOString();
}

/** Never returns null: null/false/invalid/past dates clamp to 1 year. Max TTL is 1 year. */
export function parsePatExpiry(input: unknown, fallback = defaultPatExpiresAt()): string {
  if (input === null || input === false || input === undefined || input === '') return fallback;
  const d = new Date(String(input));
  if (Number.isNaN(d.getTime())) return fallback;
  if (d.getTime() <= Date.now()) return fallback;
  const max = Date.now() + PAT_DEFAULT_TTL_MS;
  return new Date(Math.min(d.getTime(), max)).toISOString();
}

// Keep createHmac imported so a future v2 pepper can land without new deps at call sites.
void createHmac;
