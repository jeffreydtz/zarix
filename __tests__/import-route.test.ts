import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({ insert: vi.fn(), create: vi.fn(), scope: vi.fn(), fx: vi.fn(), user: { id: 'viewer' } as { id: string } | null }));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: mocks.user } }) } }),
  createServiceClientSync: () => ({
    from: (table: string) => {
      const data = table === 'accounts' ? [
        { id: 'own-ars', name: 'Caja "ARS"', currency: 'ARS' },
        { id: 'own-usd', name: 'Dólares', currency: 'USD' },
      ] : [{ id: 'own-category', name: 'Comida' }];
      const query: any = {
        select: () => query,
        eq: (key: string, value: string) => { mocks.scope(table, key, value); return query; },
        or: () => query,
        then: (resolve: any, reject: any) => Promise.resolve({ data, error: null }).then(resolve, reject),
        insert: mocks.insert,
      };
      return query;
    },
  }),
}));
vi.mock('@/lib/services/transactions', () => ({ transactionsService: { create: mocks.create } }));
vi.mock('@/lib/services/cotizaciones', () => ({ cotizacionesService: { getExchangeRate: mocks.fx } }));
import { POST } from '@/app/api/import/transactions/route';

async function request(content: string, name='rows.json', extras: Record<string,string>={}) {
  const body = new FormData();
  body.set('file',new File([content],name));
  Object.entries(extras).forEach(([key,value])=>body.set(key,value));
  return POST(new NextRequest('http://localhost/api/import/transactions',{method:'POST',body}));
}
beforeEach(() => {
  mocks.insert.mockReset().mockResolvedValue({error:null});
  mocks.create.mockReset().mockResolvedValue({id:'created'});
  mocks.fx.mockReset().mockResolvedValue(1234);
  mocks.scope.mockReset(); mocks.user={id:'viewer'};
});

describe('import authorization and preservation', () => {
  it('remaps backup IDs by names only to the authenticated user, preserving historical equivalents',async()=>{
    const response=await request(JSON.stringify({data:{accounts:[{id:'foreign-id',name:'Caja "ARS"',currency:'ARS'}],
      categories:[{id:'foreign-category',name:'Comida'}],transactions:[{account_id:'foreign-id',category_id:'foreign-category',
        type:'expense',amount:10,currency:'USD',amount_in_account_currency:9500,transaction_date:'2026-01-15T12:00:00Z'}]}}));
    expect(response.status).toBe(200);
    expect((await response.json()).imported).toBe(1);
    expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({user_id:'viewer',account_id:'own-ars',
      category_id:'own-category',amount:10,amount_in_account_currency:9500}));
    expect(mocks.fx).not.toHaveBeenCalled();
    expect(mocks.scope).toHaveBeenCalledWith('accounts','user_id','viewer');
  });

  it('imports a mixed exported transfer using both historical amounts, without current FX',async()=>{
    const response=await request(JSON.stringify([{type:'transfer',date:'2026-01-15',amount:100,currency:'USD',
      amountInAccountCurrency:95000,destinationAmountInAccountCurrency:100,
      account:'Caja "ARS"',destinationAccount:'Dólares',accountCurrency:'ARS',destinationCurrency:'USD'}]));
    expect(response.status).toBe(200);
    expect((await response.json()).imported).toBe(1);
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({userId:'viewer',accountId:'own-ars',
      destinationAccountId:'own-usd',amount:95000,currency:'ARS',exchangeRateOverride:100/95000}));
    expect(mocks.fx).not.toHaveBeenCalled();
  });

  it('rejects a supplied mapping to a foreign account without writing',async()=>{
    const response=await request(JSON.stringify([{type:'expense',date:'2026-01-15',amount:10,currency:'ARS',account:'Unknown'}]),
      'rows.json',{resolutions:JSON.stringify({Unknown:{action:'map',accountId:'foreign-id'}})});
    expect((await response.json()).imported).toBe(0);
    expect(mocks.insert).not.toHaveBeenCalled(); expect(mocks.create).not.toHaveBeenCalled();
  });

  it('does not interpret an unsupported currency as ARS',async()=>{
    const response=await request(JSON.stringify([{type:'expense',date:'2026-01-15',amount:10,currency:'NOT_A_CURRENCY',account:'Caja "ARS"'}]));
    expect(response.status).toBe(400); expect(mocks.insert).not.toHaveBeenCalled();
  });

  it('handles malformed rows as user errors, and refuses unknown mode before writes',async()=>{
    expect((await request('null')).status).toBe(400);
    expect((await request('[null]')).status).toBe(400);
    expect((await request('[]','rows.json',{mode:'preview-typo'})).status).toBe(400);
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it('refuses access without a session before querying owned data',async()=>{
    mocks.user=null;
    expect((await request('[]')).status).toBe(401);
    expect(mocks.scope).not.toHaveBeenCalled();
  });
});
