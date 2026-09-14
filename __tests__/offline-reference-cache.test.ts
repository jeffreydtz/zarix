import { beforeEach, describe, expect, it, vi } from 'vitest';
const auth = vi.hoisted(() => ({ userId: 'A' as string | null }));
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({ auth: { getSession: async () => ({ data: { session: auth.userId ? { user: { id: auth.userId } } : null }, error: null }) } }) }));
import { fetchReferenceList, maybePersistAccountsSnapshot, getOfflineCachedAccounts, clearOfflineReferenceSnapshots } from '@/lib/offline-reference-cache';
import { setOfflineOwner } from '@/lib/offline-owner';

beforeEach(() => {
  const values = new Map<string,string>();
  vi.stubGlobal('window', {});
  vi.stubGlobal('navigator', { onLine: true });
  vi.stubGlobal('localStorage', { getItem: (key:string) => values.get(key) ?? null, setItem: (key:string,v:string) => values.set(key,v), removeItem: (key:string) => values.delete(key) });
  auth.userId = 'A';
  clearOfflineReferenceSnapshots();
});
describe('offline reference owner isolation', () => {
  it('keeps local references offline after token expiry without refreshing auth', async () => {
    setOfflineOwner('A');
    maybePersistAccountsSnapshot([{ id:'offline-account' }], true, 'A');
    auth.userId = null;
    vi.stubGlobal('navigator', { onLine:false });
    expect(await fetchReferenceList('/api/accounts')).toEqual([{id:'offline-account'}]);
    setOfflineOwner(null);
    expect(await fetchReferenceList('/api/accounts')).toBeNull();
  });
  it('never returns A accounts from fresh cache to B', async () => {
    maybePersistAccountsSnapshot([{ id:'account-a', balance:1234 }], true, 'A');
    auth.userId = 'B';
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify([{ id:'account-b' }])));
    vi.stubGlobal('fetch', fetcher);
    expect(await fetchReferenceList('/api/accounts?lite=1')).toEqual([{ id:'account-b' }]);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(getOfflineCachedAccounts('A')).toEqual([{ id:'account-a', balance:1234 }]);
  });
  it('discards an in-flight result after an account switch', async () => {
    let complete!: (value: Response) => void;
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(r => { complete=r; })));
    const result = fetchReferenceList('/api/accounts?lite=1', { force:true });
    await vi.waitFor(() => expect(complete).toBeTypeOf('function'));
    auth.userId = 'B';
    complete(new Response(JSON.stringify([{ id:'private-a' }])));
    expect(await result).toBeNull();
    expect(getOfflineCachedAccounts('B')).toEqual([]);
  });
  it('does not use cache without an authenticated local session', async () => {
    maybePersistAccountsSnapshot([{ id:'account-a' }], true, 'A');
    auth.userId = null;
    expect(await fetchReferenceList('/api/accounts')).toBeNull();
  });
});
