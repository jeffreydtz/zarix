// Actual internal chat -> bot tools -> transaction executor -> Gemini SDK loop.
// Database/ledger and provider HTTP are explicit synthetic doubles; no live calls.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), create: vi.fn(), remove: vi.fn(), list: vi.fn(), account: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createServiceClientSync: () => ({
 rpc:mocks.rpc,
 from:()=>{const q:any={select:()=>q,eq:()=>q,single:async()=>({data:{gemini_api_key:'isolated-fixture-key'}})};return q;},
}) }));
vi.mock('@/lib/services/transactions',()=>({transactionsService:{create:mocks.create,delete:mocks.remove,list:mocks.list}}));
vi.mock('@/lib/services/accounts',()=>({accountsService:{create:mocks.account}}));
import { processInternalAiChatMessage } from '@/lib/services/internal-ai-chat';
import { AmbiguousPlanWorkError } from '@/lib/plans/service';
import { nextFinancialRequestId } from '@/lib/financial-request-context';
const input={userId:'fixture-owner',message:'synthetic owner instruction',requestKey:'stable-web-request',financialContext:{user:{default_currency:'ARS'},accounts:[{id:'account-a',name:'Fixture',currency:'ARS',type:'bank',is_active:true}],categories:[]} as any};
const sdkResponse=(calls:any[])=>new Response(JSON.stringify({candidates:[{content:{role:'model',parts:calls.map(call=>({functionCall:call}))},finishReason:'STOP'}]}));
beforeEach(()=>{
 vi.clearAllMocks();vi.stubGlobal('fetch',vi.fn());vi.stubEnv('GEMINI_TIMEOUT_MS','500');
 let reserved=false;
 mocks.rpc.mockImplementation(async name=>{
  if(name==='reserve_plan_usage'){
   if(reserved)return {error:{message:'plan_request_in_progress'}};
   reserved=true;return {data:{replayed:false}};
  }
  throw new Error(`Unexpected quota release or completion: ${name}`);
 });
});
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();});
describe('ambiguous mutation aborts the complete real tool chain',()=>{
 it('commit then lost response creates exactly one ledger effect and leaves quota reserved',async()=>{
  const ledger:string[]=[];
  mocks.create.mockImplementation(async()=>{ledger.push(nextFinancialRequestId()!);throw new Error('synthetic commit then lost response');});
  vi.mocked(fetch).mockResolvedValue(sdkResponse([
   {name:'create_transaction',args:{amount:100,type:'expense',currency:'ARS'}},
   {name:'create_transaction',args:{amount:100,type:'expense',currency:'ARS'}},
  ]));
  await expect(processInternalAiChatMessage(input)).rejects.toBeInstanceOf(AmbiguousPlanWorkError);
  expect(ledger).toHaveLength(1);expect(ledger[0]).toMatch(/^ai:fixture-owner:[0-9a-f]{64}:0$/);
  expect(fetch).toHaveBeenCalledOnce();expect(mocks.create).toHaveBeenCalledOnce();
  expect(mocks.rpc.mock.calls.map(call=>call[0])).toEqual(['reserve_plan_usage']);
  await expect(processInternalAiChatMessage(input)).rejects.toMatchObject({status:409});
  expect(mocks.create).toHaveBeenCalledOnce();expect(fetch).toHaveBeenCalledOnce();
 });
 it('lost deletion response never reselects/deletes the next latest movement',async()=>{
  const ledger=[{id:'newest',type:'expense',amount:10},{id:'older',type:'expense',amount:20}];
  mocks.list.mockImplementation(async()=>[ledger[0]]);
  mocks.remove.mockImplementation(async()=>{ledger.shift();throw new Error('synthetic delete committed response lost');});
  vi.mocked(fetch).mockResolvedValue(sdkResponse([
   {name:'delete_last_transaction',args:{confirm:true}},{name:'delete_last_transaction',args:{confirm:true}},
  ]));
  await expect(processInternalAiChatMessage(input)).rejects.toBeInstanceOf(AmbiguousPlanWorkError);
  expect(ledger.map(x=>x.id)).toEqual(['older']);expect(mocks.list).toHaveBeenCalledOnce();expect(mocks.remove).toHaveBeenCalledOnce();expect(fetch).toHaveBeenCalledOnce();
 });
 it('account creation response loss cannot become a second model creation attempt',async()=>{
  const accounts:string[]=[];
  mocks.account.mockImplementation(async()=>{accounts.push(nextFinancialRequestId()!);throw new Error('synthetic account committed');});
  vi.mocked(fetch).mockResolvedValue(sdkResponse([
   {name:'create_account',args:{name:'Fixture',confirm:true}}, {name:'create_account',args:{name:'Fixture',confirm:true}},
  ]));
  await expect(processInternalAiChatMessage(input)).rejects.toBeInstanceOf(AmbiguousPlanWorkError);
  expect(accounts).toHaveLength(1);expect(mocks.account).toHaveBeenCalledOnce();expect(fetch).toHaveBeenCalledOnce();
 });
 it('uncertainty in the first batch item stops all remaining batch writes',async()=>{
  mocks.create.mockRejectedValue(new Error('synthetic first commit lost response'));
  vi.mocked(fetch).mockResolvedValue(sdkResponse([{name:'create_transactions',args:{transactions:[{amount:10},{amount:20}]}}]));
  await expect(processInternalAiChatMessage(input)).rejects.toBeInstanceOf(AmbiguousPlanWorkError);
  expect(mocks.create).toHaveBeenCalledOnce();expect(fetch).toHaveBeenCalledOnce();
 });
});
