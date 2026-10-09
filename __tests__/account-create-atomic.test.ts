import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn(), user: vi.fn(), create: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({
  createServiceClientSync: () => ({ rpc: mocks.rpc, from: mocks.from }),
  createClient: async () => ({ auth: { getUser: mocks.user } }),
}));
import { accountsService } from '@/lib/services/accounts';
import { withFinancialRequestContext } from '@/lib/financial-request-context';
const input = { userId: 'owner', requestId: 'fixture-account', name: 'Fixture', type: 'bank', currency: 'ars', initialBalance: 1200 };
beforeEach(() => { vi.clearAllMocks();mocks.rpc.mockResolvedValue({ data: { id: 'account-created', balance: 1200 }, error: null }); });
describe('atomic account service', () => {
  it('creates account and opening balance through one RPC, no separate writes', async () => {
    expect(await accountsService.create(input)).toEqual({ id: 'account-created', balance: 1200 });
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith('create_account_with_opening_balance', expect.objectContaining({
      p_user_id: 'owner', p_request_id: 'fixture-account', p_initial_balance: 1200,
      p_account: expect.objectContaining({ currency: 'ARS', name: 'Fixture' }),
    }));
  });
  it('normalizes credit-card opening debt as negative in the atomic ledger operation', async () => {
    await accountsService.create({ ...input, type: 'credit_card', isDebt: true });
    expect(mocks.rpc.mock.calls[0][1].p_initial_balance).toBe(-1200);
  });
  it('reuses channel operation context for bot retries', async () => {
    await withFinancialRequestContext('telegram:42:7', () => accountsService.create({ ...input, requestId: undefined }));
    expect(mocks.rpc.mock.calls[0][1].p_request_id).toBe('telegram:42:7:0');
  });
  it('rejects invalid balance and key without writes', async () => {
    await expect(accountsService.create({ ...input, initialBalance: Infinity })).rejects.toThrow('finito');
    await expect(accountsService.create({ ...input, requestId: 'x' })).rejects.toThrow('Identificador');
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it('fingerprints normalized intent deterministically', async () => {
    await accountsService.create(input);const fingerprint=mocks.rpc.mock.calls[0][1].p_request_hash;
    await accountsService.create({ ...input, requestId: 'other-key', currency: 'ARS' });
    expect(mocks.rpc.mock.calls[1][1].p_request_hash).toBe(fingerprint);
  });
});
