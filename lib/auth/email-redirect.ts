import type { NextRequest } from 'next/server';

/**
 * Base URL for Supabase email links (confirm signup, magic link).
 * Prefer NEXT_PUBLIC_APP_URL in production so links match Supabase "Site URL" / redirect allowlist.
 */
export function getEmailRedirectOrigin(req: NextRequest): string {
  const env = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '');
  if (env) return env;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('NEXT_PUBLIC_APP_URL es obligatorio en producción');
  }
  return new URL(req.url).origin;
}

export function getAuthCallbackUrl(req: NextRequest): string {
  return `${getEmailRedirectOrigin(req)}/auth/callback`;
}
