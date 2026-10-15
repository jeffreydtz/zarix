import { describe, it, expect } from 'vitest';
import { transactionRequestHash, validTransactionRequestId } from '@/lib/transaction-idempotency';
import { nextFinancialRequestId, withFinancialRequestContext } from '@/lib/financial-request-context';

describe('durable operation identity', () => {
  it('fingerprints normalized intent independently of key order and request ID', () => {
    expect(transactionRequestHash({ amount: 20, userId: 'u', requestId: 'first-key', tags: ['a'] }))
      .toBe(transactionRequestHash({ tags: ['a'], requestId: 'second-key', userId: 'u', amount: 20 }));
    expect(transactionRequestHash({ amount: 20 })).not.toBe(transactionRequestHash({ amount: 21 }));
  });
  it('accepts old durable queue IDs and provider namespaces, rejects unsafe keys', () => {
    for (const id of ['1760120000000-aabbccd', 'telegram:123:456:0', 'b2a10c79-2818-44da-a397-40ed02d036c3']) expect(validTransactionRequestId(id)).toBe(true);
    for (const id of ['', null, 'short', 'a'.repeat(201), 'invalid id']) expect(validTransactionRequestId(id)).toBe(false);
  });
  it('isolates simultaneous provider events and gives each operation its own stable ordinal', async () => {
    const run = (prefix: string) => withFinancialRequestContext(prefix, async () => {
      const first = nextFinancialRequestId();
      await Promise.resolve();
      return [first, nextFinancialRequestId()];
    });
    const results = await Promise.all([run('telegram:1:10'), run('telegram:1:11'), run('telegram:1:10')]);
    expect(results).toEqual([
      ['telegram:1:10:0', 'telegram:1:10:1'],
      ['telegram:1:11:0', 'telegram:1:11:1'],
      ['telegram:1:10:0', 'telegram:1:10:1'],
    ]);
    expect(nextFinancialRequestId()).toBeUndefined();
  });
});
