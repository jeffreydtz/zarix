import { ApiError } from '@/lib/api-handler';

function originHost(value: string | null): string | null {
  if (!value) return null;
  try {
    return new URL(value).host.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Cookie-authenticated mutating routes must be same-origin.
 * Bearer PAT routes skip this (they do not use cookies).
 */
export function assertSameOrigin(req: Request): void {
  const host = req.headers.get('host')?.split(',')[0]?.trim().toLowerCase();
  if (!host) throw new ApiError('Origen inválido.', 403);

  const origin = originHost(req.headers.get('origin'));
  const referer = originHost(req.headers.get('referer'));
  const app = originHost(process.env.NEXT_PUBLIC_APP_URL || null);

  const allowed = new Set<string>([host]);
  if (app) allowed.add(app);

  const candidate = origin || referer;
  if (!candidate) {
    // Same-origin fetch in browsers always sends Origin. Missing both is
    // treated as a non-browser client; session cookies are SameSite=Lax.
    return;
  }
  if (!allowed.has(candidate)) {
    throw new ApiError('Origen no permitido.', 403);
  }
}
