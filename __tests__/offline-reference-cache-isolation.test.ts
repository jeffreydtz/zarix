import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const auth = vi.hoisted(() => ({ owner: 'user-a' as string | null, error: null as Error | null,
  lookup: null as null | (() => Promise<any>),
  listeners: [] as Array<(event: string, session: any) => void> }));
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({ auth: {
  getSession: async () => auth.lookup ? auth.lookup() : ({ data: { session: auth.owner ? { user: { id: auth.owner } } : null }, error: auth.error }),
  onAuthStateChange: (listener: (event: string, session: any) => void) => {
    auth.listeners.push(listener); return { data: { subscription: { unsubscribe: vi.fn() } } };
  },
} }) }));
const categoryA = [{ id: 'category-a', name: 'Categoría privada A' }];
const categoryB = [{ id: 'category-b', name: 'Categoría privada B' }];
let cache: typeof import('@/lib/offline-reference-cache');
let fetcher: ReturnType<typeof vi.fn>;
function changeOwner(owner: string | null) {
  auth.owner = owner;
  for (const listener of auth.listeners) listener(owner ? 'SIGNED_IN' : 'SIGNED_OUT', owner ? { user: { id: owner } } : null);
}
beforeEach(async () => {
  vi.resetModules(); auth.owner = 'user-a'; auth.error = null; auth.lookup = null; auth.listeners = [];
  const values = new Map<string, string>();
  vi.stubGlobal('window', new EventTarget()); vi.stubGlobal('navigator', { onLine: true });
  vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) });
  fetcher = vi.fn(async () => new Response(JSON.stringify(auth.owner === 'user-a' ? categoryA : categoryB), { status: 200 }));
  vi.stubGlobal('fetch', fetcher);
  cache = await import('@/lib/offline-reference-cache');
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('offline references belong to the current authenticated identity', () => {
  it('a fresh two-minute category snapshot from A cannot satisfy B request in the same browser', async () => {
    expect(await cache.fetchReferenceList('/api/categories')).toEqual(categoryA);
    changeOwner('user-b');
    expect(await cache.fetchReferenceList('/api/categories')).toEqual(categoryB);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('anonymous/offline access cannot reuse the former authenticated snapshot', async () => {
    await cache.fetchReferenceList('/api/categories');
    changeOwner(null); vi.stubGlobal('navigator', { onLine: false });
    fetcher.mockRejectedValue(new Error('Offline'));
    expect(await cache.fetchReferenceList('/api/categories')).toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('a late request for A is not shared with B and cannot return or persist A rows after switching', async () => {
    let release!: () => void;
    const delayed = new Promise<Response>(resolve => { release = () => resolve(new Response(JSON.stringify(categoryA), { status: 200 })); });
    fetcher.mockImplementationOnce(() => delayed);
    const first = cache.fetchReferenceList('/api/categories');
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
    changeOwner('user-b');
    const second = cache.fetchReferenceList('/api/categories');
    release();
    expect(await first).toBeNull(); expect(await second).toEqual(categoryB);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(cache.getOfflineCachedCategories('user-b')).toEqual(categoryB);
    expect(cache.getOfflineCachedCategories('user-a')).toEqual([]);
  });
  it('offline fallback preserves only the current owner snapshot and never adopts another owner', async () => {
    await cache.fetchReferenceList('/api/categories');
    vi.stubGlobal('navigator', { onLine: false }); fetcher.mockRejectedValue(new Error('Offline'));
    const unavailable = await cache.fetchReferenceList('/api/categories', { force: true });
    expect(cache.pickReferenceList(unavailable, cache.getOfflineCachedCategories('user-a'))).toEqual(categoryA);
    changeOwner('user-b');
    expect(await cache.fetchReferenceList('/api/categories')).toBeNull();
    expect(cache.getOfflineCachedCategories('user-b')).toEqual([]);
    expect(cache.getOfflineCachedCategories('user-a')).toEqual([]);
    changeOwner('user-a');
    expect(await cache.fetchReferenceList('/api/categories')).toEqual(categoryA);
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
  it('an auth lookup error exposes no cached references and performs no private request', async () => {
    await cache.fetchReferenceList('/api/categories');
    auth.error = new Error('Synthetic session lookup error');
    expect(await cache.fetchReferenceList('/api/categories')).toBeNull();
    expect(cache.getOfflineCachedCategories('user-a')).toEqual([]);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('concurrent requests dedupe only within the same owner and session epoch', async () => {
    let release!: () => void;
    fetcher.mockImplementationOnce(() => new Promise<Response>(resolve => {
      release = () => resolve(new Response(JSON.stringify(categoryA), { status: 200 }));
    }));
    const first = cache.fetchReferenceList('/api/categories'), second = cache.fetchReferenceList('/api/categories');
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1)); release();
    expect(await first).toEqual(categoryA); expect(await second).toEqual(categoryA);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('A to B to A invalidates the original in-flight epoch instead of overwriting the new A snapshot', async () => {
    let release!: () => void;
    fetcher.mockImplementationOnce(() => new Promise<Response>(resolve => {
      release = () => resolve(new Response(JSON.stringify(categoryA), { status: 200 }));
    }));
    const original = cache.fetchReferenceList('/api/categories');
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
    changeOwner('user-b'); changeOwner('user-a');
    const latest = [{ id: 'category-a-new', name: 'Última categoría A' }];
    fetcher.mockResolvedValueOnce(new Response(JSON.stringify(latest), { status: 200 }));
    expect(await cache.fetchReferenceList('/api/categories')).toEqual(latest);
    release(); expect(await original).toBeNull();
    expect(cache.getOfflineCachedCategories('user-a')).toEqual(latest);
  });
  it('legacy ownerless snapshots are ignored and preserved without adopting or deleting original data', async () => {
    const legacy = JSON.stringify(categoryA);
    localStorage.setItem('zarix-offline-snapshot-categories-v1', legacy);
    localStorage.setItem('zarix-offline-snapshot-categories-meta-v1', JSON.stringify({ updatedAt: Date.now() }));
    changeOwner('user-b'); vi.stubGlobal('navigator', { onLine: false }); fetcher.mockRejectedValue(new Error('Offline'));
    expect(await cache.fetchReferenceList('/api/categories')).toBeNull();
    expect(cache.getOfflineCachedCategories('user-b')).toEqual([]);
    expect(localStorage.getItem('zarix-offline-snapshot-categories-v1')).toBe(legacy);
  });
  it('an online empty response clears only its owner, while offline/error empties preserve that owner snapshot', async () => {
    await cache.fetchReferenceList('/api/categories');
    changeOwner('user-b'); await cache.fetchReferenceList('/api/categories');
    changeOwner('user-a');
    fetcher.mockResolvedValueOnce(new Response('[]', { status: 200 }));
    vi.stubGlobal('navigator', { onLine: false });
    await cache.fetchReferenceList('/api/categories', { force: true });
    expect(cache.getOfflineCachedCategories('user-a')).toEqual(categoryA);
    vi.stubGlobal('navigator', { onLine: true });
    fetcher.mockResolvedValueOnce(new Response('[]', { status: 200 }));
    await cache.fetchReferenceList('/api/categories', { force: true });
    expect(cache.getOfflineCachedCategories('user-a')).toEqual([]);
    changeOwner('user-b');
    expect(cache.getOfflineCachedCategories('user-b')).toEqual(categoryB);
  });
  it('account snapshots are scoped too and an expected old owner never starts a new owner request', async () => {
    const accountA = [{ id: 'account-a', name: 'Cuenta A' }];
    fetcher.mockResolvedValueOnce(new Response(JSON.stringify(accountA), { status: 200 }));
    await cache.fetchReferenceList('/api/accounts?lite=1');
    changeOwner('user-b');
    expect(await cache.fetchReferenceList('/api/accounts?lite=1', { ownerId: 'user-a' })).toBeNull();
    expect(cache.getOfflineCachedAccounts('user-b')).toEqual([]);
    expect(cache.getOfflineCachedAccounts('user-a')).toEqual([]);
    expect(fetcher).toHaveBeenCalledTimes(1);
    changeOwner('user-a');
    expect(cache.getOfflineCachedAccounts('user-a')).toEqual(accountA);
  });
  it('a stale asynchronous auth lookup cannot rebind the cache to the former owner', async () => {
    await cache.fetchReferenceList('/api/categories');
    let release!: () => void;
    auth.lookup = () => new Promise(resolve => {
      release = () => resolve({ data: { session: { user: { id: 'user-a' } } }, error: null });
    });
    const stale = cache.getOfflineReferenceOwner();
    changeOwner('user-b'); release();
    expect(await stale).toBeNull();
    expect(cache.getOfflineCachedCategories('user-a')).toEqual([]);
    auth.lookup = null;
    expect(await cache.getOfflineReferenceOwner()).toBe('user-b');
  });
  it('identity-change notifications clear references on switching/sign-out but not on same-owner token refresh', async () => {
    const changed = vi.fn(); window.addEventListener(cache.REFERENCE_OWNER_CHANGED, changed);
    await cache.getOfflineReferenceOwner(); expect(changed).not.toHaveBeenCalled();
    changeOwner('user-b'); expect(changed).toHaveBeenCalledTimes(1);
    changeOwner('user-b'); expect(changed).toHaveBeenCalledTimes(1);
    changeOwner(null); expect(changed).toHaveBeenCalledTimes(2);
    expect(cache.getOfflineCachedCategories('user-b')).toEqual([]);
  });
});
