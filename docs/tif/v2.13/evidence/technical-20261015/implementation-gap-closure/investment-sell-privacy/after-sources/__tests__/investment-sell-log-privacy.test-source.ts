import { formatWithOptions } from 'node:util';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({ user: vi.fn(), client: vi.fn(), sell: vi.fn(), list: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.client }));
vi.mock('@/lib/services/investments', () => ({ investmentsService: { sell: mocks.sell, listSales: mocks.list } }));
import { GET, POST } from '@/app/api/investments/[id]/sell/route';
import { ApiError } from '@/lib/api-handler';

const OWNER = 'f398ab70-a3bc-4767-9c12-12cd4d1ebd76';
const POSITION = '8e32e366-a117-485a-a57a-582b4917302f';
const REQUEST = '36aa2ecd-ac0c-454e-a270-572079595eac';
const CANARY = 'sell-privacy-fixture-secret';
const TEXT = 'sell-privacy-fixture-financial-text';

beforeEach(() => {
  vi.resetAllMocks();
  mocks.user.mockResolvedValue({ data: { user: { id: OWNER } }, error: null });
  mocks.client.mockResolvedValue({ auth: { getUser: mocks.user } });
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('External network is forbidden in these local tests')));
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'info').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

async function submit() {
  return POST(new NextRequest(`http://localhost/api/investments/${POSITION}/sell`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': REQUEST },
    body: JSON.stringify({ quantity: 6, price: 120, currency: 'USD', soldAt: '2026-10-06' }),
  }), { params: Promise.resolve({ id: POSITION }) });
}

function sensitive(error: Error) {
  Object.defineProperties(error, {
    stack: { value: `${error.name}: ${CANARY}\n at fixture (${TEXT})`, configurable: true },
    cause: { value: new Error(`${CANARY} ${TEXT}`), configurable: true },
    request: { value: { headers: { Authorization: `Bearer ${CANARY}` }, notes: TEXT }, configurable: true },
  });
  return error;
}

function assertOnlySafeLogs(label: string) {
  // showHidden includes non-enumerable Error.message/stack/cause/request.
  const output = [console.error, console.warn, console.info, console.log]
    .flatMap(spy => vi.mocked(spy).mock.calls)
    .map(call => formatWithOptions({ showHidden: true, depth: 8 }, ...call)).join('\n');
  expect(output).not.toContain(CANARY);
  expect(output).not.toContain(TEXT);
  expect(console.error).toHaveBeenCalledWith(label);
  expect(mocks.client).toHaveBeenCalledTimes(1);
  expect(mocks.user).toHaveBeenCalledTimes(1);
  expect(fetch).not.toHaveBeenCalled();
}

function assertSellCommand() {
  expect(mocks.sell).toHaveBeenCalledExactlyOnceWith({
    requestId: REQUEST, userId: OWNER, investmentId: POSITION, quantity: 6,
    price: 120, currency: 'USD', soldAt: '2026-10-06', notes: undefined,
  });
  expect(mocks.list).not.toHaveBeenCalled();
}

describe('investment sell error log privacy (real route, Auth/service doubles)', () => {
  it('keeps the known oversell rejection400 and public body without logging hidden error fields', async () => {
    mocks.sell.mockRejectedValue(sensitive(new ApiError('Cantidad insuficiente para vender', 400)));
    const response = await submit();
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'Cantidad insuficiente para vender' });
    assertOnlySafeLogs('investments sell error:');
    assertSellCommand();
  });

  it('keeps an unknown error500 generic without logging provider message, stack, cause or request', async () => {
    mocks.sell.mockRejectedValue(sensitive(new Error(`${CANARY} ${TEXT}`)));
    const response = await submit();
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'Ocurrió un error procesando la solicitud.' });
    assertOnlySafeLogs('investments sell error:');
    assertSellCommand();
  });

  it('keeps sales read failure500 generic without logging hidden provider fields or running a sale', async () => {
    mocks.list.mockRejectedValue(sensitive(new Error(`${CANARY} ${TEXT}`)));
    const response = await GET(new NextRequest(`http://localhost/api/investments/${POSITION}/sell`),
      { params: Promise.resolve({ id: POSITION }) });
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'Ocurrió un error procesando la solicitud.' });
    assertOnlySafeLogs('investments sales list error:');
    expect(mocks.list).toHaveBeenCalledExactlyOnceWith(OWNER, POSITION);
    expect(mocks.sell).not.toHaveBeenCalled();
  });
});
