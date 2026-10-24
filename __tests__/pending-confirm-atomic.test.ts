import { describe, expect, it } from 'vitest';
import { pendingInboxRequestId } from '@/lib/services/pending-inbox';
import { validTransactionRequestId } from '@/lib/transaction-idempotency';

const FIXTURE_ITEM = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa9';

describe('pending inbox confirm idempotency', () => {
  it('derives a durable request id from the pending item, never a real user id', () => {
    const key = pendingInboxRequestId(FIXTURE_ITEM);
    expect(key).toBe(`wallet:${FIXTURE_ITEM}`);
    expect(validTransactionRequestId(key)).toBe(true);
    expect(key).not.toMatch(/hotmail/i);
    expect(key).not.toContain('11111111-1111-4111-8111-111111111111');
  });
});
