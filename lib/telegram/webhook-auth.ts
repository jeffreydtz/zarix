import { createHmac } from 'node:crypto';
import { timingSafeStringEqual } from '@/lib/secure-compare';

/** Rechaza secretos vacíos (timingSafeStringEqual('', '') es true). */
export function verifyConfiguredSecret(
  provided: string | null | undefined,
  expected: string | null | undefined
): boolean {
  if (!expected || expected.length === 0) return false;
  return timingSafeStringEqual(provided, expected);
}

/**
 * Header `secret_token` del webhook por usuario. Distinto del slug de la URL
 * para que un leak en access logs no baste para spoofear updates.
 */
export function deriveCustomWebhookHeaderSecret(pathSecret: string): string {
  const pepper = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!pepper) return pathSecret;
  return createHmac('sha256', pepper).update(`custom-webhook:${pathSecret}`).digest('hex');
}
