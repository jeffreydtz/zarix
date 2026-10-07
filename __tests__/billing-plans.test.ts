import { describe, it, expect, afterEach, vi } from 'vitest';
import { getBillingPlans, getBillingPlanById } from '@/lib/billing/plans';
function reset() {
  for (const key of ['MP_SUBSCRIPTION_PLANS_JSON','MP_SUBSCRIPTION_AMOUNT','MP_SUBSCRIPTION_CURRENCY','MP_SUBSCRIPTION_REASON']) vi.stubEnv(key,'');
}
afterEach(()=>vi.unstubAllEnvs());
describe('explicit billing configuration',()=>{
  it('offers no arbitrary price without configuration',()=>{reset();expect(getBillingPlans()).toEqual([]);});
  it.each(['','0','-5','abc','Infinity'])('rejects invalid price %s',amount=>{reset();vi.stubEnv('MP_SUBSCRIPTION_AMOUNT',amount);expect(getBillingPlans()).toEqual([]);});
  it('normalizes an explicit monthly plan',()=>{
    reset();vi.stubEnv('MP_SUBSCRIPTION_AMOUNT','1500');vi.stubEnv('MP_SUBSCRIPTION_CURRENCY','ars');
    expect(getBillingPlans()[0]).toMatchObject({id:'zarix-monthly',amount:1500,currency:'ARS',interval:'monthly'});
  });
  it.each(['{invalid','{"id":"x"}','[null,7,{},[]]'])('rejects unusable JSON without offering another price',json=>{
    reset();vi.stubEnv('MP_SUBSCRIPTION_AMOUNT','1500');vi.stubEnv('MP_SUBSCRIPTION_PLANS_JSON',json);expect(getBillingPlans()).toEqual([]);
  });
  it('accepts an annual plan and ignores malformed entries',()=>{
    reset();vi.stubEnv('MP_SUBSCRIPTION_PLANS_JSON',JSON.stringify([null,{id:'annual',name:'Anual',description:'Un año',amount:'12000',currency:'ars',interval:'yearly'},{id:'bad',name:'X',description:'X',amount:0,currency:'ARS',interval:'monthly'}]));
    expect(getBillingPlans()).toHaveLength(1);expect(getBillingPlanById('annual')).toMatchObject({amount:12000,currency:'ARS',interval:'yearly',reason:'Anual - Zarix'});expect(getBillingPlanById('unknown')).toBeNull();
  });
});
