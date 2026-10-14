// Uses the IndexedDB API fixture and real queue sender with a deterministic server double.
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
const session = vi.hoisted(() => ({ owner: 'owner-a' }));
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({ auth: { getSession: async () => ({ data: { session: { user: { id: session.owner } } } }) } }) }));
import { dbGetAll, recoverFinancialOperation, submitFinancialOperation } from '@/lib/offline-transaction-store';
const payload = { accountId: 'account', type: 'stock_us', name: 'Apple', quantity: 10, purchasePrice: 100, purchaseCurrency: 'USD', purchaseDate: '2026-10-09' };
beforeEach(() => { session.owner = 'owner-a'; vi.stubGlobal('indexedDB', new IDBFactory()); vi.stubGlobal('window', new EventTarget()); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
it('persists investment creation before transmission and reuses the same key after a lost response/restart', async () => {
  const effects = new Map<string, string>(); let lost = true;
  const fetcher = vi.fn(async (endpoint: string, init: RequestInit) => {
    expect(endpoint).toBe('/api/investments');
    const headers = new Headers(init.headers), key = headers.get('Idempotency-Key')!;
    expect(headers.get('X-Queue-Owner')).toBe('owner-a');
    expect((await dbGetAll())[0].id).toBe(key);
    if (!effects.has(key)) effects.set(key, `investment-${effects.size + 1}`);
    if (lost) { lost = false; throw new Error('Response lost after commit'); }
    return new Response(JSON.stringify({ id: effects.get(key) }), { status: 201, headers: { 'Idempotency-Key': key } });
  });
  vi.stubGlobal('fetch', fetcher);
  const first = await submitFinancialOperation('/api/investments', payload, 'POST', undefined, 'investment:create');
  expect(first.state).toBe('pending'); expect(effects.size).toBe(1);
  const retry = await recoverFinancialOperation((await dbGetAll())[0].id);
  expect(retry.state).toBe('confirmed'); expect(retry.item.id).toBe(first.item.id); expect(effects.size).toBe(1);
  expect(await dbGetAll()).toEqual([]);
  const distinct = await submitFinancialOperation('/api/investments', payload, 'POST', undefined, 'investment:create');
  expect(distinct.state).toBe('confirmed'); expect(distinct.item.id).not.toBe(first.item.id); expect(effects.size).toBe(2);
});
it('retains investment request ownership after account switching', async () => {
  const fetcher = vi.fn().mockRejectedValue(new Error('Offline')); vi.stubGlobal('fetch', fetcher);
  const first = await submitFinancialOperation('/api/investments', payload, 'POST', undefined, 'investment:create');
  session.owner = 'owner-b';
  const retry = await submitFinancialOperation('/api/investments', payload, 'POST', first.item, 'investment:create');
  expect(retry.state).toBe('pending'); expect(fetcher).toHaveBeenCalledTimes(1);
  expect((await dbGetAll())[0].ownerId).toBe('owner-a');
});
