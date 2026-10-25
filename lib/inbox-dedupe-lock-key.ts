import { createHash } from 'node:crypto';

/** Advisory lock for anonymous possible-duplicates: user + amount + currency + direction. */
export function inboxDedupeLockKey(
  userId: string,
  payload: {
    amount?: number | null;
    currency?: string | null;
    direction?: string | null;
    merchant?: string | null;
    cardName?: string | null;
  },
  ingestKey: string
): string {
  if (ingestKey) return `idemp:${ingestKey}`;
  const material = [
    userId,
    payload.direction || 'expense',
    payload.amount ?? '',
    (payload.currency || 'ARS').toUpperCase(),
  ].join('|');
  return createHash('sha256').update(material).digest('hex');
}
