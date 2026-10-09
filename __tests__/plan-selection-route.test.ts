import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ user: vi.fn(), select: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ auth: { getUser: mocks.user } }) }));
vi.mock('@/lib/plans/service', () => ({ selectMovementAccounts: mocks.select }));
import { PUT } from '@/app/api/accounts/movement-selection/route';
import { ApiError } from '@/lib/api-handler';
const account = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
function request(body: unknown) { return new Request('http://localhost/api/accounts/movement-selection', { method: 'PUT', body: JSON.stringify(body) }); }
beforeEach(() => { vi.clearAllMocks();mocks.user.mockResolvedValue({ data: { user: { id: 'verified-owner' } } });mocks.select.mockResolvedValue(undefined); });
describe('account-selection authorization boundary', () => {
  it('requires authenticated owner', async () => {
    mocks.user.mockResolvedValue({ data: { user: null } });
    expect((await PUT(request({ accountIds: [account] }))).status).toBe(401);
    expect(mocks.select).not.toHaveBeenCalled();
  });
  it('always uses authenticated identity and ignores supplied user ID', async () => {
    expect((await PUT(request({ accountIds: [account], userId: 'victim' }))).status).toBe(200);
    expect(mocks.select).toHaveBeenCalledExactlyOnceWith('verified-owner', [account]);
  });
  it.each([{}, { accountIds: ['malformed'] }, { accountIds: Array(21).fill(account) }])('rejects invalid body %j', async body => {
    expect((await PUT(request(body))).status).toBe(400);expect(mocks.select).not.toHaveBeenCalled();
  });
  it('lets an empty selection disable new movements without deleting accounts', async () => {
    expect((await PUT(request({ accountIds: [] }))).status).toBe(200);
    expect(mocks.select).toHaveBeenCalledExactlyOnceWith('verified-owner', []);
  });
  it('returns safe policy denial without leaking database detail', async () => {
    mocks.select.mockRejectedValue(new ApiError('Cupo alcanzado.', 403));
    const result=await PUT(request({ accountIds: [account] }));expect(result.status).toBe(403);
    expect(await result.json()).toEqual({ error: 'Cupo alcanzado.' });
  });
});
