import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
  execute: vi.fn(),
  suggest: vi.fn(async () => ({ categoryId: null, categoryName: null, source: 'none' })),
}));

vi.mock('@/lib/supabase/server', () => ({
  createServiceClientSync: () => ({ rpc: mocks.rpc, from: mocks.from }),
  createBareServiceClient: () => ({ rpc: mocks.rpc, from: mocks.from }),
}));

vi.mock('@/lib/supabase/request-scope', () => ({
  withPatUserScope: (_userId: string, work: () => Promise<unknown>) => work(),
}));

vi.mock('@/lib/services/personal-access-tokens', () => ({
  authenticatePersonalAccessToken: async () => ({
    userId: '11111111-1111-4111-8111-111111111111',
    tokenId: 'pat-wallet-decimals',
    scopes: ['ingest'],
  }),
}));

vi.mock('@/lib/rate-limit', () => ({
  clientIpFromRequest: () => '127.0.0.1',
  rateLimitAllow: () => true,
  rateLimitAllowShared: async () => 'allow',
  SHARED_LIMITER_UNAVAILABLE_MESSAGE: 'limiter down',
}));

vi.mock('@/lib/ai/registry/execute', () => ({
  executeRegistryTool: (...args: unknown[]) => mocks.execute(...args),
}));

vi.mock('@/lib/integrations/merchant-category', () => ({
  suggestCategoryFromMerchant: () => mocks.suggest(),
}));

import { POST as walletPost } from '@/app/api/ingest/wallet/route';

const FIXTURE_USER = '11111111-1111-4111-8111-111111111111';
const ITEM_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa9';

describe('Wallet HTTP ingest decimal precision', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.from.mockImplementation(() => {
      const q: Record<string, unknown> = {};
      const self = q;
      q.select = () => self;
      q.eq = () => self;
      q.insert = async () => ({ data: null, error: null });
      q.maybeSingle = async () => ({ data: { wallet_auto_confirm: true, account_id: null }, error: null });
      return q;
    });
  });

  it('POSTs amount 40.129 through ingest and never writes the ledger', async () => {
    const captured: { row: Record<string, unknown> | null } = { row: null };
    mocks.rpc.mockImplementation(async (fn: string, args: { p_row?: Record<string, unknown> }) => {
      if (fn === 'reserve_pending_inbox_item') {
        captured.row = args.p_row ?? null;
        return {
          data: {
            item: {
              ...args.p_row,
              id: ITEM_ID,
              user_id: FIXTURE_USER,
              status: 'pending',
            },
            duplicate: false,
          },
          error: null,
        };
      }
      return { data: null, error: null };
    });

    const raw = '{"amount":40.129,"currency":"ARS","merchant":"Café","cardName":"Visa Ejemplo","timestamp":"2026-10-25T12:00:00.000Z"}';
    const response = await walletPost(
      new NextRequest('http://localhost/api/ingest/wallet', {
        method: 'POST',
        headers: {
          authorization: 'Bearer zrxp_' + 'a'.repeat(64),
          'content-type': 'application/json',
        },
        body: raw,
      })
    );
    expect(response.status).toBe(201);
    const body = (await response.json()) as { autoConfirmed: boolean; item: { amount: number | null } };
    expect(body.autoConfirmed).toBe(false);
    expect(body.item.amount).toBeNull();
    expect(captured.row?.amount).toBeNull();
    expect(captured.row?.amount).not.toBe(40.13);
    expect(captured.row?.amount_ambiguous).toBe(true);
    expect(mocks.execute).not.toHaveBeenCalled();
    expect(mocks.rpc.mock.calls.some((call) => call[0] === 'claim_pending_inbox_item')).toBe(false);
  });
});
