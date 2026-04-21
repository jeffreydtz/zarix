import { timingSafeEqual } from 'node:crypto';

/**
 * Valida `Authorization: Bearer <token>` para jobs internos / Vercel Cron.
 * Si `CRON_SECRET` no está definido, el endpoint queda cerrado (evita `Bearer undefined`).
 */
export function verifyCronBearer(
  authorizationHeader: string | null,
  secret: string | undefined
): boolean {
  if (!secret) return false;
  if (!authorizationHeader?.startsWith('Bearer ')) return false;
  const token = authorizationHeader.slice(7);
  const a = Buffer.from(token, 'utf8');
  const b = Buffer.from(secret, 'utf8');
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
