import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  client: { from: vi.fn(), rpc: vi.fn() },
  fx: vi.fn(), dolar: vi.fn(), crypto: vi.fn(), yahoo: vi.fn(), stooq: vi.fn(), arg: vi.fn(),
}));
vi.mock('@/lib/supabase/server', () => ({ createServiceClientSync: () => mocks.client }));
vi.mock('@/lib/services/accounts', () => ({ accountsService: {}, normalizeDebtBalanceForStorage: vi.fn() }));
vi.mock('@/lib/services/cotizaciones', () => ({ cotizacionesService: {
  getExchangeRate: mocks.fx, getDolarQuotes: mocks.dolar, getCryptoQuote: mocks.crypto,
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

describe('CU-001 financial regressions', () => {
  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY, 0.001])('rejects invalid amount %s before writing', async amount => {
    await expect(transactionsService.create({ ...tx, amount })).rejects.toThrow();
    expect(mocks.client.from).not.toHaveBeenCalled();
  });
  it.each([0, 1.5, 37, Number.NaN])('rejects invalid installment count %s', async installments => {
    await expect(transactionsService.create({ ...tx, installments })).rejects.toThrow('cuotas');
    expect(mocks.client.rpc).not.toHaveBeenCalled();
  });
  it('does not convert a transfer into an installment expense', async () => {
    await expect(transactionsService.create({ ...tx, type:'transfer', destinationAccountId:'B', installments:2 }))
      .rejects.toThrow('sólo');
    expect(mocks.client.rpc).not.toHaveBeenCalled();
  });
  it('rejects a transfer to the same account', async () => {
    await expect(transactionsService.create({ ...tx, type:'transfer', destinationAccountId:'A' })).rejects.toThrow('distintas');
  });
  it('does not treat USD as ARS when both accounts are ARS', async () => {
    replies = [{ data:account() }, { data:account('B') }];
    await expect(transactionsService.create({ ...tx, type:'transfer', destinationAccountId:'B', currency:'USD' })).rejects.toThrow('moneda');
    expect(writes).toEqual([]);
  });
  it('records one transfer with source and destination impacts encoded correctly', async () => {
    replies = [{ data:account() }, { data:account('B','USD') }, { data:{ id:'T1' } }];
    await transactionsService.create({ ...tx, type:'transfer', destinationAccountId:'B', amount:120000, exchangeRateOverride:1/1200 });
    expect(writes).toHaveLength(1);
    expect(writes[0].value).toMatchObject({ type:'transfer', amount:120000, amount_in_account_currency:120000 });
    expect(writes[0].value.destination_amount_in_account_currency).toBe(100);
    expect(writes[0].value.amount * writes[0].value.exchange_rate).toBeCloseTo(100, 8);
  });
  it('allows a destination-denominated transfer without converting twice', async () => {
    replies = [{ data:account() }, { data:account('B','USD') }, { data:{ id:'T1' } }];
    await transactionsService.create({ ...tx, type:'transfer', destinationAccountId:'B', amount:100, currency:'USD', exchangeRateOverride:1200 });
    expect(writes[0].value).toMatchObject({ amount:100, amount_in_account_currency:120000, exchange_rate:null });
  });
  it('persists an exact destination for a large inverse-rate transfer', async () => {
    replies = [{ data:account() }, { data:account('B','USD') }, { data:{ id:'T1' } }];
    await transactionsService.create({ ...tx, type:'transfer', destinationAccountId:'B', amount:120000000, exchangeRateOverride:1/1200 });
    expect(writes[0].value.destination_amount_in_account_currency).toBe(100000);
  });
  it('rejects a conversion whose debit rounds to zero', async () => {
    replies = [{ data:account('A','USD') }];
    mocks.fx.mockResolvedValue(1/1200);
    await expect(transactionsService.create({ ...tx, amount:0.01 })).rejects.toThrow('convertido');
    expect(writes).toEqual([]);
  });
  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])('does not apply invalid FX %s', async rate => {
    replies = [{ data:account('A','USD') }]; mocks.fx.mockResolvedValue(rate);
    await expect(transactionsService.create(tx)).rejects.toThrow('cotización');
    expect(writes).toEqual([]);
  });
  it('normalizes spaces in converter currencies and excludes non-positive quotes', async () => {
    mocks.fx.mockResolvedValue(0);
    const result = await buildToArsConverter([{ currency:' ars ' }, { currency:' usd ' }]);
    expect(result.toArs({ amount:25, currency:' ars ' })).toBe(25);
    expect(result.toArs({ amount:100, currency:'USD' })).toBeNull();
    expect(result.excludedCurrencies).toEqual(['USD']);
  });
});

const inv = { id:'I1', user_id:'U1', account_id:'A', type:'stock_us', ticker:'AAPL', name:'Apple',
  quantity:6, purchase_price:100, purchase_currency:'USD', purchase_date:'2026-10-01', is_active:true,
  current_price:110, current_price_updated_at:'2026-10-06T12:00:00Z', is_manual_price:true, market_currency:'USD' };

describe('CU-004 financial regressions', () => {
  it('preserves remaining lot cost and separates realized/non-realized profit', async () => {
    replies = [{ data:[inv] }, { data:[{ investment_id:'I1', realized_pnl_usd:80 }] }];
    const [position] = await investmentsService.list('U1');
    expect(position).toMatchObject({ quantity:6, cost_basis_usd:600, market_value_usd:660,
      profit_loss_usd:60, realized_pnl_usd:80, valuation_price_source:'manual' });
  });
  it('marks purchase price fallback as a reference instead of a current quote', async () => {
    replies = [{ data:[{ ...inv, ticker:null, current_price:null, is_manual_price:false }] }, { data:[] }];
    const [position] = await investmentsService.list('U1');
    expect(position.valuation_price_source).toBe('purchase_reference');
    expect(position.market_value_usd).toBe(600);
    expect(position.current_price_updated_at).toBeNull();
  });
  it('keeps the currency of the purchase reference for a USD-quoted stock bought in EUR', async () => {
    replies = [{ data:[{ ...inv, ticker:null, purchase_currency:'EUR', current_price:null, is_manual_price:false }] }, { data:[] }];
    mocks.fx.mockResolvedValue(1.1);
    const [position] = await investmentsService.list('U1');
    expect(position.market_price_currency).toBe('EUR');
    expect(position.cost_basis_usd).toBeCloseTo(660,8);
    expect(position.market_value_usd).toBeCloseTo(660,8);
    expect(position.profit_loss_usd).toBe(0);
  });
  it('uses and persists the provider currency for a bond quoted in ARS and purchased in USD', async () => {
    replies = [{ data:[{ ...inv, type:'bond', ticker:'AL30', quantity:1000, market_currency:null,
      current_price:null, current_price_updated_at:null, is_manual_price:false }] }, { data:[] }, { data:null }];
    mocks.arg.mockResolvedValue({ byStock:new Map(),byCedear:new Map(),
      byBond:new Map([['AL30',{ price:60000,changePct:2,currency:'ARS' }]]) });
    const [position] = await investmentsService.list('U1');
    expect(position.market_price_currency).toBe('ARS');
    expect(position.cost_basis_usd).toBe(1000);
    expect(position.market_value_usd).toBe(500);
    expect(position.profit_loss_usd).toBe(-500);
    expect(writes[0].value).toMatchObject({ current_price:60000,market_currency:'ARS' });
  });
  it('converts an ARS data912 quote to USD when the position is booked in USD', async () => {
    replies = [{ data:[{ ...inv, type:'bond', ticker:'AL30', quantity:1000, market_currency:'USD',
      current_price:null, current_price_updated_at:null, is_manual_price:false }] }, { data:[] }, { data:null }];
    mocks.dolar.mockResolvedValue({ blue:{ sell:1200, buy:1150 }, mep:{ sell:1200, buy:1150 } });
    mocks.arg.mockResolvedValue({ byStock:new Map(),byCedear:new Map(),
      byBond:new Map([['AL30',{ price:60000,changePct:2,currency:'ARS' }]]) });
    const [position] = await investmentsService.list('U1');
    expect(position.market_price_currency).toBe('USD');
    expect(writes[0].value).toMatchObject({ current_price:50, market_currency:'USD' });
  });
  it('does not value ARS holdings with a fake rate of 1', async () => {
    replies = [{ data:[{ ...inv, purchase_currency:'ARS', market_currency:'ARS' }] }, { data:[] }];
    mocks.dolar.mockResolvedValue({ blue:{ sell:0,buy:0 } });
    const [position] = await investmentsService.list('U1');
    expect(position).toMatchObject({ current_value_native:660, market_value_usd:null, cost_basis_usd:null, fxUnavailable:true });
    expect(writes).toHaveLength(0);
  });
  it('does not replace missing EUR FX with zero cost/value', async () => {
    replies = [{ data:[{ ...inv, purchase_currency:'EUR' }] }, { data:[] }];
    mocks.fx.mockRejectedValue(new Error('offline'));
    const [position] = await investmentsService.list('U1');
    expect(position).toMatchObject({ cost_basis_usd:null, profit_loss_usd:null, market_value_usd:660, fxUnavailable:true });
    expect(writes).toHaveLength(0);
  });
  it('does not hide a failed sales history query as zero realized profit', async () => {
    replies = [{ data:[inv] }, { error:{ message:'sales offline' } }];
    await expect(investmentsService.list('U1')).rejects.toMatchObject({ message:'sales offline' });
  });
  it('stores EUR realized profit in EUR and its USD equivalent separately', async () => {
    replies = [{ data:{ ...inv, quantity:10, purchase_price:100, purchase_currency:'EUR' } }];
    mocks.fx.mockResolvedValue(1.2);
    mocks.client.rpc.mockResolvedValue({ data:{ sale:{ id:'S1' }, remaining_quantity:6, position_closed:false } });
    await investmentsService.sell({ userId:'U1', investmentId:'I1', quantity:4, price:120, currency:'EUR', soldAt:'2026-10-06' });
    expect(mocks.client.rpc).toHaveBeenCalledWith('sell_investment_once', expect.objectContaining({
      p_sale: expect.objectContaining({ p_realized_pnl_native:80, p_realized_pnl_usd:96 }),
    }));
  });
  it('keeps bond prices per VN100 in realized profit', async () => {
    replies = [{ data:{ ...inv, type:'bond', quantity:1000, purchase_price:100 } }];
    mocks.client.rpc.mockResolvedValue({ data:{ sale:{ id:'S1' }, remaining_quantity:600, position_closed:false } });
    await investmentsService.sell({ userId:'U1', investmentId:'I1', quantity:400, price:120, currency:'USD', soldAt:'2026-10-06' });
    expect(mocks.client.rpc).toHaveBeenCalledWith('sell_investment_once', expect.objectContaining({ p_sale: expect.objectContaining({ p_realized_pnl_usd:80 }) }));
  });
  it('rejects a sale larger than the current holding before invoking RPC', async () => {
    replies = [{ data:inv }];
    await expect(investmentsService.sell({ userId:'U1', investmentId:'I1', quantity:7, price:120, currency:'USD', soldAt:'2026-10-06' }))
      .rejects.toThrow('más de lo que tenés');
    expect(mocks.client.rpc).not.toHaveBeenCalled();
  });
  it('rejects a missing manual price before persistence', async () => {
    await expect(investmentsService.create({ userId:'U1', accountId:'A', type:'stock_us', name:'Apple', quantity:5,
      purchasePrice:100, purchaseCurrency:'USD', purchaseDate:'2026-10-06', isManualPrice:true }))
      .rejects.toThrow('precio manual');
    expect(mocks.client.from).not.toHaveBeenCalled();
  });
});

describe('transaction service durable request receipts', () => {
  it('uses the atomic RPC for a keyed request and never inserts separately', async () => {
    replies=[{ data:null },{ data:account() }];
    mocks.client.rpc.mockResolvedValue({ data:{ id:'T1' } });
    expect(await transactionsService.create({ ...tx, requestId:'manual:request:1' })).toEqual({ id:'T1' });
    expect(mocks.client.rpc).toHaveBeenCalledWith('create_transaction_once',expect.objectContaining({
      p_user_id:'U1',p_request_id:'manual:request:1',p_installments:1,
      p_request_hash:expect.stringMatching(/^[0-9a-f]{64}$/),p_transaction:expect.objectContaining({ amount:1500 }),
    }));
    expect(writes).toHaveLength(0);
  });
  it('returns a committed reply without account eligibility or FX reads',async()=>{
    const { transactionRequestHash }=await import('@/lib/transaction-idempotency');
    const input={ ...tx,requestId:'manual:request:1' };
    replies=[{ data:{ request_hash:transactionRequestHash(input),response:{ id:'T1' } } }];
    expect(await transactionsService.create(input)).toEqual({ id:'T1' });
    expect(mocks.client.from).toHaveBeenCalledTimes(1);expect(mocks.fx).not.toHaveBeenCalled();
  });
  it('does not retry via a raw insert after a receipt lookup or atomic RPC failure',async()=>{
    replies=[{ error:new Error('lookup unavailable') }];
    await expect(transactionsService.create({ ...tx,requestId:'manual:request:1' })).rejects.toThrow('lookup unavailable');
    expect(mocks.client.rpc).not.toHaveBeenCalled();expect(writes).toHaveLength(0);
  });
  it('maps the atomic race payload conflict to HTTP 409',async()=>{
    replies=[{ data:null },{ data:account() }];
    mocks.client.rpc.mockResolvedValue({ error:{ code:'Z0001' } });
    await expect(transactionsService.create({ ...tx,requestId:'manual:request:1' })).rejects.toMatchObject({status:409});
    expect(writes).toHaveLength(0);
  });
});


describe('portfolio quote cache keeps provider observation time', () => {
  const sourceTime = '2026-10-09T10:00:00.000Z';
  it('does not renew a crypto provider timestamp when displaying or caching its price', async () => {
    replies = [{ data: [{ ...inv, type: 'crypto', ticker: 'BTC', is_manual_price: false }] }, { data: [] }, { data: null }];
    mocks.crypto.mockResolvedValue({ priceUSD: 120, change24h: 2, timestamp: new Date(sourceTime) });
    const [position] = await investmentsService.list('U1', { forceRefreshQuotes: true });
    expect(position.current_price_updated_at).toBe(sourceTime);
    expect(writes[0].value).toMatchObject({ current_price: 120, current_price_updated_at: sourceTime });
  });
  it.each(['data912', 'yahoo', 'stooq'])('preserves a source timestamp supplied by %s', async provider => {
    const type = provider === 'data912' ? 'stock_arg' : 'stock_us';
    replies = [{ data: [{ ...inv, type, ticker: 'AAPL', is_manual_price: false }] }, { data: [] }, { data: null }];
    const quote = { price: 120, changePct: 2, currency: 'USD', timestamp: sourceTime };
    if (provider === 'data912') mocks.arg.mockResolvedValue({ byStock: new Map([['AAPL', quote]]), byCedear: new Map(), byBond: new Map() });
    if (provider === 'yahoo') mocks.yahoo.mockResolvedValue(new Map([['AAPL', quote]]));
    if (provider === 'stooq') mocks.stooq.mockResolvedValue(quote);
    const [position] = await investmentsService.list('U1', { forceRefreshQuotes: true });
    expect(position.current_price_updated_at).toBe(sourceTime);
    expect(writes[0].value.current_price_updated_at).toBe(sourceTime);
  });
  it.each(['data912', 'yahoo', 'stooq'])('uses fetch time when %s omits an observation timestamp', async provider => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-24T18:30:00.000Z'));
    const type = provider === 'data912' ? 'stock_arg' : 'stock_us';
    replies = [{ data: [{ ...inv, type, ticker: 'AAPL', is_manual_price: false }] }, { data: [] }, { data: null }];
    const quote = { price: 120, changePct: 2, currency: 'USD' };
    if (provider === 'data912') mocks.arg.mockResolvedValue({ byStock: new Map([['AAPL', quote]]), byCedear: new Map(), byBond: new Map() });
    if (provider === 'yahoo') mocks.yahoo.mockResolvedValue(new Map([['AAPL', quote]]));
    if (provider === 'stooq') mocks.stooq.mockResolvedValue(quote);
    try {
      const [position] = await investmentsService.list('U1', { forceRefreshQuotes: true });
      expect(position.current_price_updated_at).toBe('2026-10-24T18:30:00.000Z');
      expect(writes[0].value.current_price_updated_at).toBe('2026-10-24T18:30:00.000Z');
    } finally {
      vi.useRealTimers();
    }
  });
  it('keeps manual prices and their user-edit timestamp without a provider refresh', async () => {
    replies = [{ data: [inv] }, { data: [] }];
    const [position] = await investmentsService.list('U1', { forceRefreshQuotes: true });
    expect(position.current_price_updated_at).toBe(inv.current_price_updated_at);
    expect(position.valuation_price_source).toBe('manual');
    expect(writes).toHaveLength(0);
  });
});
