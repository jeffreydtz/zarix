import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn(), dolar: vi.fn(), fx: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createServiceClientSync: () => ({ from: mocks.from, rpc: mocks.rpc }) }));
vi.mock('@/lib/services/cotizaciones', () => ({ cotizacionesService: { getDolarQuotes: mocks.dolar, getExchangeRate: mocks.fx } }));
vi.mock('@/lib/yahoo-finance-quotes', () => ({ fetchYahooStockQuotesMap: vi.fn() }));
vi.mock('@/lib/stooq-us-quote', () => ({ fetchStooqUsQuote: vi.fn() }));
vi.mock('@/lib/market-data/data912-client', () => ({ loadArgentineQuotes: vi.fn() }));
import { investmentsService } from '@/lib/services/investments';
import { transactionRequestHash } from '@/lib/transaction-idempotency';
import { withFinancialRequestContext } from '@/lib/financial-request-context';
import { errorResponse } from '@/lib/api-handler';
const position = { id: 'position', user_id: 'owner', type: 'bond', quantity: 1000,
  purchase_price: 100, purchase_currency: 'USD' };
const sale = { requestId: 'sale:request:1', userId: 'owner', investmentId: 'position', quantity: 400,
  price: 120, currency: 'USD', soldAt: '2026-10-09' };
const create = { requestId: 'create:request:1', userId: 'owner', accountId: 'account', type: 'stock_us' as const,
  name: 'Apple', quantity: 10, purchasePrice: 100, purchaseCurrency: 'USD', purchaseDate: '2026-10-09' };
let replies: Array<{ data?: any; error?: any }>;
let inserts: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.clearAllMocks(); replies = []; inserts = vi.fn();
  mocks.from.mockImplementation(() => {
    const result = replies.shift(); if (!result) throw new Error('Unexpected database read');
    const q: any = { insert: inserts };
    for (const key of ['select', 'eq']) q[key] = vi.fn(() => q);
    q.single = q.maybeSingle = vi.fn(async () => result);
    return q;
  });
  mocks.dolar.mockResolvedValue({ blue: { sell: 1200, buy: 1150 } });
  mocks.rpc.mockResolvedValue({ data: { sale: { id: 'sale-id' }, remaining_quantity: 600, position_closed: false } });
});

describe('investment sale basis and receipt boundaries', () => {
  it('reports early excessive quantity as HTTP400 without quote lookup or mutation', async () => {
    replies = [{ data: null }, { data: position }];
    const response = await investmentsService.sell({ ...sale, quantity: 1001 }).catch(errorResponse);
    expect(response).toHaveProperty('status', 400);
    expect(mocks.dolar).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(inserts).not.toHaveBeenCalled();
  });
  it('reports the locked RPC excessive-quantity rejection as HTTP400', async () => {
    replies = [{ data: null }, { data: position }];
    mocks.rpc.mockResolvedValue({ error: { code: 'P0001', message: 'CANTIDAD_INSUFICIENTE' } });
    const response = await investmentsService.sell(sale).catch(errorResponse);
    expect(response).toHaveProperty('status', 400);
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(inserts).not.toHaveBeenCalled();
  });
  it('sends exact purchase price, currency and type alongside the computed P&L to the locked RPC', async () => {
    replies = [{ data: null }, { data: position }];
    await investmentsService.sell(sale);
    expect(mocks.rpc).toHaveBeenCalledWith('sell_investment_once', expect.objectContaining({
      p_user_id: 'owner', p_request_id: sale.requestId, p_request_hash: transactionRequestHash(sale),
      p_sale: expect.objectContaining({ p_expected_purchase_price: 100, p_expected_purchase_currency: 'USD',
        p_expected_type: 'bond', p_realized_pnl_native: 80, p_realized_pnl_usd: 80 }),
    }));
  });
  it('returns a retryable conflict when a concurrent edit invalidates the calculated basis', async () => {
    replies = [{ data: null }, { data: position }];
    mocks.rpc.mockResolvedValue({ error: { code: 'Z0002', message: 'Investment cost basis changed' } });
    await expect(investmentsService.sell(sale)).rejects.toMatchObject({ status: 409, message: expect.stringContaining('base de compra cambió') });
    expect(mocks.rpc).toHaveBeenCalledTimes(1); expect(inserts).not.toHaveBeenCalled();
  });
  it('replays a receipt before position, quantity or external quote lookup', async () => {
    const response = { sale: { id: 'sale-id' }, remaining_quantity: 0, position_closed: true };
    replies = [{ data: { request_hash: transactionRequestHash(sale), response } }];
    expect(await investmentsService.sell(sale)).toEqual({ sale: response.sale, remainingQuantity: 0, positionClosed: true });
    expect(mocks.from).toHaveBeenCalledTimes(1); expect(mocks.dolar).not.toHaveBeenCalled(); expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it('routes even legacy internal callers through the basis-checked receipt boundary', async () => {
    replies = [{ data: position }];
    await investmentsService.sell({ ...sale, requestId: undefined });
    expect(mocks.rpc).toHaveBeenCalledWith('sell_investment_once', expect.objectContaining({ p_request_id: expect.stringMatching(/^[0-9a-f-]{36}$/) }));
  });
  it('keeps omitted sale date out of the intent hash so a midnight retry can replay', async () => {
    const input = { ...sale, soldAt: undefined };
    replies = [{ data: null }, { data: position }];
    await investmentsService.sell(input);
    const parameters = mocks.rpc.mock.calls[0][1];
    expect(parameters.p_request_hash).toBe(transactionRequestHash(input));
    expect(parameters.p_sale.p_sold_at).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('investment creation durable receipts', () => {
  it('uses the atomic create RPC with original intent and never a plain investment insert', async () => {
    replies = [{ data: null }, { data: { id: 'account', is_active: true, type: 'investment' } }];
    mocks.rpc.mockResolvedValue({ data: { id: 'created-investment' } });
    expect(await investmentsService.create(create)).toEqual({ id: 'created-investment' });
    expect(mocks.rpc).toHaveBeenCalledWith('create_investment_once', expect.objectContaining({
      p_request_id: create.requestId, p_request_hash: transactionRequestHash(create),
      p_investment: expect.objectContaining({ user_id: 'owner', account_id: 'account', quantity: 10, purchase_price: 100 }),
    }));
    expect(inserts).not.toHaveBeenCalled();
  });
  it('replays before account eligibility lookup even when the original lot is now deleted', async () => {
    const response = { id: 'deleted-lot' };
    replies = [{ data: { request_hash: transactionRequestHash(create), response } }];
    expect(await investmentsService.create(create)).toEqual(response);
    expect(mocks.from).toHaveBeenCalledTimes(1); expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it('rejects a reused request with changed purchase details', async () => {
    replies = [{ data: { request_hash: transactionRequestHash(create), response: { id: 'original' } } }];
    await expect(investmentsService.create({ ...create, quantity: 11 })).rejects.toMatchObject({ status: 409 });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it('maps a concurrent request payload conflict and never falls back to raw insertion', async () => {
    replies = [{ data: null }, { data: { id: 'account', is_active: true, type: 'investment' } }];
    mocks.rpc.mockResolvedValue({ error: { code: 'Z0001' } });
    await expect(investmentsService.create(create)).rejects.toMatchObject({ status: 409 });
    expect(inserts).not.toHaveBeenCalled();
  });
  it('does not continue when the receipt lookup is unavailable', async () => {
    replies = [{ error: new Error('Receipt lookup unavailable') }];
    await expect(investmentsService.create(create)).rejects.toThrow('Receipt lookup unavailable');
    expect(mocks.rpc).not.toHaveBeenCalled(); expect(inserts).not.toHaveBeenCalled();
  });
  it('inherits a stable internal event key when the caller provides a request context', async () => {
    const input = { ...create, requestId: undefined };
    const response = { id: 'created-investment' };
    replies = [{ data: { request_hash: transactionRequestHash(input), response } }];
    expect(await withFinancialRequestContext('event:investment', () => investmentsService.create(input))).toEqual(response);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
