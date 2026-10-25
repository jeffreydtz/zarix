import { createHmac } from 'node:crypto';

const DEFAULT_TTL_SEC = 120;

function b64url(input: string | Buffer): string {
  return Buffer.from(input).toString('base64url');
}

/** Short-lived authenticated JWT for the PAT user so PostgREST/RLS see auth.uid(). */
export function mintUserAccessToken(
  userId: string,
  ttlSec = DEFAULT_TTL_SEC
): string | null {
  const secret = process.env.SUPABASE_JWT_SECRET?.trim();
  if (!secret || !userId) return null;
  const now = Math.floor(Date.now() / 1000);
  const issuerBase = (process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://127.0.0.1').replace(/\/$/, '');
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = b64url(JSON.stringify({
    iss: `${issuerBase}/auth/v1`,
    aud: 'authenticated',
    role: 'authenticated',
    sub: userId,
    iat: now,
    exp: now + Math.max(30, Math.min(ttlSec, 600)),
    aal: 'aal1',
  }));
  const sig = createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64url');
  return `${header}.${payload}.${sig}`;
}

export function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as Record<string, unknown>;
  } catch {
    return null;
  }
}
