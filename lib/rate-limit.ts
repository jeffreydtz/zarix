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

export const SHARED_RPC_TIMEOUT_MS = 1500;
export const SHARED_LIMITER_UNAVAILABLE_MESSAGE =
  'El limitador no está disponible. Reintentá en un momento.';

export type SharedRateLimitDecision = 'allow' | 'exhausted' | 'unavailable';

type RpcResult = { data: unknown; error: { message?: string } | null };

function withRpcAbort<T>(rpc: T, signal: AbortSignal): T {
  const abortable = rpc as T & { abortSignal?: (s: AbortSignal) => T };
  if (typeof abortable.abortSignal === 'function') {
    return abortable.abortSignal(signal);
  }
  return rpc;
}

export async function rateLimitAllowShared(
  key: string,
  max: number,
  windowMs: number
): Promise<SharedRateLimitDecision> {
  const { createBareServiceClient } = await import('@/lib/supabase/server');
  const supabase = createBareServiceClient();
  const controller = new AbortController();
  const timer = setTimeout(() => {
    if (!controller.signal.aborted) controller.abort();
  }, SHARED_RPC_TIMEOUT_MS);
  try {
    const rpc = withRpcAbort(
      supabase.rpc('rate_limit_hit', {
        p_key: key,
        p_max: max,
        p_window_ms: windowMs,
      }),
      controller.signal
    );
    const aborted = new Promise<RpcResult>((resolve) => {
      const fail = () => resolve({ data: null, error: { message: 'rate_limit_hit timeout' } });
      if (controller.signal.aborted) fail();
      else controller.signal.addEventListener('abort', fail, { once: true });
    });
    const { data, error } = await Promise.race([
      Promise.resolve(rpc as PromiseLike<RpcResult>),
      aborted,
    ]);
    if (error) {
      console.error('[rate-limit] shared counter unavailable');
      return 'unavailable';
    }
    if (data === true) return 'allow';
    if (data === false) return 'exhausted';
    console.error('[rate-limit] shared counter unavailable');
    return 'unavailable';
  } catch {
    console.error('[rate-limit] shared counter unavailable');
    return 'unavailable';
  } finally {
    clearTimeout(timer);
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

export function sharedLimiterUnavailableResponse(
  message = SHARED_LIMITER_UNAVAILABLE_MESSAGE
) {
  return { error: message, status: 503 as const };
}
