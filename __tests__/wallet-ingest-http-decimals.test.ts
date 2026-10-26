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

  it('POSTs amount 40.129 through ingest as 400 and never writes the ledger', async () => {
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
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error?: string };
    expect(body.error).toMatch(/decimales/i);
    expect(captured.row).toBeNull();
    expect(mocks.execute).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('POSTs 40.129 plus text containing e as 400, not 201 empty', async () => {
    const captured: { row: Record<string, unknown> | null } = { row: null };
    mocks.rpc.mockImplementation(async (fn: string, args: { p_row?: Record<string, unknown> }) => {
      if (fn === 'reserve_pending_inbox_item') {
        captured.row = args.p_row ?? null;
        return { data: { item: { ...args.p_row, id: ITEM_ID, user_id: FIXTURE_USER, status: 'pending' }, duplicate: false }, error: null };
      }
      return { data: null, error: null };
    });
    const raw =
      '{"amount":40.129,"currency":"ARS","merchant":"Café","cardName":"Visa Ejemplo","timestamp":"2026-10-25T12:00:00.000Z","rawText":"Compra en COTO"}';
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
    expect(response.status).toBe(400);
    expect(captured.row).toBeNull();
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it('POSTs amount 1e2 through ingest and parks null instead of 1.00', async () => {
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

    const raw = '{"amount":1e2,"currency":"ARS","merchant":"Café","cardName":"Visa Ejemplo","timestamp":"2026-10-25T12:00:00.000Z"}';
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
    expect(captured.row?.amount).not.toBe(1);
    expect(captured.row?.amount).not.toBe(100);
    expect(captured.row?.amount_ambiguous).toBe(true);
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it('POSTs text Compra $ 1e3 and parks null instead of auto-confirming 1', async () => {
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

    const response = await walletPost(
      new NextRequest('http://localhost/api/ingest/wallet', {
        method: 'POST',
        headers: {
          authorization: 'Bearer zrxp_' + 'a'.repeat(64),
          'content-type': 'text/plain',
        },
        body: 'Compra $ 1e3 en COTO',
      })
    );
    expect(response.status).toBe(201);
    const body = (await response.json()) as { autoConfirmed: boolean; item: { amount: number | null } };
    expect(body.autoConfirmed).toBe(false);
    expect(body.item.amount).toBeNull();
    expect(captured.row?.amount).toBeNull();
    expect(captured.row?.amount).not.toBe(1);
    expect(captured.row?.amount).not.toBe(1000);
    expect(captured.row?.amount_ambiguous).toBe(true);
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it('never auto-confirms the balance or card last-4 for the round-11 High texts', async () => {
    const cases: Array<{ rawText: string; forbidden: number }> = [
      { rawText: 'Monto: $ 1.500 en COTO. Saldo disponible $ 20.000', forbidden: 20000 },
      { rawText: 'Tarjeta Visa 1234. Monto: $ 1.500', forbidden: 1234 },
    ];
    for (const { rawText, forbidden } of cases) {
      vi.clearAllMocks();
      const captured: { row: Record<string, unknown> | null } = { row: null };
      mocks.suggest.mockResolvedValue({ categoryId: 'cat-coto', categoryName: 'Supermercado', source: 'history' });
      mocks.from.mockImplementation((table: string) => {
        const q: Record<string, unknown> = {};
        const self = q;
        q.select = () => self;
        q.eq = () => self;
        q.insert = async () => ({ data: null, error: null });
        q.upsert = async () => ({ data: null, error: null });
        q.update = () => self;
        q.maybeSingle = async () => {
          if (table === 'wallet_card_account_maps') {
            return { data: { account_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1' }, error: null };
          }
          if (table === 'users') return { data: { wallet_auto_confirm: true }, error: null };
          return { data: null, error: null };
        };
        return q;
      });
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
      const raw = JSON.stringify({
        rawText,
        merchant: 'COTO',
        cardName: 'Visa Ejemplo',
        timestamp: '2026-10-25T12:00:00.000Z',
        currency: 'ARS',
      });
      const response = await walletPost(
        new NextRequest('http://localhost/api/ingest/wallet', {
          method: 'POST',
          headers: {
            authorization: 'Bearer zrxp_' + 'a'.repeat(64),
            'content-type': 'application/json',
            'idempotency-key': `wallet-r11-${forbidden}`,
          },
          body: raw,
        })
      );
      expect(response.status, rawText).toBe(201);
      const body = (await response.json()) as {
        autoConfirmed: boolean;
        item: { amount: number | null };
      };
      expect(body.item.amount, rawText).toBe(1500);
      expect(body.item.amount, rawText).not.toBe(forbidden);
      expect(captured.row?.amount, rawText).toBe(1500);
      expect(captured.row?.amount, rawText).not.toBe(forbidden);
      expect(captured.row?.amount_ambiguous, rawText).toBe(false);
      for (const call of mocks.execute.mock.calls) {
        const args = call[1] as { amount?: number } | undefined;
        expect(args?.amount, rawText).not.toBe(forbidden);
        if (typeof args?.amount === 'number') expect(args.amount, rawText).toBe(1500);
      }
    }
  });
});
