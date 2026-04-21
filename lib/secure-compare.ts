import { timingSafeEqual } from 'node:crypto';

/** Comparación en tiempo constante para secretos en cabeceras o query (evita filtrado por timing). */
export function timingSafeStringEqual(
  a: string | null | undefined,
  b: string | null | undefined
): boolean {
  if (a == null || b == null) return false;
  const ba = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ba.length !== bb.length) return false;
  try {
    return timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}
