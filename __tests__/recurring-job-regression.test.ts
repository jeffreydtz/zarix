import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ create:vi.fn(), send:vi.fn() }));
vi.mock('@/lib/services/transactions', () => ({ transactionsService:{ create:mocks.create } }));
vi.mock('@/lib/telegram/send', () => ({ sendTelegramDm:mocks.send }));
import { RecurringRulesJob } from '@/lib/cron/recurring-job';

class ProbeJob extends RecurringRulesJob {
  process(client:any, rule:any) { return this.processItem(client,rule); }
  fetch(client:any) { return this.fetchItems(client); }
  eligible(rule:any) { return this.shouldProcess(rule); }
}
const rule = { id:'R1', user_id:'U1', account_id:'A', type:'expense', amount:1000, currency:'ARS',
  description:'Alquiler', frequency:'daily', start_date:'2026-10-01', last_executed_date:'2026-10-05',
  notification_enabled:true, account:{ is_active:true } };
let requests:Array<{ table:string; update?:any; filters:any[] }>;
function clientFor(replies:Array<{ data?:any; error?:any }>) {
  return { from:vi.fn((table:string) => {
    const reply=replies.shift(); if (!reply) throw new Error(`Unexpected query ${table}`);
    const request={ table, filters:[] as any[], update:undefined as any }; requests.push(request);
    const q:any={};
    for (const method of ['select','eq','or','gte','lt']) {
      q[method]=vi.fn((...args:any[])=>{ request.filters.push([method,...args]); return q; });
    }
    q.update=vi.fn((value:any)=>{ request.update=value; return q; });
    q.single=vi.fn(async()=>reply); q.maybeSingle=vi.fn(async()=>reply);
    q.then=(resolve:any,reject:any)=>Promise.resolve(reply).then(resolve,reject);
    return q;
  }) };
}
beforeEach(()=>{
  vi.clearAllMocks(); requests=[];
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-06T12:00:00Z'));
  mocks.create.mockResolvedValue({ id:'T1' }); mocks.send.mockResolvedValue(undefined);
});
afterEach(()=>vi.useRealTimers());

describe('CU-001 A06 recurring coordinator regressions',()=>{
  it('does not mark execution when movement persistence fails',async()=>{
    mocks.create.mockRejectedValue(new Error('SQL unavailable'));
    const client=clientFor([]);
    await expect(new ProbeJob().process(client,rule)).rejects.toThrow('SQL unavailable');
    expect(client.from).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it('marks after creation and sends one notice to the winner',async()=>{
    const client=clientFor([{ data:null },{ data:{ telegram_chat_id:123, telegram_bot_token:null } }]);
    await new ProbeJob().process(client,rule);
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ isRecurring:true, recurringRuleId:'R1', transactionDate:'2026-10-06T12:00:00.000Z' }));
    expect(requests[0].update).toEqual({ last_executed_date:'2026-10-06' });
    expect(mocks.create.mock.invocationCallOrder[0]).toBeLessThan(client.from.mock.invocationCallOrder[0]);
    expect(mocks.send).toHaveBeenCalledTimes(1);
  });
  it('recovers an existing occurrence without sending another notification',async()=>{
    mocks.create.mockRejectedValue({ code:'23505', message:'duplicate' });
    const client=clientFor([{ data:{ id:'T1' } },{ data:null }]);
    expect(await new ProbeJob().process(client,rule)).toBe(false);
    expect(requests[0].filters).toContainEqual(['gte','transaction_date','2026-10-06T03:00:00.000Z']);
    expect(requests[0].filters).toContainEqual(['lt','transaction_date','2026-10-07T03:00:00.000Z']);
    expect(requests[1].update).toEqual({ last_executed_date:'2026-10-06' });
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it('does not hide a conflict unrelated to the recurring occurrence',async()=>{
    const error={ code:'23505', message:'another unique key' }; mocks.create.mockRejectedValue(error);
    const client=clientFor([{ data:null }]);
    await expect(new ProbeJob().process(client,rule)).rejects.toEqual(error);
    expect(requests).toHaveLength(1);
    expect(requests[0].update).toBeUndefined();
  });
  it('surfaces a mark failure so a later duplicate can repair it',async()=>{
    const client=clientFor([{ error:{ message:'mark failure' } }]);
    await expect(new ProbeJob().process(client,rule)).rejects.toMatchObject({ message:'mark failure' });
    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it('does not undo a confirmed movement when Telegram is unavailable',async()=>{
    const errorLog=vi.spyOn(console,'error').mockImplementation(()=>{});
    try {
      mocks.send.mockRejectedValue(new Error('Telegram offline'));
      const client=clientFor([{ data:null },{ data:{ telegram_chat_id:123, telegram_bot_token:null } }]);
      await new ProbeJob().process(client,rule);
      expect(mocks.create).toHaveBeenCalledTimes(1);
      expect(errorLog).toHaveBeenCalledWith(expect.stringContaining('notification failed'),expect.any(Error));
    } finally { errorLog.mockRestore(); }
  });
  it('deactivates only rules strictly past their inclusive end',async()=>{
    const client=clientFor([{ data:null },{ data:[] }]);
    expect(await new ProbeJob().fetch(client)).toEqual([]);
    expect(requests[0].update).toEqual({ is_active:false });
    expect(requests[0].filters).toContainEqual(['lt','end_date','2026-10-06']);
  });
  it('skips archived accounts before financial creation',()=>{
    expect(new ProbeJob().eligible({ ...rule, account:{ is_active:false } })).toBe(false);
    expect(mocks.create).not.toHaveBeenCalled();
  });
});
