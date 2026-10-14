// Execute actual hooks/handlers with React lifecycle doubles, the IndexedDB API
// fixture and a deterministic financial server double. No browser/API DB claim.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
const session = vi.hoisted(() => ({ owner: 'user-a' }));
vi.mock('react', async importOriginal => ({
  ...await importOriginal<any>(),
  useEffect: () => undefined,
  useRef: (initial: any) => ({ current: initial }),
  useState: (initial: any) => [typeof initial === 'function' ? initial() : initial, vi.fn()],
  useCallback: (callback: any) => callback,
}));
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({ auth: {
  getSession: async () => ({ data: { session: session.owner ? { user: { id: session.owner } } : null } }),
} }) }));
import { dbConfirm, dbGetAll, enqueueOperation } from '@/lib/offline-transaction-store';
import { useFinancialOperation } from '@/lib/hooks/useFinancialOperation';
import { useOfflineQueue } from '@/lib/hooks/useOfflineQueue';
import { submitAccountCreation } from '@/lib/account-create-request';
import { QueueReview } from '@/components/offline/QueueReview';

const payload = { type: 'expense', accountId: 'account-a', amount: 25, currency: 'ARS' };
let effects: Map<string, string>;
let fetcher: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.clearAllMocks(); session.owner = 'user-a'; effects = new Map();
  vi.stubGlobal('indexedDB', new IDBFactory());
  vi.stubGlobal('window', new EventTarget());
  vi.stubGlobal('navigator', { onLine: true });
  fetcher = vi.fn(async (_url: string, init: RequestInit) => {
    const key = new Headers(init.headers).get('Idempotency-Key')!;
    if (!effects.has(key)) effects.set(key, `effect-${effects.size + 1}`);
    return new Response(JSON.stringify({ id: effects.get(key) }), { status: 201, headers: { 'Idempotency-Key': key } });
  });
  vi.stubGlobal('fetch', fetcher);
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function find(node: any, predicate: (node: any) => boolean): any {
  if (Array.isArray(node)) { for (const child of node) { const result = find(child, predicate); if (result) return result; } return null; }
  if (!node || typeof node !== 'object') return null;
  return predicate(node) ? node : find(node.props?.children, predicate);
}

describe('explicit intent at actual form handlers', () => {
  it('independent forms with identical scope and content create two effects; the original form retries only its own lost response', async () => {
    const transport = fetcher.getMockImplementation()! as (...args: any[]) => Promise<Response>;
    fetcher.mockImplementationOnce(async (...args) => { await transport(...args); throw new Error('Response lost after commit'); });
    const firstForm = useFinancialOperation('manual'), secondForm = useFinancialOperation('manual');
    const first = await firstForm.submit('/api/transactions', payload);
    expect(first?.state).toBe('pending');
    const independent = await secondForm.submit('/api/transactions', payload);
    expect(independent?.state).toBe('confirmed'); expect(independent?.item.id).not.toBe(first?.item.id);
    expect(effects.size).toBe(2);
    const retried = await firstForm.submit('/api/transactions', payload);
    expect(retried?.state).toBe('confirmed'); expect(retried?.item.id).toBe(first?.item.id);
    expect(effects.size).toBe(2); expect(await dbGetAll()).toEqual([]);
  });
  it('a double click of the same live form is blocked before persistence', async () => {
    const form = useFinancialOperation('manual');
    const first = form.submit('/api/transactions', payload);
    expect(await form.submit('/api/transactions', payload)).toBeNull();
    expect((await first)?.state).toBe('confirmed');
    expect(effects.size).toBe(1); expect(fetcher).toHaveBeenCalledOnce();
  });
  it('independent account form attempts can concurrently create identical legitimate accounts', async () => {
    const account = { name: 'Cuenta igual', type: 'bank', currency: 'ARS' };
    const results = await Promise.all([
      submitAccountCreation({}, account, { online: true }),
      submitAccountCreation({}, account, { online: true }),
    ]);
    expect(results.every(result => result.state === 'confirmed')).toBe(true);
    expect(effects.size).toBe(2);
    expect(new Set(fetcher.mock.calls.map(([, init]) => new Headers(init.headers).get('Idempotency-Key'))).size).toBe(2);
  });
});

describe('explicit selection in durable queue after remount', () => {
  it('queue UI retries its selected saved ID and original payload after a lost response', async () => {
    const item = await enqueueOperation('/api/transactions', payload, 'POST', 'manual');
    const transport = fetcher.getMockImplementation()! as (...args: any[]) => Promise<Response>;
    fetcher.mockImplementationOnce(async (...args) => { await transport(...args); throw new Error('Response lost'); });
    expect((await useOfflineQueue().retry(item.id))?.state).toBe('pending');
    const reopenedQueue = useOfflineQueue();
    const tree = QueueReview({ items: [{ ...item, payload: { ...payload, amount: 999 } }], discard: vi.fn(), retry: reopenedQueue.retry });
    const button = find(tree, node => node.type === 'button' && node.props.children === 'Reintentar esta solicitud');
    expect(button).not.toBeNull(); await button.props.onClick();
    expect(effects.size).toBe(1); expect(await dbGetAll()).toEqual([]);
    expect(fetcher.mock.calls.map(([, init]) => new Headers(init.headers).get('Idempotency-Key'))).toEqual([item.id, item.id]);
    expect(JSON.parse(fetcher.mock.calls[1][1].body).amount).toBe(25);
  });
  it('viewing the selected cached confirmation consumes it without another HTTP send', async () => {
    const item = await enqueueOperation('/api/accounts', { name: 'Cuenta confirmada' }, 'POST', '/api/accounts');
    await dbConfirm(item.id, { id: 'account-original' });
    const saved = (await dbGetAll())[0];
    const queue = useOfflineQueue();
    const tree = QueueReview({ items: [saved], discard: vi.fn(), retry: queue.retry });
    const button = find(tree, node => node.type === 'button' && node.props.children === 'Ver confirmación');
    expect(button).not.toBeNull(); await button.props.onClick();
    expect(fetcher).not.toHaveBeenCalled(); expect(await dbGetAll()).toEqual([]);
  });
  it('selection after a session switch never retries or removes the other owner intent', async () => {
    const item = await enqueueOperation('/api/transactions', payload, 'POST', 'manual');
    session.owner = 'user-b';
    expect(await useOfflineQueue().retry(item.id)).toBeNull();
    expect(fetcher).not.toHaveBeenCalled(); expect((await dbGetAll())[0].id).toBe(item.id);
  });
  it('a guest page can resume only an explicitly selected intent from its own group', async () => {
    const prefixA = `/api/shared/${'a'.repeat(32)}/expenses`, prefixB = `/api/shared/${'b'.repeat(32)}/expenses`;
    const item = await enqueueOperation(prefixA, { description: 'Cena', amount: 25 });
    expect(await useOfflineQueue(prefixB).retry(item.id)).toBeNull();
    expect(fetcher).not.toHaveBeenCalled(); expect(await dbGetAll()).toHaveLength(1);
    expect((await useOfflineQueue(prefixA).retry(item.id))?.state).toBe('confirmed');
    expect(fetcher.mock.calls[0][0]).toBe(prefixA); expect(await dbGetAll()).toEqual([]);
  });
  it('manual selection preserves the order of pending sales on the same position', async () => {
    const endpoint = '/api/investments/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/sell';
    const first = await enqueueOperation(endpoint, { quantity: 1 }), second = await enqueueOperation(endpoint, { quantity: 2 });
    const queue = useOfflineQueue();
    expect(await queue.retry(second.id)).toBeNull(); expect(fetcher).not.toHaveBeenCalled();
    expect((await queue.retry(first.id))?.state).toBe('confirmed');
    expect((await queue.retry(second.id))?.state).toBe('confirmed');
    expect(fetcher.mock.calls.map(([, init]) => new Headers(init.headers).get('Idempotency-Key'))).toEqual([first.id, second.id]);
  });
});
