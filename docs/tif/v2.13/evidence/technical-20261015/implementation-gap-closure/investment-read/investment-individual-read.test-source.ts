// Route/Auth/Data API doubles only. This is not an actual JWT/RLS execution.
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {AuthApiError,AuthRetryableFetchError} from '@supabase/supabase-js';
import {NextRequest} from 'next/server';
const mocks=vi.hoisted(()=>({getUser:vi.fn(),from:vi.fn(),select:vi.fn(),eq:vi.fn(),maybeSingle:vi.fn(),elevated:vi.fn()}));
vi.mock('@/lib/supabase/server',()=>({
 createClient:async()=>({auth:{getUser:mocks.getUser},from:mocks.from}),
 createServiceClientSync:mocks.elevated,
}));
vi.mock('@/lib/services/investments',()=>({investmentsService:{update:vi.fn(),delete:vi.fn()}}));
import * as route from '@/app/api/investments/[id]/route';
const owner='00000000-0000-4000-8000-000000000021';
const id='00000000-0000-4000-8000-000000000219';
const read=(position=id)=>route.GET(new NextRequest('http://127.0.0.1/api/investments/'+position+'?user_id=untrusted-owner'),{params:Promise.resolve({id:position})});
beforeEach(()=>{
 vi.clearAllMocks();vi.spyOn(console,'error').mockImplementation(()=>{});
 mocks.getUser.mockResolvedValue({data:{user:{id:owner}},error:null});
 const query={select:mocks.select,eq:mocks.eq,maybeSingle:mocks.maybeSingle};
 mocks.from.mockReturnValue(query);mocks.select.mockReturnValue(query);mocks.eq.mockReturnValue(query);
 mocks.maybeSingle.mockResolvedValue({data:{id,user_id:owner,name:'Synthetic position',quantity:2,is_active:true},error:null});
});
afterEach(()=>vi.restoreAllMocks());
it('provides the existing individual investment read endpoint',()=>{
 expect(typeof (route as Record<string,unknown>).GET).toBe('function');
});
describe('Normal JWT individual investment read',()=>{
 it('uses the normal request client and both exact ID/owner filters without trusting query owner',async()=>{
  const response=await read();expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({id,user_id:owner,quantity:2});
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(mocks.from).toHaveBeenCalledExactlyOnceWith('investments');expect(mocks.select).toHaveBeenCalledExactlyOnceWith('*');
  expect(mocks.eq.mock.calls).toEqual([['id',id],['user_id',owner]]);expect(mocks.elevated).not.toHaveBeenCalled();
 });
 it('keeps an archived own position readable without widening write permissions',async()=>{
  mocks.maybeSingle.mockResolvedValueOnce({data:{id,user_id:owner,is_active:false},error:null});
  const response=await read();expect(response.status).toBe(200);expect((await response.json()).is_active).toBe(false);
  expect(mocks.eq).not.toHaveBeenCalledWith('is_active',true);
 });
 it.each(['absent','foreign'])('returns the same safe404 for a valid %s ID hidden by RLS/ownership',async()=>{
  mocks.maybeSingle.mockResolvedValueOnce({data:null,error:null});const response=await read();
  expect(response.status).toBe(404);expect(await response.json()).toEqual({error:'Posición no encontrada.'});
  expect(mocks.eq).toHaveBeenCalledWith('user_id',owner);
 });
 it.each([null,new AuthApiError('synthetic-private-jwt',401,'bad_jwt')])('denies absent or rejected Auth before reading data',async error=>{
  mocks.getUser.mockResolvedValueOnce({data:{user:null},error});const response=await read();expect(response.status).toBe(401);expect(mocks.from).not.toHaveBeenCalled();
 });
 it('does not trust a returned user when Auth also reports rejection',async()=>{
  mocks.getUser.mockResolvedValueOnce({data:{user:{id:owner}},error:new AuthApiError('synthetic-private-jwt',401,'bad_jwt')});
  expect((await read()).status).toBe(401);expect(mocks.from).not.toHaveBeenCalled();
 });
 it.each([false,true])('keeps an Auth outage safe503 rather than a false missing session (throws=%s)',async throws=>{
  const error=new AuthRetryableFetchError('synthetic-private-upstream',503);
  if(throws)mocks.getUser.mockRejectedValueOnce(error);else mocks.getUser.mockResolvedValueOnce({data:{user:null},error});
  const response=await read();expect(response.status).toBe(503);expect(await response.text()).not.toContain('synthetic-private');expect(mocks.from).not.toHaveBeenCalled();
 });
 it.each(['not-a-uuid','00000000-0000-4000-8000-000000000219-extra'])('rejects invalid UUID %s before the Data API query',async value=>{
  const response=await read(value);expect(response.status).toBe(400);expect(mocks.from).not.toHaveBeenCalled();
 });
 it.each([false,true])('keeps database failure details out of response and logs (throws=%s)',async throws=>{
  const error=new Error('synthetic-private-database-row-or-credential');
  if(throws)mocks.maybeSingle.mockRejectedValueOnce(error);else mocks.maybeSingle.mockResolvedValueOnce({data:null,error});
  const response=await read();expect(response.status).toBe(500);expect(await response.text()).not.toContain('synthetic-private');expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain('synthetic-private');
 });
});
