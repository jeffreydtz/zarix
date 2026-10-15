import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  insert: vi.fn(), rpc: vi.fn(), scope: vi.fn(), fx: vi.fn(),
  user: { id: 'viewer' } as { id: string } | null,
  accounts: [] as any[], batches: new Map<string, any>(), receipts: new Map<string, any>(),
  rows: [] as any[], failRow: '' as string, loseReply: false, throwReply: false, receiptReadError: false,
}));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: mocks.user } }) } }),
  createServiceClientSync: () => ({
    rpc: mocks.rpc,
    from: (table: string) => {
      let owner = '', prefix = '', requestId = '', start = 0, end = 999, single = false;
      const query: any = {
        select: () => query,
        eq: (key: string, value: string) => { mocks.scope(table, key, value); if (key === 'user_id') owner = value; if (key === 'request_id') requestId = value; return query; },
        like: (_key: string, value: string) => { prefix = value.slice(0, -1); return query; },
        order: () => query,
        maybeSingle: () => { single = true; return query; },
        range: (a: number, b: number) => { start = a; end = b; return query; },
        or: () => query,
        then: (resolve: any, reject: any) => {
          const data = table === 'accounts' ? mocks.accounts : table === 'categories'
            ? [{ id: 'own-category', name: 'Comida' }]
            : [...mocks.receipts.values()].filter(r => r.owner === owner && r.request_id.startsWith(prefix) && (!requestId || r.request_id === requestId))
              .sort((a, b) => a.request_id.localeCompare(b.request_id)).slice(start, end + 1);
          return Promise.resolve(single && mocks.receiptReadError
            ? {data:null,error:{message:'receipt lookup unavailable'}}
            : { data: single ? data[0] ?? null : data, error: null }).then(resolve, reject);
        },
        insert: mocks.insert,
      };
      return query;
    },
  }),
}));
vi.mock('@/lib/services/cotizaciones', () => ({ cotizacionesService: { getExchangeRate: mocks.fx } }));
import { POST } from '@/app/api/import/transactions/route';

async function request(content: string, name='rows.json', extras: Record<string,string>={}) {
  const body = new FormData();
  body.set('file',new File([content],name));
  body.set('batchId', '11111111-1111-4111-8111-111111111111');
  body.set('ownerId', 'viewer');
  Object.entries(extras).forEach(([key,value])=>body.set(key,value));
  return POST(new NextRequest('http://localhost/api/import/transactions',{method:'POST',body}));
}
beforeEach(() => {
  mocks.insert.mockReset().mockResolvedValue({error:null});
  mocks.fx.mockReset().mockResolvedValue(1234);
  mocks.scope.mockReset(); mocks.user={id:'viewer'};
  mocks.accounts = [{ id: 'own-ars', name: 'Caja "ARS"', currency: 'ARS' },
    { id: 'own-usd', name: 'Dólares', currency: 'USD' }];
  mocks.batches.clear(); mocks.receipts.clear(); mocks.rows = []; mocks.failRow = ''; mocks.loseReply = false; mocks.throwReply = false; mocks.receiptReadError = false;
  mocks.rpc.mockReset().mockImplementation(async (name, args) => {
    if (name === 'begin_import_batch') {
      const key = `${args.p_user_id}:${args.p_batch_id}`;
      const prior = mocks.batches.get(key);
      if (prior && prior.hash !== args.p_intent_hash) return { error: { code: 'Z0001' } };
      const batch = prior ?? { hash: args.p_intent_hash, context: structuredClone(args.p_context) };
      mocks.batches.set(key, batch);
      return { data: batch.context, error: null };
    }
    const key = `${args.p_user_id}:${args.p_request_id}`;
    const prior = mocks.receipts.get(key);
    if (prior) return prior.request_hash === args.p_request_hash
      ? { data: prior.response, error: null } : { error: { code: 'Z0001' } };
    if (args.p_transaction.description === mocks.failRow) return { error: { message: 'synthetic row failure' } };
    const duplicate = args.p_skip_duplicates && mocks.rows.some(r => JSON.stringify(r) === JSON.stringify(args.p_transaction));
    const response = duplicate ? { import_skipped_duplicate: true } : { ...args.p_transaction, id: `row-${mocks.rows.length}` };
    if (!duplicate) mocks.rows.push(args.p_transaction);
    mocks.receipts.set(key, { owner: args.p_user_id, request_id: args.p_request_id, request_hash: args.p_request_hash, response });
    if (mocks.throwReply) throw new Error('synthetic connection reset after commit');
    if (mocks.loseReply) return { error: { message: 'synthetic lost acknowledgement' } };
    return { data: response, error: null };
  });
});

describe('import authorization and preservation', () => {
  it('remaps backup IDs by names only to the authenticated user, preserving historical equivalents',async()=>{
    const response=await request(JSON.stringify({data:{accounts:[{id:'foreign-id',name:'Caja "ARS"',currency:'ARS'}],
      categories:[{id:'foreign-category',name:'Comida'}],transactions:[{account_id:'foreign-id',category_id:'foreign-category',
        type:'expense',amount:10,currency:'USD',amount_in_account_currency:9500,transaction_date:'2026-01-15T12:00:00Z'}]}}));
    expect(response.status).toBe(200);
    expect((await response.json()).imported).toBe(1);
    expect(mocks.rows).toEqual([expect.objectContaining({user_id:'viewer',account_id:'own-ars',
      category_id:'own-category',amount:10,amount_in_account_currency:9500})]);
    expect(mocks.fx).not.toHaveBeenCalled();
    expect(mocks.scope).toHaveBeenCalledWith('accounts','user_id','viewer');
  });

  it('imports a mixed exported transfer using both historical amounts, without current FX',async()=>{
    const response=await request(JSON.stringify([{type:'transfer',date:'2026-01-15',amount:100,currency:'USD',
      amountInAccountCurrency:95000,destinationAmountInAccountCurrency:100,
      account:'Caja "ARS"',destinationAccount:'Dólares',accountCurrency:'ARS',destinationCurrency:'USD'}]));
    expect(response.status).toBe(200);
    expect((await response.json()).imported).toBe(1);
    expect(mocks.rows).toEqual([expect.objectContaining({user_id:'viewer',account_id:'own-ars',
      destination_account_id:'own-usd',amount:95000,currency:'ARS',amount_in_account_currency:95000,
      destination_amount_in_account_currency:100,exchange_rate:100/95000})]);
    expect(mocks.fx).not.toHaveBeenCalled();
  });

  it('rejects a supplied mapping to a foreign account without writing',async()=>{
    const response=await request(JSON.stringify([{type:'expense',date:'2026-01-15',amount:10,currency:'ARS',account:'Unknown'}]),
      'rows.json',{resolutions:JSON.stringify({Unknown:{action:'map',accountId:'foreign-id'}})});
    expect((await response.json()).imported).toBe(0);
    expect(mocks.insert).not.toHaveBeenCalled(); expect(mocks.rows).toHaveLength(0);
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

const expense = (description = 'Café') => ({ type: 'expense', date: '2026-01-15', amount: 10,
  currency: 'ARS', account: 'Caja "ARS"', description });
const nextBatch = '22222222-2222-4222-8222-222222222222';
describe('durable import batch contract', () => {
  it('preview does not create a batch or write a row and supplies a stable file hash', async () => {
    const body = JSON.stringify([expense()]);
    const a = await (await request(body, 'rows.json', {mode:'preview'})).json();
    const b = await (await request(body, 'renamed.json', {mode:'preview'})).json();
    expect(a.fileHash).toMatch(/^[a-f0-9]{64}$/); expect(a.fileHash).toBe(b.fileHash);
    expect(a.ownerId).toBe('viewer'); expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it('requires stable batch ID and original owner before writes', async () => {
    expect((await request(JSON.stringify([expense()]), 'rows.json', {batchId:''})).status).toBe(400);
    expect((await request(JSON.stringify([expense()]), 'rows.json', {ownerId:'other'})).status).toBe(409);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it('preserves identical legitimate rows and replays the batch without additional rows', async () => {
    const body = JSON.stringify([expense(), expense()]);
    expect((await (await request(body)).json()).imported).toBe(2);
    expect((await (await request(body)).json()).imported).toBe(2);
    expect(mocks.rows).toHaveLength(2);
    expect(new Set([...mocks.receipts.values()].map(r=>r.request_id)).size).toBe(2);
    await request(body, 'rows.json', {batchId:nextBatch}); expect(mocks.rows).toHaveLength(4);
  });
  it('recovers a partial batch with original mapping after accounts are renamed', async () => {
    const body = JSON.stringify([expense('First'), expense('Second')]);
    mocks.failRow='Second';
    const first=await request(body); expect(first.status).toBe(503);
    const a=await first.json(); expect(a).toMatchObject({success:false,status:'pending',imported:1,skipped:0,pending:1});
    mocks.failRow=''; mocks.accounts=[{id:'replacement',name:'Caja "ARS"',currency:'ARS'}];
    const b=await (await request(body)).json(); expect(b.imported).toBe(2); expect(b.skipped).toBe(0);
    expect(mocks.rows.map(r=>r.account_id)).toEqual(['own-ars','own-ars']);
  });
  it('recovers a lost response before current FX or account validation', async () => {
    const body=JSON.stringify([{...expense(),currency:'USD'}]);
    mocks.loseReply=true;
    const first=await request(body); expect(first.status).toBe(200);
    expect(await first.json()).toMatchObject({success:true,status:'completed',imported:1,skipped:0,pending:0});
    mocks.loseReply=false; mocks.fx.mockRejectedValue(new Error('FX unavailable')); mocks.accounts=[];
    expect((await (await request(body)).json()).imported).toBe(1);
    expect(mocks.rows).toHaveLength(1); expect(mocks.fx).toHaveBeenCalledTimes(1);
  });
  it('reconciles a thrown transport error after the row committed', async () => {
    mocks.throwReply=true;
    const response=await request(JSON.stringify([expense()]));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({success:true,imported:1,skipped:0,pending:0});
    expect(mocks.rows).toHaveLength(1);
    expect(mocks.scope).toHaveBeenCalledWith('transaction_requests','request_id',
      'import:11111111-1111-4111-8111-111111111111:transaction:0');
  });
  it('keeps an unreadable committed outcome pending, then replays the exact receipt without FX or new writes', async () => {
    const body=JSON.stringify([{...expense(),currency:'USD'}]);
    mocks.loseReply=true; mocks.receiptReadError=true;
    const first=await request(body); expect(first.status).toBe(503);
    const result=await first.json();
    expect(result).toMatchObject({success:false,status:'pending',batchId:'11111111-1111-4111-8111-111111111111',
      imported:0,skipped:0,pending:1,total:1,skippedDetails:[]});
    expect(result.error).toContain('archivo original sin editarlo');
    mocks.loseReply=false; mocks.receiptReadError=false; mocks.accounts=[];
    mocks.fx.mockRejectedValue(new Error('FX unavailable')); mocks.rpc.mockClear();
    expect(await (await request(body)).json()).toMatchObject({success:true,imported:1,skipped:0,pending:0});
    expect(mocks.rpc.mock.calls.filter(c=>c[0]==='create_import_transaction_once')).toHaveLength(0);
    expect(mocks.rows).toHaveLength(1); expect(mocks.fx).toHaveBeenCalledTimes(1);
  });
  it('keeps a failed transfer acknowledgement pending rather than omitted', async () => {
    mocks.loseReply=true; mocks.receiptReadError=true;
    const body=JSON.stringify([{type:'transfer',date:'2026-01-15',amount:100,currency:'ARS',
      account:'Caja "ARS"',destinationAccount:'Dólares',accountCurrency:'ARS',destinationCurrency:'USD',
      destinationAmountInAccountCurrency:1}]);
    const response=await request(body); expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({success:false,imported:0,skipped:0,pending:1,skippedDetails:[]});
    expect(mocks.rows).toHaveLength(1);
  });
  it('does not treat a malformed RPC success and absent receipt as confirmed or omitted', async () => {
    const normal=mocks.rpc.getMockImplementation()!;
    mocks.rpc.mockImplementation((name,args)=>name==='create_import_transaction_once'
      ? Promise.resolve({data:{},error:null}) : normal(name,args));
    const response=await request(JSON.stringify([expense()])); expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({success:false,imported:0,skipped:0,pending:1});
  });
  it('reconciles a confirmed duplicate receipt without claiming it was imported', async () => {
    const body=JSON.stringify([expense()]); await request(body);
    mocks.loseReply=true;
    expect(await (await request(body,'rows.json',{batchId:nextBatch,skipDuplicates:'true'})).json())
      .toMatchObject({success:true,imported:0,skipped:1,pending:0});
    expect(mocks.rows).toHaveLength(1);
  });
  it('keeps a retry pending when live FX fails before an earlier same-ID write commits', async () => {
    const body=JSON.stringify([{...expense(),currency:'USD'}]);
    mocks.fx.mockReset().mockResolvedValueOnce(1000).mockRejectedValue(new Error('FX unavailable'));
    const normal=mocks.rpc.getMockImplementation()!;
    let releaseWrite!:()=>void, markStarted!:()=>void;
    const writeStarted=new Promise<void>(resolve=>{markStarted=resolve;});
    const holdWrite=new Promise<void>(resolve=>{releaseWrite=resolve;});
    mocks.rpc.mockImplementation(async(name,args)=>{
      if(name==='create_import_transaction_once') {markStarted();await holdWrite;}
      return normal(name,args);
    });
    const earlier=request(body);
    await writeStarted;
    const retry=await request(body); expect(retry.status).toBe(503);
    expect(await retry.json()).toMatchObject({success:false,status:'pending',imported:0,skipped:0,pending:1});
    expect(mocks.rows).toHaveLength(0);
    releaseWrite();
    expect(await (await earlier).json()).toMatchObject({success:true,imported:1,skipped:0,pending:0});
    expect(await (await request(body)).json()).toMatchObject({success:true,imported:1,skipped:0,pending:0});
    expect(mocks.rows).toHaveLength(1);expect(mocks.fx).toHaveBeenCalledTimes(2);
  });
  it('hashes source intent rather than changed FX across a raced receipt lookup', async () => {
    const body=JSON.stringify([{...expense(),currency:'USD'}]);
    const arrivals: Array<(rate: number) => void> = [];
    mocks.fx.mockReset().mockImplementation(() => new Promise<number>(resolve => {
      arrivals.push(resolve);
      // Hold the first write until both attempts have missed the receipt.
      if (arrivals.length === 2) arrivals.forEach((finish, i) => finish((i + 1) * 1000));
    }));
    await Promise.all([request(body), request(body)]);
    const calls=mocks.rpc.mock.calls.filter(c=>c[0]==='create_import_transaction_once');
    expect(calls).toHaveLength(2);
    expect(new Set(calls.map(c=>c[1].p_transaction.amount_in_account_currency)).size).toBe(2);
    expect(new Set(calls.map(c=>c[1].p_request_hash)).size).toBe(1); expect(mocks.rows).toHaveLength(1);
  });
  it('rejects changed file or mapping for an existing batch before new rows', async () => {
    const body=JSON.stringify([expense()]); await request(body);
    expect((await request(JSON.stringify([expense(),expense('Added')]))).status).toBe(409);
    expect((await request(body,'rows.json',{resolutions:JSON.stringify({Unknown:{action:'none'}})})).status).toBe(409);
    expect(mocks.rows).toHaveLength(1);
  });
  it('skips existing exact equivalents only when explicitly chosen and remembers that decision', async () => {
    const body=JSON.stringify([expense()]); await request(body);
    const extras={batchId:nextBatch,skipDuplicates:'true'};
    const result=await (await request(body,'rows.json',extras)).json();
    expect(result.imported).toBe(0); expect(result.skipped).toBe(1);
    mocks.rows=[]; // Deleting the matching row never changes the acknowledged skip.
    expect((await (await request(body,'rows.json',extras)).json()).skipped).toBe(1);
    expect(mocks.rows).toHaveLength(0);
  });
  it('loads all receipt pages before replaying large imports', async () => {
    const body=JSON.stringify(Array.from({length:1002},(_,i)=>expense(`Row ${i}`)));
    await request(body); mocks.accounts=[]; mocks.rpc.mockClear();
    expect((await (await request(body)).json()).imported).toBe(1002);
    expect(mocks.rpc.mock.calls.filter(c=>c[0]==='create_import_transaction_once')).toHaveLength(0);
  });
});


describe('import transfer precision', () => {
  const transfer = (amount: number, destinationAmount: number) => JSON.stringify([{
    type: 'transfer', date: '2026-01-15', amount, currency: 'ARS', account: 'Caja "ARS"',
    destinationAccount: 'Dólares', accountCurrency:'ARS', destinationCurrency:'USD',
    destinationAmountInAccountCurrency: destinationAmount,
  }]);
  it('rejects invalid fiat precision before writing an imported transfer', async () => {
    const result=await (await request(transfer(0.001,1))).json();
    expect(result.imported).toBe(0); expect(result.skipped).toBe(1); expect(mocks.rows).toHaveLength(0);
  });
  it('rejects a destination equivalent that rounds to zero', async () => {
    const result=await (await request(transfer(100,0.001))).json();
    expect(result.imported).toBe(0); expect(result.skipped).toBe(1); expect(mocks.rows).toHaveLength(0);
  });
  it('rounds calculated destination equivalents as the transaction service does', async () => {
    const result=await (await request(transfer(100,1.234))).json();
    expect(result.imported).toBe(1); expect(mocks.rows[0].destination_amount_in_account_currency).toBe(1.23);
  });
});

describe('partial JSON imports with an invalid amount', () => {
  it.each(['array', 'backup'] as const)('rejects the zero row in %s JSON and keeps durable row identities', async (format) => {
    // Match the existing database amount constraint; its error must not turn
    // immutable file validation into an indefinitely pending operation.
    const persist = mocks.rpc.getMockImplementation()!;
    mocks.rpc.mockImplementation(async (name: string, args: any) => {
      if (name === 'create_import_transaction_once' && args.p_transaction.amount === 0) {
        return { data: null, error: { message: 'amount must be positive' } };
      }
      return persist(name, args);
    });
    const transactions = [
      { ...expense('Valid before zero'), amount: 500 },
      { ...expense('Invalid zero'), amount: 0 },
      { ...expense('Valid after zero'), type: 'income', amount: 700 },
    ];
    const content = JSON.stringify(format === 'array' ? transactions : {
      data: {
        accounts: [{ id: 'backup-account', name: 'Caja "ARS"', currency: 'ARS' }],
        transactions: transactions.map(({ date, account: _account, ...row }) => ({
          ...row, account_id: 'backup-account', transaction_date: date,
        })),
      },
    });

    const first = await request(content);
    expect(first.status).toBe(200);
    expect(await first.json()).toMatchObject({
      success: true, status: 'completed', imported: 2, skipped: 1, pending: 0, total: 3,
      skippedDetails: [expect.objectContaining({ title: 'Fila omitida — monto inválido' })],
    });
    expect(mocks.rows.map(row => row.amount)).toEqual([500, 700]);
    const receipts = [...mocks.receipts.values()].map(row => row.request_id).sort();
    expect(receipts).toEqual([
      'import:11111111-1111-4111-8111-111111111111:transaction:0',
      'import:11111111-1111-4111-8111-111111111111:transaction:2',
    ]);
    expect(mocks.fx).not.toHaveBeenCalled();

    const retry = await request(content);
    expect(retry.status).toBe(200);
    expect(await retry.json()).toMatchObject({ imported: 2, skipped: 1, pending: 0, total: 3 });
    expect(mocks.rows).toHaveLength(2);
    expect([...mocks.receipts.values()].map(row => row.request_id).sort()).toEqual(receipts);
    expect(mocks.rpc.mock.calls.filter(([name]) => name === 'create_import_transaction_once')).toHaveLength(2);
  });
});
