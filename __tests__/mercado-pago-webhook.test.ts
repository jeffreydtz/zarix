import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createHmac } from 'node:crypto';
import { NextRequest } from 'next/server';
const mocks = vi.hoisted(() => ({ getPreapproval:vi.fn(), getUserState:vi.fn(), updateUserState:vi.fn() }));
vi.mock('@/lib/services/mercado-pago-service', () => ({mercadoPagoService:{getPreapproval:mocks.getPreapproval,mapPreapprovalStatusToSubscription:()=>({status:'ACTIVE'})}}));
vi.mock('@/lib/services/subscriptions', () => ({subscriptionsService:mocks}));
vi.mock('@/lib/supabase/server', () => ({createServiceClientSync:()=>({from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:{id:'local-owner'}})})})})})}));
import { POST } from '@/app/api/webhooks/mercado-pago/route';
function request(id:string, body:unknown) {
  const signature=createHmac('sha256','local-test-secret').update(`${id ? `id:${id};` : ''}request-id:test;ts:123;`).digest('hex');
  return new NextRequest(`http://localhost/api/webhooks/mercado-pago${id ? `?data.id=${id}`:''}`,{method:'POST',headers:{'x-signature':`ts=123,v1=${signature}`,'x-request-id':'test'},body:JSON.stringify(body)});
}
beforeEach(()=>{vi.clearAllMocks();vi.stubEnv('MP_WEBHOOK_SECRET','local-test-secret');mocks.getPreapproval.mockResolvedValue({id:'signed-subscription',external_reference:'local-owner'});mocks.getUserState.mockResolvedValue({status:'ACTIVE'});});
describe('Mercado Pago signed identifier binding',()=>{
  it('only fetches the signed subscription despite alternate body fields',async()=>{
    const response=await POST(request('signed-subscription',{id:'other',resource:'/preapproval/other'}));
    expect(response.status).toBe(200);
    expect(mocks.getPreapproval).toHaveBeenCalledWith('signed-subscription');
  });
  it('rejects a valid HMAC with no signed subscription identifier',async()=>{
    expect((await POST(request('',{data:{id:'other'}}))).status).toBe(401);
    expect(mocks.getPreapproval).not.toHaveBeenCalled();
  });
  it('rejects an explicitly conflicting data.id',async()=>{
    expect((await POST(request('signed-subscription',{data:{id:'other'}}))).status).toBe(401);
    expect(mocks.updateUserState).not.toHaveBeenCalled();
  });
});
