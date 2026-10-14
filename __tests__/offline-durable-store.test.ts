import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IDBFactory, IDBDatabase } from 'fake-indexeddb';
const session=vi.hoisted(()=>({ owner:'user-a',error:null as null|Error }));
vi.mock('@/lib/supabase/client',()=>({createClient:()=>({auth:{getSession:async()=>({data:{session:session.owner?{user:{id:session.owner}}:null},error:session.error})}})}));
import { dbGetAll, dbRemove, dbConfirm, enqueueOperation, recoverFinancialOperation, submitFinancialOperation } from '@/lib/offline-transaction-store';
import { queueItemInScope, sendQueuedTransaction, syncPendingOperations } from '@/lib/offline-queue-sync';
const payload={type:'expense',accountId:'account-a',amount:25,currency:'ARS'};
let remote:Map<string,string>,effects:number,fetcher:ReturnType<typeof vi.fn>;
beforeEach(()=>{
  session.owner='user-a';session.error=null;remote=new Map();effects=0;
  vi.stubGlobal('indexedDB',new IDBFactory());vi.stubGlobal('window',new EventTarget());
  fetcher=vi.fn(async(_url:string,init:RequestInit)=>{
    const key=new Headers(init.headers).get('Idempotency-Key')!;
    if(!remote.has(key))remote.set(key,`effect-${++effects}`);
    return new Response(JSON.stringify({id:remote.get(key)}),{status:201,headers:{'Idempotency-Key':key}});
  });vi.stubGlobal('fetch',fetcher);
});
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();});
function abortNextWrite(skip=0){
  const original=IDBDatabase.prototype.transaction;
  return vi.spyOn(IDBDatabase.prototype,'transaction').mockImplementation(function(this:IDBDatabase,...args:Parameters<typeof original>){
    const tx=original.apply(this,args);if(args[1]==='readwrite'){if(skip>0)skip--;else queueMicrotask(()=>tx.abort());}return tx;
  });
}
describe('real IndexedDB API durability with fake-indexeddb fixture',()=>{
  it('commits random request ID and owner before returning, then reopens with identical record',async()=>{
    const a=await enqueueOperation('/api/transactions',payload);
    expect(a.ownerId).toBe('user-a');expect(a.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(await dbGetAll()).toEqual([a]);expect(await dbGetAll()).toEqual([a]);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('transaction abort rejects enqueue, sends nothing, and leaves no misleading durable record',async()=>{
    abortNextWrite();await expect(submitFinancialOperation('/api/transactions',payload)).rejects.toBeNull();
    expect(fetcher).not.toHaveBeenCalled();expect(await dbGetAll()).toEqual([]);
  });
  it('retains same ID after committed remote effect with lost response and form/browser restart',async()=>{
    const transport=fetcher.getMockImplementation()! as (...args: any[]) => Promise<Response>;let lose=true;
    fetcher.mockImplementation(async(...args)=>{const response=await transport(...args);if(lose){lose=false;throw new Error('response lost');}return response;});
    const a=await submitFinancialOperation('/api/transactions',payload);
    expect(a.state).toBe('pending');expect((await dbGetAll())[0].id).toBe(a.item.id);
    // The user selects the saved ID after restart; no form/content lookup.
    const b=await recoverFinancialOperation((await dbGetAll())[0].id);
    expect(b.state).toBe('confirmed');expect(b.item.id).toBe(a.item.id);expect(effects).toBe(1);
    expect(await dbGetAll()).toEqual([]);
  });
  it('does not mint a new key for changed payload while an earlier form is ambiguous',async()=>{
    fetcher.mockRejectedValue(new Error('lost'));
    const a=await submitFinancialOperation('/api/transactions',payload);
    const b=await submitFinancialOperation('/api/transactions',{...payload,amount:30},'POST',a.item);
    expect(b.state).toBe('pending');expect(b.item.id).toBe(a.item.id);expect(fetcher).toHaveBeenCalledTimes(1);
    expect((await dbGetAll())[0].payload).toEqual(payload);
  });
  it('independent concurrent new forms with identical content have distinct IDs and effects, including lost responses',async()=>{
    const transport=fetcher.getMockImplementation()! as (...args:any[])=>Promise<Response>;
    fetcher.mockImplementation(async(...args)=>{await transport(...args);throw new Error('response lost');});
    const attempts=await Promise.all([
      submitFinancialOperation('/api/transactions',payload),
      submitFinancialOperation('/api/transactions',payload),
    ]);
    expect(attempts.every(attempt=>attempt.state==='pending')).toBe(true);
    expect(new Set(attempts.map(attempt=>attempt.item.id)).size).toBe(2);
    expect(await dbGetAll()).toHaveLength(2);
    expect(new Set(fetcher.mock.calls.map(([,init])=>new Headers(init.headers).get('Idempotency-Key'))).size).toBe(2);
    expect(effects).toBe(2);
    fetcher.mockImplementation(transport);
    const selectedIds=(await dbGetAll()).map(item=>item.id);
    const recovered=await Promise.all(selectedIds.map(recoverFinancialOperation));
    expect(recovered.every(attempt=>attempt.state==='confirmed')).toBe(true);
    expect(new Set(recovered.map(attempt=>attempt.item.id))).toEqual(new Set(selectedIds));
    expect(effects).toBe(2);expect(await dbGetAll()).toEqual([]);
  });
  it('concurrent retries of one explicit intent share its durable ID and one effect',async()=>{
    const intentId=crypto.randomUUID();
    const transport=fetcher.getMockImplementation()! as (...args:any[])=>Promise<Response>;
    fetcher.mockImplementation(async(...args)=>{await transport(...args);throw new Error('response lost');});
    const attempts=await Promise.all([
      submitFinancialOperation('/api/transactions',payload,'POST',undefined,'manual',intentId),
      submitFinancialOperation('/api/transactions',payload,'POST',undefined,'manual',intentId),
    ]);
    expect(attempts.map(attempt=>attempt.item.id)).toEqual([intentId,intentId]);
    expect(await dbGetAll()).toHaveLength(1);expect(effects).toBe(1);
    fetcher.mockImplementation(transport);
    expect((await recoverFinancialOperation(intentId)).state).toBe('confirmed');
    expect(effects).toBe(1);expect(await dbGetAll()).toEqual([]);
  });
  it('a changed payload under the same explicit intent retains the original and sends no second key',async()=>{
    fetcher.mockRejectedValue(new Error('response lost'));
    const intentId=crypto.randomUUID();
    const attempts=await Promise.all([
      submitFinancialOperation('/api/transactions',payload,'POST',undefined,'manual',intentId),
      submitFinancialOperation('/api/transactions',{...payload,amount:30},'POST',undefined,'manual',intentId),
    ]);
    expect(new Set(attempts.map(attempt=>attempt.item.id)).size).toBe(1);
    expect(await dbGetAll()).toHaveLength(1);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(attempts[1].error).toContain('datos originales');
  });
  it('identical legitimate confirmed operations have separate IDs and financial effects',async()=>{
    const a=await submitFinancialOperation('/api/transactions',payload),b=await submitFinancialOperation('/api/transactions',payload);
    expect(a.state).toBe('confirmed');expect(b.state).toBe('confirmed');expect(a.item.id).not.toBe(b.item.id);expect(effects).toBe(2);
  });
  it('failed local storage after server confirmation retains safe retry and does not clear the draft',async()=>{
    const item=await enqueueOperation('/api/transactions',payload,'POST','manual');
    const abort=abortNextWrite(1);const a=await submitFinancialOperation('/api/transactions',payload,'POST',item,'manual');
    expect(a.state).toBe('pending');expect(a.error).toContain('confirmada en el servidor');expect((await dbGetAll())[0].id).toBe(item.id);abort.mockRestore();
    const b=await recoverFinancialOperation(item.id);
    expect(b.state).toBe('confirmed');expect(b.item.id).toBe(item.id);expect(effects).toBe(1);expect(await dbGetAll()).toEqual([]);
  });
  it('changing authenticated user leaves earlier records untouched and does not send them',async()=>{
    fetcher.mockRejectedValue(new Error('offline'));
    const a=await submitFinancialOperation('/api/accounts',{name:'Cuenta A'});session.owner='user-b';
    const retry=await submitFinancialOperation('/api/accounts',{name:'Cuenta A'},'POST',a.item);
    expect(retry.state).toBe('pending');expect(fetcher).toHaveBeenCalledTimes(1);
    const records=await dbGetAll();expect(records.filter(item=>queueItemInScope(item,'user-b'))).toEqual([]);
    expect(records[0].ownerId).toBe('user-a');
  });
  it('an expired session retains an open draft until its original owner signs in again',async()=>{
    fetcher.mockRejectedValueOnce(new Error('response lost'));
    const pending=await submitFinancialOperation('/api/transactions',payload);
    session.owner='';
    const expired=await submitFinancialOperation('/api/transactions',payload,'POST',pending.item);
    expect(expired.state).toBe('pending');expect(expired.item.id).toBe(pending.item.id);
    expect(expired.error).toContain('otra sesión');expect(fetcher).toHaveBeenCalledTimes(1);
    expect((await dbGetAll())[0].ownerId).toBe('user-a');
    session.owner='user-a';
    const recovered=await submitFinancialOperation('/api/transactions',payload,'POST',pending.item);
    expect(recovered.state).toBe('confirmed');expect(recovered.item.id).toBe(pending.item.id);
    expect(await dbGetAll()).toEqual([]);
  });
  it('HTTP403 remains pending and independent later requests still confirm',async()=>{
    const blocked=await enqueueOperation('/api/accounts',{name:'Limited'}),other=await enqueueOperation('/api/transactions',payload);
    fetcher.mockImplementationOnce(async()=>new Response('{"error":"Límite del plan"}',{status:403}));
    const outcomes=await syncPendingOperations(await dbGetAll(),sendQueuedTransaction,dbRemove);
    expect(outcomes).toContainEqual({id:blocked.id,state:'pending',failure:'response',status:403});
    expect(outcomes).toContainEqual({id:other.id,state:'confirmed'});expect((await dbGetAll()).map(x=>x.id)).toEqual([blocked.id]);
  });
  it('explicit user queue removal permits a fresh operation without discarding failures automatically',async()=>{
    fetcher.mockRejectedValue(new Error('offline'));const a=await submitFinancialOperation('/api/transactions',payload);
    await dbRemove(a.item.id);const b=await submitFinancialOperation('/api/transactions',payload);
    expect(b.item.id).not.toBe(a.item.id);expect(b.state).toBe('pending');
  });
});

describe('selected background confirmation and fresh intents',()=>{
  it('retains the draft ID and cached receipt until foreground acknowledgement',async()=>{
    const transport=fetcher.getMockImplementation()! as (...args:any[])=>Promise<Response>;
    fetcher.mockImplementationOnce(async(...args)=>{await transport(...args);throw new Error('response lost');});
    const pending=await submitFinancialOperation('/api/transactions',payload);
    expect(pending.state).toBe('pending');
    await syncPendingOperations(await dbGetAll(),sendQueuedTransaction,(id,receipt)=>dbConfirm(id,receipt));
    const saved=(await dbGetAll())[0];expect(saved.id).toBe(pending.item.id);expect(saved.confirmedReceipt.id).toBe('effect-1');
    // No in-memory reference: explicitly selected ID consumes its receipt.
    const confirmed=await recoverFinancialOperation(saved.id);
    expect(confirmed.state).toBe('confirmed');expect(confirmed.item.id).toBe(pending.item.id);expect(effects).toBe(1);
    expect(fetcher).toHaveBeenCalledTimes(2);expect(await dbGetAll()).toEqual([]);
  });
  it('a new form never consumes another intent cached by background sync',async()=>{
    const earlier=await enqueueOperation('/api/transactions',payload,'POST','manual');
    await dbConfirm(earlier.id,{id:'earlier-confirmed'});
    const fresh=await submitFinancialOperation('/api/transactions',payload,'POST',undefined,'manual');
    expect(fresh.state).toBe('confirmed');expect(fresh.item.id).not.toBe(earlier.id);
    expect(fetcher).toHaveBeenCalledOnce();expect((await dbGetAll())[0].id).toBe(earlier.id);
    const observed=await recoverFinancialOperation(earlier.id);
    expect(observed.receipt.id).toBe('earlier-confirmed');expect(fetcher).toHaveBeenCalledOnce();
    expect(await dbGetAll()).toEqual([]);
  });
});
