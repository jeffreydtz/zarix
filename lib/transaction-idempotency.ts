import { createHash } from 'node:crypto';

export function validTransactionRequestId(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9:._-]{7,199}$/.test(value);
}

/** Hash the caller's intent, not volatile FX quotes or server timestamps. */
export function transactionRequestHash(input: Record<string, unknown>): string {
  const canonical = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(canonical);
    if (value && typeof value === 'object') {
      return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)
        .sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, canonical(v)]));
    }
    return value;
  };
  const { requestId: _requestId, idempotencyIntent: _idempotencyIntent, ...intent } = input;
  return createHash('sha256').update(JSON.stringify(canonical(intent))).digest('hex');
}
