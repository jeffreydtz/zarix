import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
const mocks=vi.hoisted(()=>({getUser:vi.fn(),createPreapproval:vi.fn(),getUserState:vi.fn(),updateUserState:vi.fn(),map:vi.fn()}));
vi.mock('@/lib/supabase/server',()=>({createClient:async()=>({auth:{getUser:mocks.getUser}})}));
vi.mock('@/lib/services/mercado-pago-service',()=>({mercadoPagoService:{createPreapproval:mocks.createPreapproval,mapPreapprovalStatusToSubscription:mocks.map}}));
vi.mock('@/lib/services/subscriptions',()=>({subscriptionsService:{getUserState:mocks.getUserState,updateUserState:mocks.updateUserState}}));
import { POST } from '@/app/api/billing/subscription-link/route';
const request=(body:unknown)=>new NextRequest('https://zarix.example/api/billing/subscription-link',{method:'POST',body:JSON.stringify(body)});
beforeEach(()=>{
  vi.clearAllMocks();mocks.getUser.mockResolvedValue({data:{user:{id:'user-1',email:'fixture@example.test'}}});
  mocks.createPreapproval.mockResolvedValue({id:'preapproval-1',init_point:'https://www.mercadopago.com/checkout'});mocks.getUserState.mockResolvedValue({status:'ACTIVE'});mocks.map.mockReturnValue({status:'ACTIVE'});
  vi.stubEnv('MP_SUBSCRIPTION_AMOUNT','1500');vi.stubEnv('MP_SUBSCRIPTION_PLANS_JSON','');
});
afterEach(()=>vi.unstubAllEnvs());
describe('checkout preserves selected price and interval',()=>{
  it('rejects unknown plan without charging another plan',async()=>{expect((await POST(request({plan_id:'unknown'}))).status).toBe(400);expect(mocks.createPreapproval).not.toHaveBeenCalled();});
  it('requires an explicitly configured price',async()=>{vi.stubEnv('MP_SUBSCRIPTION_AMOUNT','');expect((await POST(request({}))).status).toBe(503);expect(mocks.createPreapproval).not.toHaveBeenCalled();});
  it('sends twelve months for an annual plan',async()=>{
    vi.stubEnv('MP_SUBSCRIPTION_PLANS_JSON',JSON.stringify([{id:'annual',name:'Anual',description:'Un año',amount:12000,currency:'ARS',interval:'yearly'}]));
    expect((await POST(request({plan_id:'annual'}))).status).toBe(200);expect(mocks.createPreapproval).toHaveBeenCalledWith(expect.objectContaining({transactionAmount:12000,currencyId:'ARS',frequency:12,frequencyType:'months'}));
  });
  it('uses one month and rejects a foreign return URL',async()=>{expect((await POST(request({back_url:'https://attacker.example/return'}))).status).toBe(200);expect(mocks.createPreapproval).toHaveBeenCalledWith(expect.objectContaining({frequency:1,backUrl:'https://zarix.example/settings'}));});
  it('requires authentication',async()=>{mocks.getUser.mockResolvedValue({data:{user:null}});expect((await POST(request({}))).status).toBe(401);expect(mocks.createPreapproval).not.toHaveBeenCalled();});
});
