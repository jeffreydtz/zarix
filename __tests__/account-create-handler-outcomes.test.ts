import { describe, expect, it, vi } from 'vitest';
import { submitAccountCreation, type AccountCreationAttempt } from '@/lib/account-create-request';
const payload = { name: 'Fixture', currency: 'ARS', type: 'bank' };
const item = { id:'stable-account-key',endpoint:'/api/accounts',draftScope:'/api/accounts',method:'POST' as const,payload,ownerId:'owner',createdAt:1 };
function dependencies() { return {submit:vi.fn()}; }
describe('shared account form submission handler',()=>{
 it.each([400,401,403,409])('retains original fields/operation after HTTP%s and never presents confirmation',async status=>{
  const state:AccountCreationAttempt={};const deps=dependencies();const restore=vi.fn();
  deps.submit.mockResolvedValue({item,state:'pending',error:`HTTP ${status}: sigue guardada`});
  for(let n=0;n<3;n++) expect((await submitAccountCreation(state,payload,{online:true,onPending:restore},deps)).state).toBe('pending');
  expect(state.pending?.id).toBe(item.id);expect(restore).toHaveBeenCalledWith(payload);
  expect(deps.submit.mock.calls[0][3]).toBeUndefined();
  expect(deps.submit.mock.calls[1][3]).toBe(item);expect(deps.submit.mock.calls[2][3]).toBe(item);
 });
 it('retains exact ID after response-loss timeout and confirms only its later receipt',async()=>{
  const state:AccountCreationAttempt={};const deps=dependencies();deps.submit.mockResolvedValueOnce({item,state:'pending',error:'timeout'});
  expect((await submitAccountCreation(state,payload,{online:true},deps)).state).toBe('pending');
  deps.submit.mockResolvedValueOnce({item,state:'confirmed',receipt:{id:'account-original'}});
  expect(await submitAccountCreation(state,payload,{online:true},deps)).toEqual({state:'confirmed',account:{id:'account-original'}});
  expect(deps.submit.mock.calls[1][3]).toBe(item);expect(state.pending).toBeUndefined();
 });
 it('reports offline persistence as pending and restores original fields',async()=>{
  const state:AccountCreationAttempt={};const deps=dependencies();deps.submit.mockResolvedValue({item,state:'pending'});
  expect((await submitAccountCreation(state,payload,{online:false},deps)).state).toBe('pending');expect(state.pending).toBe(item);
 });
 it('an independent newly mounted form submits a fresh intent instead of adopting another form scope',async()=>{
  const state:AccountCreationAttempt={};const deps=dependencies();const restore=vi.fn();
  const freshPayload={...payload,name:'Independent new account'};
  const fresh={...item,id:'independent-key',payload:freshPayload};
  deps.submit.mockResolvedValue({item:fresh,state:'pending',error:'Nueva pendiente'});
  await submitAccountCreation(state,freshPayload,{online:true,onPending:restore},deps);
  expect(deps.submit).toHaveBeenCalledWith('/api/accounts',expect.any(Object),'POST',undefined,'/api/accounts');
  expect(restore).toHaveBeenCalledWith(freshPayload);expect(state.pending?.id).toBe(fresh.id);
 });
 it('guards simultaneous double submit before persistence resolves',async()=>{
  const state:AccountCreationAttempt={};const deps=dependencies();let finish!:(value:any)=>void;
  deps.submit.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));
  const first=submitAccountCreation(state,payload,{online:false},deps);
  expect((await submitAccountCreation(state,payload,{online:false},deps)).state).toBe('pending');
  finish({item,state:'pending'});await first;expect(deps.submit).toHaveBeenCalledOnce();
 });
});
