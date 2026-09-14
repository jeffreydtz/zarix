import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
const owner=vi.hoisted(()=>({id:'A' as string|null}));
vi.mock('@/lib/offline-reference-cache',()=>({getOfflineUserId:async()=>owner.id}));
import { dbAdd, dbGetAll, syncPendingTransactions, type QueuedTransaction } from '@/lib/hooks/useOfflineQueue';
const item=(userId:string,id:string):QueuedTransaction=>({userId,id,createdAt:1,payload:{type:'expense',accountId:`${userId}-account`,amount:10,currency:'ARS',categoryId:null,description:'Local draft',transactionDate:'2026-09-14'}});
beforeEach(()=>{owner.id='A';vi.stubGlobal('indexedDB',new IDBFactory());vi.stubGlobal('navigator',{});});
describe('offline transaction preservation',()=>{
  it('preserves an invalid draft while allowing the next valid draft to sync',async()=>{
    await dbAdd(item('A','a'));await dbAdd(item('A','b'));
    const send=vi.fn().mockResolvedValueOnce(new Response('{}',{status:400})).mockResolvedValueOnce(new Response('{}',{status:201}));
    vi.stubGlobal('fetch',send);await syncPendingTransactions();
    expect(send).toHaveBeenCalledTimes(2);
    expect((await dbGetAll()).map(x=>x.id)).toEqual(['a']);
  });
  it('only counts and sends drafts belonging to the current account',async()=>{
    await dbAdd(item('A','a'));await dbAdd(item('B','b'));
    owner.id='B';
    expect((await dbGetAll()).map(x=>x.id)).toEqual(['b']);
    const send=vi.fn().mockResolvedValue(new Response('{}',{status:201}));vi.stubGlobal('fetch',send);
    await syncPendingTransactions();
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][1].headers['x-zarix-offline-owner']).toBe('B');
    owner.id='A';expect((await dbGetAll()).map(x=>x.id)).toEqual(['a']);
  });
  it.each([400,401,403,409,429,500])('preserves drafts on HTTP %i',async status=>{
    await dbAdd(item('A','a'));
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response('{}',{status})));
    await syncPendingTransactions();expect((await dbGetAll()).map(x=>x.id)).toEqual(['a']);
  });
  it('coalesces simultaneous syncs from multiple mounted hooks',async()=>{
    await dbAdd(item('A','a'));
    const send=vi.fn().mockResolvedValue(new Response('{}',{status:201}));vi.stubGlobal('fetch',send);
    await Promise.all([syncPendingTransactions(),syncPendingTransactions()]);
    expect(send).toHaveBeenCalledTimes(1);expect(await dbGetAll()).toEqual([]);
  });
});
