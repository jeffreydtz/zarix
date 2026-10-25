import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TOOL_SCHEMAS } from '@/lib/ai/registry/schemas';

const PENDING_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa9';
const FIXTURE_A = '11111111-1111-4111-8111-111111111111';
const FIXTURE_B = '22222222-2222-4222-8222-222222222222';

const mocks = vi.hoisted(() => ({
  confirm: vi.fn(),
  confirmMany: vi.fn(),
  park: vi.fn(),
  executeBot: vi.fn(),
}));

vi.mock('@/lib/services/pending-inbox', () => ({
  confirmPendingItem: (input: Record<string, unknown>) => mocks.confirm(input),
  confirmPendingItems: (input: Record<string, unknown>) => mocks.confirmMany(input),
  parkRegistryWrite: (input: Record<string, unknown>) => mocks.park(input),
}));

vi.mock('@/lib/telegram/executeBotTransaction', () => ({
  executeBotTransaction: (...args: unknown[]) => mocks.executeBot(...args),
}));

import { executeRegistryTool } from '@/lib/ai/registry/execute';

describe('create_transaction accepts a new write or a frozen confirm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.confirm.mockResolvedValue({ id: PENDING_ID, merchant: 'Café', status: 'confirmed' });
    mocks.park.mockResolvedValue({ id: PENDING_ID });
    mocks.executeBot.mockResolvedValue({ kind: 'success', reply: 'ok', executed: [{ id: 'tx-1' }] });
  });

  it('parses confirm-only payloads that the write schema would reject', () => {
    const confirmOnly = TOOL_SCHEMAS.create_transaction.safeParse({
      confirm: true,
      pendingId: PENDING_ID,
    });
    expect(confirmOnly.success).toBe(true);
    const write = TOOL_SCHEMAS.create_transaction.safeParse({
      type: 'expense',
      amount: 1250,
      currency: 'ARS',
    });
    expect(write.success).toBe(true);
    expect(TOOL_SCHEMAS.create_transaction.safeParse({ confirm: true }).success).toBe(false);
  });

  it('confirms a parked write over MCP with pendingId and not a second ledger write', async () => {
    const result = await executeRegistryTool(
      'create_transaction',
      { confirm: true, pendingId: PENDING_ID },
      {
        userId: FIXTURE_A,
        financialContext: { user: { default_currency: 'ARS' }, accounts: [], categories: [] } as never,
        source: 'mcp',
      }
    );
    expect(result.response.success).toBe(true);
    expect(mocks.confirm).toHaveBeenCalledWith(expect.objectContaining({ userId: FIXTURE_A, itemId: PENDING_ID }));
    expect(mocks.executeBot).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toContain(FIXTURE_B);
  });

  it('isolates confirm to the PAT user', async () => {
    mocks.confirm.mockImplementation(async (input: { userId: string }) => {
      if (input.userId !== FIXTURE_A) throw new Error('cross-user');
      return { id: PENDING_ID, merchant: 'Café', status: 'confirmed' };
    });
    await executeRegistryTool(
      'create_transaction',
      { confirm: true, pendingId: PENDING_ID },
      {
        userId: FIXTURE_A,
        financialContext: { user: { default_currency: 'ARS' }, accounts: [], categories: [] } as never,
        source: 'mcp',
      }
    );
    expect(mocks.confirm.mock.calls[0][0].userId).toBe(FIXTURE_A);
    expect(mocks.confirm.mock.calls[0][0].userId).not.toBe(FIXTURE_B);
  });
});
