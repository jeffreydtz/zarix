import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
const mocks=vi.hoisted(()=>({ from:vi.fn(), fx:vi.fn() }));
vi.mock('@/lib/supabase/server',()=>({
  createClient:async()=>({ auth:{ getUser:async()=>({ data:{ user:{ id:'U1' } } }) } }),
  createServiceClientSync:()=>({ from:mocks.from }),
}));
vi.mock('@/lib/services/accounts',()=>({ accountsService:{}, normalizeDebtBalanceForStorage:vi.fn() }));
vi.mock('@/lib/services/cotizaciones',()=>({ cotizacionesService:{ getExchangeRate:mocks.fx } }));
import { PATCH } from '@/app/api/transactions/[id]/route';
import { impactInAccountCurrency, aggregateOriginalByCurrency } from '@/lib/transaction-account-impact';

let replies:any[], updates:any[];
beforeEach(()=>{
  vi.clearAllMocks(); replies=[]; updates=[];
  mocks.from.mockImplementation(()=>{
    const reply=replies.shift(); if (!reply) throw new Error('Unexpected query');
    const q:any={};
    for (const method of ['select','eq']) q[method]=vi.fn(()=>q);
    q.update=vi.fn(value=>{ updates.push(value);return q; });
    q.single=vi.fn(async()=>reply);return q;
  });
});
const request=(body:any)=>new NextRequest('https://example.test/api/transactions/T1',{ method:'PATCH',body:JSON.stringify(body),headers:{ 'content-type':'application/json' } });
const context={ params:Promise.resolve({ id:'T1' }) };

describe('CU-001 A08 edits preserve monetary intent',()=>{
  it('does not reprice an unchanged financial tuple when editing text',async()=>{
    replies=[{ data:{ type:'expense', account_id:'A',amount:100,currency:'USD',amount_in_account_currency:120000,exchange_rate:1200 } },
      { data:{ currency:'ARS',is_active:true } },{ data:{ id:'T1' } }];
    mocks.fx.mockResolvedValue(1300);
    const response=await PATCH(request({ account_id:'A',amount:100,currency:'USD',description:'Texto corregido' }),context);
    expect(response.status).toBe(200);
    expect(updates[0]).toMatchObject({ amount_in_account_currency:120000,exchange_rate:1200,description:'Texto corregido' });
    expect(mocks.fx).not.toHaveBeenCalled();
  });
  it('recalculates both amounts when editing a transfer',async()=>{
    replies=[{ data:{ type:'transfer', account_id:'A',destination_account_id:'B',amount:120000,currency:'ARS',amount_in_account_currency:120000,destination_amount_in_account_currency:100,exchange_rate:0.00083333 } },
      { data:{ currency:'ARS',is_active:true } },{ data:{ currency:'USD',is_active:true } },{ data:{ id:'T1' } }];
    mocks.fx.mockResolvedValue(1/1200);
    const response=await PATCH(request({ account_id:'A',destination_account_id:'B',amount:240000,currency:'ARS' }),context);
    expect(response.status).toBe(200);
    expect(updates[0]).toMatchObject({ amount_in_account_currency:240000,destination_amount_in_account_currency:200 });
  });
  it('rejects a transfer edit to the same account',async()=>{
    replies=[{ data:{ type:'transfer',account_id:'A',destination_account_id:'B',amount:120000,currency:'ARS' } },
      { data:{ currency:'ARS',is_active:true } }];
    expect((await PATCH(request({ account_id:'A',destination_account_id:'A',amount:120000,currency:'ARS' }),context)).status).toBe(400);
    expect(updates).toEqual([]);
  });
  it('uses the persisted destination amount in account impact and grouping',()=>{
    const tx:any={ type:'transfer',account_id:'A',destination_account_id:'B',amount:120000000,currency:'ARS',
      amount_in_account_currency:120000000,exchange_rate:0.00083333,destination_amount_in_account_currency:100000,
      destination_account:{ currency:'USD' } };
    expect(impactInAccountCurrency(tx,'B')).toBe(100000);
    expect(aggregateOriginalByCurrency([tx],'B')).toEqual({ USD:100000 });
  });
  it('keeps the historical fallback when no explicit destination amount exists',()=>{
    const tx:any={ type:'transfer',account_id:'A',destination_account_id:'B',amount:120000,currency:'ARS',
      amount_in_account_currency:120000,exchange_rate:0.00083333,destination_account:{ currency:'USD' } };
    expect(impactInAccountCurrency(tx,'B')).toBeCloseTo(99.9996,8);
  });
});
