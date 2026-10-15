import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  client: { from: vi.fn(), rpc: vi.fn() },
  fx: vi.fn(), dolar: vi.fn(), yahoo: vi.fn(), stooq: vi.fn(), arg: vi.fn(),
}));
vi.mock('@/lib/supabase/server', () => ({ createServiceClientSync: () => mocks.client }));
vi.mock('@/lib/services/accounts', () => ({ accountsService: {}, normalizeDebtBalanceForStorage: vi.fn() }));
vi.mock('@/lib/services/cotizaciones', () => ({ cotizacionesService: {
  getExchangeRate: mocks.fx, getDolarQuotes: mocks.dolar,
} }));
vi.mock('@/lib/yahoo-finance-quotes', () => ({ fetchYahooStockQuotesMap: mocks.yahoo }));
vi.mock('@/lib/stooq-us-quote', () => ({ fetchStooqUsQuote: mocks.stooq }));
vi.mock('@/lib/market-data/data912-client', () => ({ loadArgentineQuotes: mocks.arg }));
import { transactionsService, buildToArsConverter } from '@/lib/services/transactions';
import { investmentsService } from '@/lib/services/investments';

type Reply = { data?: any; error?: any };
let replies: Reply[];
let writes: Array<{ table: string; operation: string; value: any }>;
function query(table: string, reply: Reply) {
  const q: any = {};
  for (const key of ['select', 'eq', 'in', 'order', 'gte', 'lt', 'or', 'limit', 'maybeSingle']) {
    q[key] = vi.fn(() => key === 'maybeSingle' ? Promise.resolve(reply) : q);
  }
  for (const operation of ['insert', 'update', 'upsert']) {
    q[operation] = vi.fn((value: any) => { writes.push({ table, operation, value }); return q; });
  }
  q.single = vi.fn(async () => reply);
  q.then = (resolve: any, reject: any) => Promise.resolve(reply).then(resolve, reject);
  return q;
}
beforeEach(() => {
  vi.clearAllMocks();
  replies = []; writes = [];
  mocks.client.from.mockImplementation((table: string) => {
    const reply = replies.shift();
    if (!reply) throw new Error(`Unexpected query ${table}`);
    return query(table, reply);
  });
  mocks.dolar.mockResolvedValue({ blue: { sell: 1200, buy: 1150 } });
  mocks.fx.mockResolvedValue(1200);
  mocks.yahoo.mockResolvedValue(new Map());
  mocks.stooq.mockResolvedValue(null);
  mocks.arg.mockResolvedValue({ byStock: new Map(), byCedear: new Map(), byBond: new Map() });
});
const tx = { userId:'U1', type:'expense' as const, accountId:'A', amount:1500, currency:'ARS' };
const account = (id='A', currency='ARS') => ({ id, user_id:'U1', currency, is_active:true });

// Exact v2.13 contract fixtures. Database/provider accesses are doubles here;
// effects/ownership are independently covered by the full-schema SQL suite.
describe('v2.13 transfer case contracts', () => {
 const run = async (currency: string, destinationCurrency: string, amount: number, rate = 1) => {
  replies = [{ data: account('A',currency) }, { data: account('B',destinationCurrency) }, { data: { id: 'T1' } }];
  await transactionsService.create({ ...tx, type:'transfer', destinationAccountId:'B', currency, amount, exchangeRateOverride:rate });
  return writes[0].value;
 };
 it.each([
  ['CB-T01','ARS','ARS',1500,1,10000,2000,1500,8500,3500],
  ['CB-T02','ARS','USD',120000,1/1200,200000,50,100,80000,150],
  ['CB-T08','ARS','ARS',1500,1,1500,2000,1500,0,3500],
  ['CB-T09','ARS','ARS',1500,1,1499.99,2000,1500,-0.01,3500],
  ['CB-T10','USD','BTC',0.01,0.000001,1,0,0.00000001,0.99,0.00000001],
  ['CB-T11','ARS','USD',1,0.005,10,0,0.01,9,0.01],
 ] as const)('%s authoritative transfer amounts', async (_id,currency,destination,amount,rate,sourceBalance,destBalance,credit,sourceAfter,destAfter) => {
   const row=await run(currency,destination,amount,rate);
   expect(row.amount_in_account_currency).toBe(amount);expect(row.destination_amount_in_account_currency).toBe(credit);
   expect(sourceBalance-row.amount_in_account_currency).toBeCloseTo(sourceAfter,8);
   expect(destBalance+row.destination_amount_in_account_currency).toBeCloseTo(destAfter,8);
 });
 it.each([['CB-T03',0],['CB-T04',-1],['CB-T12',0.001],['CB-T12',NaN],['CB-T12',Infinity]] as const)('%s rejects invalid amount %s',async(_id,amount)=>{
  await expect(transactionsService.create({...tx,type:'transfer',destinationAccountId:'B',amount})).rejects.toThrow();expect(writes).toHaveLength(0);
 });
 it('CB-T05 rejects identical account identifiers',async()=>{await expect(transactionsService.create({...tx,type:'transfer',destinationAccountId:'A'})).rejects.toThrow();expect(writes).toHaveLength(0);});
 it('CB-T06 cannot resolve a foreign account under the user-scoped lookup',async()=>{
  replies=[{data:account()},{data:null,error:{message:'not found'}}];await expect(transactionsService.create({...tx,type:'transfer',destinationAccountId:'foreign'})).rejects.toThrow();expect(writes).toHaveLength(0);
  const destinationQuery=mocks.client.from.mock.results[1].value;expect(destinationQuery.eq).toHaveBeenCalledWith('user_id','U1');
 });
 it('CB-T07 rejects zero FX rate',async()=>{await expect(run('ARS','USD',1,0)).rejects.toThrow();expect(writes).toHaveLength(0);});
 it('CB-T13 rejects rounded-zero destination credit',async()=>{await expect(run('ARS','USD',0.01,0.0001)).rejects.toThrow();expect(writes).toHaveLength(0);});
});
const inv={id:'I1',user_id:'U1',account_id:'A',type:'stock_us',ticker:null,name:'Synthetic',quantity:6,purchase_price:100,purchase_currency:'USD',purchase_date:'2026-10-01',is_active:true,current_price:110,current_price_updated_at:'2026-10-06T12:00:00Z',is_manual_price:true,market_currency:'USD'};
describe('v2.13 investment valuation contracts',()=>{
 it.each([
  ['CB-P01',10,100,110,'USD',1000,1100,100,0],
  ['CB-P02',6,100,110,'USD',600,660,60,80],
  ['CB-P09',6,100,90,'USD',600,540,-60,0],
  ['CB-P10',6,100000,100,'ARS',500,600,100,0],
 ] as const)('%s valuation and retained basis',async(_id,quantity,purchase_price,current_price,purchase_currency,cost,value,profit,realized)=>{
  replies=[{data:[{...inv,quantity,purchase_price,current_price,purchase_currency}]},{data:realized?[{investment_id:'I1',realized_pnl_usd:realized}]:[]}];
  const [p]=await investmentsService.list('U1');expect(p.cost_basis_usd).toBeCloseTo(cost,8);expect(p.market_value_usd).toBeCloseTo(value,8);expect(p.profit_loss_usd).toBeCloseTo(profit,8);expect(p.realized_pnl_usd).toBe(realized);
 });
 it('CB-P06 preserves independent lots after a later purchase',async()=>{
  replies=[{data:[inv,{...inv,id:'I2',quantity:4,purchase_price:200,current_price:150},{...inv,id:'dummy',quantity:0}].slice(0,2).map(x=>({...x,current_price:150}))},{data:[{investment_id:'I1',realized_pnl_usd:80}]}];
  const p=await investmentsService.list('U1');expect(p.reduce((n,x)=>n+x.quantity,0)).toBe(10);expect(p.reduce((n,x)=>n+x.cost_basis_usd,0)).toBe(1400);expect(p.reduce((n,x)=>n+x.market_value_usd,0)).toBe(1500);expect(p.reduce((n,x)=>n+x.profit_loss_usd,0)).toBe(100);expect(p[0].purchase_price).toBe(100);
 });
 it('CB-P07 explicitly labels the purchase reference without fabricated timestamp',async()=>{
  replies=[{data:[{...inv,current_price:null,is_manual_price:false}]},{data:[]}];const[p]=await investmentsService.list('U1');expect(p.market_value_usd).toBe(600);expect(p.profit_loss_usd).toBe(0);expect(p.valuation_price_source).toBe('purchase_reference');expect(p.current_price_updated_at).toBeNull();
 });
 it('CB-P08 retains price provenance and prior timestamp when providers fail',async()=>{
  replies=[{data:[{...inv,ticker:'MISSING',is_manual_price:false}]},{data:[]}];const[p]=await investmentsService.list('U1');expect(p.market_value_usd).toBe(660);expect(p.profit_loss_usd).toBe(60);expect(p.valuation_price_source).toBe('cache');expect(p.current_price_updated_at).toBe(inv.current_price_updated_at);
 });
 it('CB-P05 rejects invalid purchase inputs before any database write',async()=>{
  for(const [quantity,purchasePrice] of [[0,100],[-1,100],[1,0]])await expect(investmentsService.create({userId:'U1',accountId:'A',type:'stock_us',name:'Synthetic',quantity,purchasePrice,purchaseCurrency:'USD',purchaseDate:'2026-10-06'})).rejects.toThrow();expect(writes).toHaveLength(0);
 });
 it('CB-P04 rejects sale beyond current holdings before calling write RPC',async()=>{
  replies=[{data:inv}];await expect(investmentsService.sell({userId:'U1',investmentId:'I1',quantity:7,price:120,currency:'USD',soldAt:'2026-10-06'})).rejects.toThrow('más');expect(mocks.client.rpc).not.toHaveBeenCalled();
 });
});
