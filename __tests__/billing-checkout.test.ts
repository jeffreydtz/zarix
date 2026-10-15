import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
const mocks=vi.hoisted(()=>({getUser:vi.fn(),createPreapproval:vi.fn(),getPreapproval:vi.fn(),getUserState:vi.fn(),updateUserState:vi.fn(),map:vi.fn()}));
vi.mock('@/lib/supabase/server',()=>({createClient:async()=>({auth:{getUser:mocks.getUser}})}));
vi.mock('@/lib/services/mercado-pago-service',()=>({mercadoPagoService:{createPreapproval:mocks.createPreapproval,getPreapproval:mocks.getPreapproval,mapPreapprovalStatusToSubscription:mocks.map}}));
vi.mock('@/lib/services/subscriptions',()=>({subscriptionsService:{getUserState:mocks.getUserState,updateUserState:mocks.updateUserState}}));
import { POST } from '@/app/api/billing/subscription-link/route';
const request=(body:unknown)=>new NextRequest('https://zarix.example/api/billing/subscription-link',{method:'POST',body:JSON.stringify(body)});
beforeEach(()=>{
  vi.clearAllMocks();mocks.getUser.mockResolvedValue({data:{user:{id:'user-1',email:'fixture@example.test'}}});
  mocks.createPreapproval.mockImplementation(async input => ({id:'preapproval-1',external_reference:'user-1',status:'pending',init_point:'https://www.mercadopago.com/checkout',auto_recurring:{transaction_amount:input.transactionAmount,currency_id:input.currencyId,frequency:input.frequency,frequency_type:input.frequencyType}}));mocks.getUserState.mockResolvedValue({status:'ACTIVE',mp_preapproval_id:null,current_period_end:null,grace_period_end:null});mocks.map.mockReturnValue({status:'ACTIVE'});
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

describe('checkout association and duplicate subscriptions with explicit provider doubles', () => {
  it.each([null, [], { plan_id: 7 }, { back_url: false }])('rejects malformed input %j before provider calls', async body => {
    expect((await POST(request(body))).status).toBe(400); expect(mocks.createPreapproval).not.toHaveBeenCalled();
  });
  it('rejects a provider response for the wrong user or amount', async () => {
    mocks.createPreapproval.mockResolvedValue({ id: 'wrong', init_point: 'https://www.mercadopago.com/checkout', external_reference: 'another-user', auto_recurring: { transaction_amount: 1, currency_id: 'ARS', frequency: 1, frequency_type: 'months' } });
    expect((await POST(request({}))).status).toBe(502); expect(mocks.updateUserState).not.toHaveBeenCalled();
  });
  it.each(['authorized', 'paused'])('blocks duplicate checkout for an existing %s agreement', async status => {
    mocks.getUserState.mockResolvedValue({ status: 'ACTIVE', mp_preapproval_id: 'existing' });
    mocks.getPreapproval.mockResolvedValue({ id: 'existing', external_reference: 'user-1', status });
    expect((await POST(request({}))).status).toBe(409); expect(mocks.createPreapproval).not.toHaveBeenCalled();
  });
  it('reuses an existing pending checkout with identical server-selected terms', async () => {
    mocks.getUserState.mockResolvedValue({ status: 'PAST_DUE', mp_preapproval_id: 'existing' });
    mocks.getPreapproval.mockResolvedValue({ id: 'existing', external_reference: 'user-1', status: 'pending', init_point: 'https://www.mercadopago.com/checkout', auto_recurring: { transaction_amount: 1500, currency_id: 'ARS', frequency: 1, frequency_type: 'months' } });
    expect((await POST(request({}))).status).toBe(200); expect(mocks.createPreapproval).not.toHaveBeenCalled(); expect(mocks.updateUserState).not.toHaveBeenCalled();
  });
  it('does not expose a checkout if its association cannot be persisted', async () => {
    mocks.updateUserState.mockRejectedValueOnce(new Error('database write failed'));
    const response = await POST(request({}));
    expect(response.status).toBe(500); expect(await response.json()).not.toHaveProperty('init_point');
  });
});
