import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock('@/lib/telegram/send', () => ({ sendTelegramDm: mocks.send }));
import { deliverNotificationOutbox, enqueueNotification } from '@/lib/services/notification-outbox';

const item = { id:'event-id', user_id:'user-a', lease_token:'lease-a', attempts:1,
  payload:{ kind:'recurring', description:'Alquiler', amount:1000, currency:'ARS', frequency:'monthly', type:'expense' } };
function client(replies: any[], events: any[] = [item]) {
  const writes: any[] = [];
  const instance: any = { rpc:vi.fn(async()=>({ data:events, error:null })), from:vi.fn((table:string) => {
    const reply = replies.shift(); if (!reply) throw new Error(`Unexpected query ${table}`);
    const q: any = {};
    for (const method of ['eq','select']) q[method] = vi.fn(()=>q);
    q.update=vi.fn((value:any)=>{ writes.push({ table,value }); return q; });
    q.upsert=vi.fn((value:any, options:any)=>{ writes.push({ table,value,options }); return q; });
    q.single=q.maybeSingle=vi.fn(async()=>reply);
    q.then=(resolve:any,reject:any)=>Promise.resolve(reply).then(resolve,reject);
    return q;
  }) };
  return { instance, writes };
}
beforeEach(()=> { vi.clearAllMocks(); mocks.send.mockResolvedValue(undefined); });
describe('durable notification delivery independent of financial execution',()=>{
  it('acknowledges only the leased event after provider confirmation',async()=>{
    const { instance,writes }=client([{ data:{ telegram_chat_id:123 } },{ data:{ id:item.id } }]);
    expect(await deliverNotificationOutbox(instance)).toEqual({ delivered:1, failed:0 });
    expect(mocks.send).toHaveBeenCalledTimes(1);
    expect(writes[0]).toMatchObject({ table:'notification_outbox',value:{ lease_token:null,lease_until:null,last_error:null } });
    expect(writes[0].value.delivered_at).toEqual(expect.any(String));
    expect(instance.from.mock.calls.map(([table]:string[])=>table)).toEqual(['users','notification_outbox']);
  });
  it('retains delivery failures for retry without mutating transactions or recurring dates',async()=>{
    mocks.send.mockRejectedValue(new Error('provider failed, token must never enter durable error'));
    const { instance,writes }=client([{ data:{ telegram_chat_id:123 } },{ data:null }]);
    expect(await deliverNotificationOutbox(instance)).toEqual({ delivered:0,failed:1 });
    expect(writes[0].value).toMatchObject({ lease_token:null,lease_until:null,last_error:'Entrega no confirmada' });
    expect(writes[0].value.delivered_at).toBeUndefined();
    expect(instance.from.mock.calls.map(([table]:string[])=>table)).toEqual(['users','notification_outbox']);
  });
  it('retains a successful provider send whose database acknowledgement was lost',async()=>{
    const { instance,writes }=client([{ data:{ telegram_chat_id:123 } },{ error:new Error('db response lost') },{ data:null }]);
    expect(await deliverNotificationOutbox(instance)).toEqual({ delivered:0,failed:1 });
    expect(mocks.send).toHaveBeenCalledTimes(1);
    expect(writes[1].value.available_at).toEqual(expect.any(String));
    expect(instance.from.mock.calls.every(([table]:string[])=>['users','notification_outbox'].includes(table))).toBe(true);
  });
  it('never sends when the claim fails; expired leases can recover retry-bookkeeping errors',async()=>{
    const { instance }=client([]);instance.rpc.mockResolvedValue({ error:new Error('claim unavailable') });
    await expect(deliverNotificationOutbox(instance)).rejects.toThrow('claim unavailable');
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it('keeps notifications pending when Telegram is not linked',async()=>{
    const { instance,writes }=client([{ data:{ telegram_chat_id:null } },{ data:null }]);
    expect(await deliverNotificationOutbox(instance)).toEqual({ delivered:0,failed:1 });
    expect(mocks.send).not.toHaveBeenCalled();expect(writes[0].value.delivered_at).toBeUndefined();
  });
  it('event dedupe cannot overwrite an already delivered outbox row',async()=>{
    const { instance,writes }=client([{ data:null }],[]);
    await enqueueNotification(instance,'user-a','budget:one:100','Aviso');
    expect(writes[0]).toEqual({table:'notification_outbox',value:{ user_id:'user-a',event_key:'budget:one:100',payload:{kind:'message',text:'Aviso'} },options:{ onConflict:'user_id,event_key',ignoreDuplicates:true }});
  });
});

describe('bounded dispatcher deadline',()=>{
  it('does not start another provider send after the budget and bulk releases unused claims',async()=>{
    const now=vi.spyOn(Date,'now').mockReturnValue(0);
    mocks.send.mockImplementation(async()=>{now.mockReturnValue(9000);});
    const next={...item,id:'event-next',lease_token:'lease-next'};
    const {instance}=client([{data:{telegram_chat_id:123}},{data:{id:item.id}}],[item,next]);
    instance.rpc.mockImplementation(async(name:string)=>name==='claim_notification_outbox'?{data:[item,next]}:{data:null});
    try {
      expect(await deliverNotificationOutbox(instance)).toEqual({delivered:1,failed:0});
      expect(mocks.send).toHaveBeenCalledTimes(1);
      expect(instance.rpc).toHaveBeenCalledWith('release_notification_outbox',{p_claims:[{id:'event-next',lease_token:'lease-next'}]});
    } finally {now.mockRestore();}
  });
});
