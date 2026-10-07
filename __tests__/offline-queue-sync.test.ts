import { describe, expect, it, vi } from 'vitest';
import { syncPendingTransactions } from '@/lib/offline-queue-sync';

const items = [{ id: 'first', payload: { amount: 1500 } }, { id: 'second', payload: { amount: 700 } }];

describe('offline queue confirmation and retention', () => {
  it('removes only acknowledged items, in order', async () => {
    const order: string[] = [];
    const send = vi.fn(async (item: { id: string; payload: unknown }) => { order.push(`send:${item.id}`); return { ok: true, status: 201 }; });
    const remove = vi.fn(async (id: string) => { order.push(`remove:${id}`); });
    expect(await syncPendingTransactions(items, send, remove)).toEqual({ confirmed: 2 });
    expect(order).toEqual(['send:first', 'remove:first', 'send:second', 'remove:second']);
  });

  it.each([400, 401, 403, 408, 409, 422, 429, 500, 503])('retains the queue on HTTP %i and stops the batch', async (status) => {
    const send = vi.fn(async () => ({ ok: false, status }));
    const remove = vi.fn();
    expect(await syncPendingTransactions(items, send, remove)).toEqual({ confirmed: 0, failure: 'response', status });
    expect(remove).not.toHaveBeenCalled();
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('retains an unconfirmed item after a connection failure', async () => {
    const send = vi.fn().mockResolvedValueOnce({ ok: true, status: 201 }).mockRejectedValueOnce(new Error('connection lost'));
    const remove = vi.fn(async () => undefined);
    expect(await syncPendingTransactions(items, send, remove)).toEqual({ confirmed: 1, failure: 'network' });
    expect(remove).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledWith('first');
  });

  it('reports local storage failure after acknowledgment and stops before the next item', async () => {
    const send = vi.fn(async () => ({ ok: true, status: 201 }));
    const remove = vi.fn(async () => { throw new Error('storage unavailable'); });
    expect(await syncPendingTransactions(items, send, remove)).toEqual({ confirmed: 0, failure: 'storage' });
    expect(send).toHaveBeenCalledTimes(1);
  });
});
