import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  execute: vi.fn(),
  audit: vi.fn(),
  getTool: vi.fn(),
}));

vi.mock('@/lib/ai/registry', () => ({
  executeRegistryTool: (...args: unknown[]) => mocks.execute(...args),
  getRegistryTool: (name: string) => mocks.getTool(name),
  toolsVisibleToScopes: () => [],
  isRemoteWriteTool: (name: string) => name === 'create_transaction' || name === 'create_transactions',
}));

vi.mock('@/lib/ai/registry/context', () => ({
  loadRegistryFinancialContext: async () => ({ user: {}, accounts: [], categories: [] }),
}));

vi.mock('@/lib/integrations/audit', () => ({
  recordIntegrationAudit: (...args: unknown[]) => mocks.audit(...args),
  auditIpFromRequest: () => 'ip-hash',
  auditUserAgent: () => 'ua',
}));

vi.mock('@/lib/supabase/request-scope', () => ({
  withPatUserScope: (_userId: string, work: () => Promise<unknown>) => work(),
}));

import { invokeRegistryForPat, resolveIdempotencyKey } from '@/lib/integrations/invoke-registry';

const FIXTURE_USER = '11111111-1111-4111-8111-111111111111';

describe('MCP/REST write audit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getTool.mockImplementation((name: string) => ({
      name,
      readOnly: false,
      scopes: ['write'],
    }));
  });

  it('audits thrown writes with outcome=thrown', async () => {
    mocks.execute.mockRejectedValue(new Error('ledger exploded'));
    await expect(
      invokeRegistryForPat({
        userId: FIXTURE_USER,
        scopes: ['write'],
        name: 'create_transaction',
        args: { type: 'expense', amount: 10, requestId: 'idem-thrown-001' },
        source: 'mcp',
        requestId: 'idem-thrown-001',
      })
    ).rejects.toThrow('ledger exploded');
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'mcp.write',
        metadata: expect.objectContaining({
          tool: 'create_transaction',
          requestId: 'idem-thrown-001',
          outcome: 'thrown',
        }),
      })
    );
  });

  it('audits scope denials as outcome=denied', async () => {
    await expect(
      invokeRegistryForPat({
        userId: FIXTURE_USER,
        scopes: ['read'],
        name: 'create_transaction',
        args: { type: 'expense', amount: 10 },
        source: 'api',
      })
    ).rejects.toMatchObject({ status: 403 });
    expect(mocks.execute).not.toHaveBeenCalled();
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: 'denied',
        metadata: expect.objectContaining({ outcome: 'denied', tool: 'create_transaction' }),
      })
    );
  });

  it('prefers the Idempotency-Key header over body requestId', () => {
    expect(resolveIdempotencyKey('header-key', { requestId: 'body-key' })).toBe('header-key');
    expect(resolveIdempotencyKey(null, { requestId: 'body-key' })).toBe('body-key');
  });
});
