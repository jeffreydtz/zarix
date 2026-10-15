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

// Receipt matching is intentionally stricter than HTTP 2xx.
import { sendQueuedTransaction } from '@/lib/offline-queue-sync';
describe('offline durable request transport', () => {
  it('reuses the same persisted ID through lost response, restart, and failed local deletion', async () => {
    const persisted = JSON.stringify(items);
    const remote = new Map<string, string>();
    let debits = 0;
    let loseResponse = true;
    const fetcher = vi.fn(async (_url: unknown, init?: RequestInit) => {
      const key = new Headers(init?.headers).get('Idempotency-Key')!;
      if (!remote.has(key)) remote.set(key, `transaction-${++debits}`);
      if (loseResponse) { loseResponse = false; throw new Error('response lost'); }
      return new Response(JSON.stringify({ id: remote.get(key) }), { status: 201, headers: { 'Idempotency-Key': key } });
    });
    let queue = JSON.parse(persisted);
    const send = (item: { id: string; payload: unknown }) => sendQueuedTransaction(item, fetcher as typeof fetch);
    expect((await syncPendingTransactions(queue, send, vi.fn())).failure).toBe('network');
    queue = JSON.parse(persisted); // App restart retains exactly the same persisted IDs.
    expect((await syncPendingTransactions(queue, send, async () => { throw new Error('delete failed'); })).failure).toBe('storage');
    const remove = vi.fn(async () => undefined);
    expect(await syncPendingTransactions(queue, send, remove)).toEqual({ confirmed: 2 });
    expect(debits).toBe(2);
    expect(fetcher.mock.calls.slice(0, 3).map(([, init]) => new Headers(init?.headers).get('Idempotency-Key'))).toEqual(['first', 'first', 'first']);
  });
  it('rejects a redirected HTML login page or mismatched receipt, without removal', async () => {
    for (const response of [new Response('<html>login</html>'), new Response('{"id":"t"}', { headers: { 'Idempotency-Key': 'wrong' } })]) {
      const remove = vi.fn();
      const result = await syncPendingTransactions(items, item => sendQueuedTransaction(item, vi.fn(async () => response) as typeof fetch), remove);
      expect(result.failure).toBe('response'); expect(remove).not.toHaveBeenCalled();
    }
  });
  it('retains an item when the success body cannot be decoded', async () => {
    const remove = vi.fn();
    const result = await syncPendingTransactions(items, item => sendQueuedTransaction(item, vi.fn(async () => new Response('{', { headers: { 'Idempotency-Key': item.id } })) as typeof fetch), remove);
    expect(result.failure).toBe('network'); expect(remove).not.toHaveBeenCalled();
  });
});

import { queueItemInScope } from '@/lib/offline-queue-sync';
describe('offline tenant ownership and capability scope',()=>{
  const privateA={id:'request-a',endpoint:'/api/accounts',payload:{name:'Cuenta A'},ownerId:'user-a'};
  const privateB={...privateA,id:'request-b',ownerId:'user-b'};
  const legacy={id:'old-item',payload:{accountId:'account-a'}};
  const publicA={id:'request-public',endpoint:`/api/shared/${'a'.repeat(32)}/expenses`,payload:{amount:10}};
  it('switching users neither replays nor deletes the other owner pending operations',async()=>{
    const queue=[privateA,privateB,legacy,publicA];
    const send=vi.fn(async()=>({ok:true,status:201})),remove=vi.fn(async()=>undefined);
    const selected=queue.filter(item=>queueItemInScope(item,'user-b'));
    expect(selected).toEqual([privateB]);await syncPendingTransactions(selected,send,remove);
    expect(remove).toHaveBeenCalledExactlyOnceWith('request-b');
    expect(queue.filter(item=>queueItemInScope(item,'user-a'))).toEqual([privateA]);
  });
  it('retains ownerless legacy items for review and never adopts them on login',()=>{
    expect(queueItemInScope(legacy,'user-a')).toBe(false);
    expect(queueItemInScope(legacy,'user-b')).toBe(false);
    expect(queueItemInScope(privateA,null)).toBe(false);
  });
  it('public group pages cannot replay private or other-group operations',()=>{
    const prefix=`/api/shared/${'a'.repeat(32)}/expenses`;
    expect([privateA,privateB,legacy,publicA].filter(item=>queueItemInScope(item,null,prefix))).toEqual([publicA]);
    expect(queueItemInScope(publicA,null,`/api/shared/${'b'.repeat(32)}/expenses`)).toBe(false);
  });
  it('binds the persisted owner in the HTTP request in case login changes mid-batch',async()=>{
    const fetcher=vi.fn(async(_url: unknown, _init?: RequestInit)=>new Response('{"id":"account-new"}',{status:201,headers:{'Idempotency-Key':privateA.id}}));
    expect(await sendQueuedTransaction(privateA,fetcher as typeof fetch)).toMatchObject({ok:true,status:201});
    expect(new Headers(fetcher.mock.calls[0][1]?.headers).get('X-Queue-Owner')).toBe('user-a');
  });
  it('supports a persisted sale acknowledgement and refuses unexpected API endpoints',async()=>{
    const fetcher=vi.fn(async()=>new Response('{"sale":{"id":"sale-new"}}',{status:201,headers:{'Idempotency-Key':privateA.id}}));
    expect((await sendQueuedTransaction({...privateA,endpoint:'/api/investments/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/sell'},fetcher as typeof fetch)).ok).toBe(true);
    expect(await sendQueuedTransaction({...privateA,endpoint:'/api/user/integrations'},fetcher as typeof fetch)).toEqual({ok:false,status:400});
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
