import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { timingSafeStringEqual } from '@/lib/secure-compare';

export const PAT_PREFIX = 'zrxp_';
export const PAT_SCOPES = ['read', 'write', 'ingest'] as const;
export type PatScope = (typeof PAT_SCOPES)[number];

const DUMMY_HASH = hashPersonalAccessToken(`${PAT_PREFIX}${'0'.repeat(64)}`);

export function hashPersonalAccessToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export function generatePersonalAccessToken(): { token: string; prefix: string; hash: string } {
  const token = `${PAT_PREFIX}${randomBytes(32).toString('hex')}`;
  return { token, prefix: token.slice(0, 12), hash: hashPersonalAccessToken(token) };
}

export function looksLikePersonalAccessToken(value: unknown): value is string {
  return typeof value === 'string' && /^zrxp_[a-f0-9]{64}$/.test(value);
}

export function parseBearerToken(header: string | null): string | null {
  if (!header) return null;
  const match = header.match(/^Bearer\s+(\S+)/i);
  return match?.[1] ?? null;
}

/** Constant-time compare of two SHA-256 hex hashes. */
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
