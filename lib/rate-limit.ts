/**
 * Rate limit de mejor esfuerzo por isolate (Vercel no comparte memoria entre
 * instancias). Corta ráfagas en un mismo worker; no reemplaza un WAF.
 */

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();
const MAX_KEYS = 4000;

function prune(now: number) {
  if (buckets.size < MAX_KEYS) return;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
  if (buckets.size < MAX_KEYS) return;
  const overflow = buckets.size - Math.floor(MAX_KEYS / 2);
  let i = 0;
  for (const key of buckets.keys()) {
    if (i++ >= overflow) break;
    buckets.delete(key);
  }
}

export function rateLimitAllow(
  key: string,
  max: number,
  windowMs: number
): boolean {
  const now = Date.now();
  prune(now);
  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (existing.count >= max) return false;
  existing.count += 1;
  return true;
}

/**
 * Client IP as provided by the platform. Do not trust a caller-controlled
 * X-Forwarded-For: on Vercel use x-vercel-forwarded-for / x-real-ip.
 */
export function clientIpFromRequest(req: Request): string {
  const vercel = req.headers.get('x-vercel-forwarded-for')?.split(',')[0]?.trim();
  if (vercel) return vercel;
  const realIp = req.headers.get('x-real-ip')?.trim();
  if (realIp) return realIp;
  return 'unknown';
}

export function rateLimitExceededResponse(message = 'Demasiados intentos. Esperá un minuto.') {
  return { error: message, status: 429 as const };
}
