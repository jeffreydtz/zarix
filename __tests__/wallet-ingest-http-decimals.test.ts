import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
  execute: vi.fn(),
  suggest: vi.fn(async (): Promise<{
    categoryId: string | null;
    categoryName: string | null;
    source: string;
  }> => ({ categoryId: null, categoryName: null, source: 'none' })),
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

  async function postWalletWithAutoConfirm(input: {
    rawText: string;
    key: string;
    contentType?: string;
    body?: string;
  }): Promise<{
    status: number;
    body: { autoConfirmed: boolean; item: { amount: number | null; currency?: string } };
    captured: { row: Record<string, unknown> | null };
  }> {
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
    const contentType = input.contentType ?? 'application/json';
    const raw =
      input.body ??
      JSON.stringify({
        rawText: input.rawText,
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
          'content-type': contentType,
          'idempotency-key': input.key,
        },
        body: raw,
      })
    );
    const body = (await response.json()) as {
      autoConfirmed: boolean;
      item: { amount: number | null; currency?: string };
    };
    return { status: response.status, body, captured };
  }

  it('never auto-confirms the card last-4; two-amount saldo text now parks', async () => {
    const last4 = await postWalletWithAutoConfirm({
      rawText: 'Tarjeta Visa 1234. Monto: $ 1.500',
      key: 'wallet-r11-high-last4',
    });
    expect(last4.status).toBe(201);
    expect(last4.body.item.amount).toBe(1500);
    expect(last4.body.item.amount).not.toBe(1234);
    expect(last4.captured.row?.amount).toBe(1500);
    expect(last4.captured.row?.amount_ambiguous).toBe(false);

    vi.clearAllMocks();
    const twoAmounts = await postWalletWithAutoConfirm({
      rawText: 'Monto: $ 1.500 en COTO. Saldo disponible $ 20.000',
      key: 'wallet-r12-two-amount-saldo',
    });
    expect(twoAmounts.status).toBe(201);
    expect(twoAmounts.body.autoConfirmed).toBe(false);
    expect(twoAmounts.body.item.amount).toBeNull();
    expect(twoAmounts.body.item.amount).not.toBe(1500);
    expect(twoAmounts.body.item.amount).not.toBe(20000);
    expect(twoAmounts.captured.row?.amount).toBeNull();
    expect(twoAmounts.captured.row?.amount_ambiguous).toBe(true);
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it('parks round-12 Alto texts via HTTP with auto-confirm armed and writes nothing to the ledger', async () => {
    const cases: Array<{ rawText: string; forbidden: number[]; key: string }> = [
      {
        rawText: 'Saldo a favor $ 200 aplicado. Compra $ 1.500. Restan $ 1.300',
        forbidden: [200, 1500, 1300],
        key: 'wallet-r12-alto-restan',
      },
      {
        rawText: 'Mercado Pago: Pagaste con saldo $ 1.500 en COTO. Gracias por tu compra. Cashback $ 150',
        forbidden: [1500, 150],
        key: 'wallet-r12-alto-cashback',
      },
      {
        rawText: 'Ualá: Pagaste con saldo $ 1.500 en COTO. Consultá todos los detalles en la aplicación. Comisión $ 50',
        forbidden: [1500, 50],
        key: 'wallet-r12-alto-comision',
      },
      {
        rawText: 'Naranja X: Pagaste con saldo $ 1.500 en COTO. Gracias por elegir nuestra cuenta. Cargo $ 20',
        forbidden: [1500, 20],
        key: 'wallet-r12-alto-cargo-nx',
      },
      {
        rawText: 'Brubank: Pagaste con saldo $ 1.500 en COTO. Tu comprobante ya está disponible. Propina $ 100',
        forbidden: [1500, 100],
        key: 'wallet-r12-alto-propina',
      },
      {
        rawText: 'Carga de saldo SUBE $ 2.000. La operación se completó correctamente desde tu cuenta. Cargo $ 20',
        forbidden: [2000, 20],
        key: 'wallet-r12-alto-sube',
      },
      {
        rawText: 'Disponible: $ 20.000. Compra $ 1.500 en COTO. Comprobante emitido. Cargo $ 20',
        forbidden: [20000, 1500, 20],
        key: 'wallet-r12-alto-disponible',
      },
      {
        rawText: 'Compra ARS 1500 en COTO. Saldo USD 200',
        forbidden: [1500, 200],
        key: 'wallet-r12-alto-mixed-fx',
      },
      {
        rawText: 'Compra $ 12:30 en COTO',
        forbidden: [12, 30],
        key: 'wallet-r12-alto-clock',
      },
      {
        rawText: 'Compra $ 12:30:45 en COTO',
        forbidden: [12, 30, 45],
        key: 'wallet-r12-alto-hms',
      },
      {
        rawText: 'Compra $ 2026/10/25 en COTO',
        forbidden: [2026, 10, 25],
        key: 'wallet-r12-alto-date',
      },
    ];
    for (const { rawText, forbidden, key } of cases) {
      vi.clearAllMocks();
      const result = await postWalletWithAutoConfirm({ rawText, key });
      expect(result.status, rawText).toBe(201);
      expect(result.body.autoConfirmed, rawText).toBe(false);
      expect(result.body.item.amount, rawText).toBeNull();
      expect(result.captured.row?.amount, rawText).toBeNull();
      expect(result.captured.row?.amount_ambiguous, rawText).toBe(true);
      for (const n of forbidden) {
        expect(result.body.item.amount, rawText).not.toBe(n);
        expect(result.captured.row?.amount, rawText).not.toBe(n);
      }
      expect(mocks.execute, rawText).not.toHaveBeenCalled();
    }
  });

  it('auto-parses a single-amount saldo purchase and parks Kael clocks plus preexisting misreads', async () => {
    const single = await postWalletWithAutoConfirm({
      rawText: 'Pagaste con saldo $ 1.500 en COTO',
      key: 'wallet-r12-single-saldo',
    });
    expect(single.status).toBe(201);
    expect(single.body.item.amount).toBe(1500);
    expect(single.captured.row?.amount).toBe(1500);
    expect(single.captured.row?.amount_ambiguous).toBe(false);

    const park = [
      { rawText: 'Compra $12:30 en COTO', forbidden: [12], key: 'wallet-r12-kael-clock-tight' },
      { rawText: 'Compra $ 12:30 en COTO', forbidden: [12], key: 'wallet-r12-kael-clock-space' },
      { rawText: 'Compra 25-10-2026 en COTO', forbidden: [25, 10, 2026], key: 'wallet-r12-date-dmy' },
      { rawText: 'Compra 2026-10-25 en COTO', forbidden: [2026, 10, 25], key: 'wallet-r12-date-ymd' },
      { rawText: 'Ticket 00123 COTO', forbidden: [123], key: 'wallet-r12-ticket' },
      { rawText: 'Compra 14 hs en COTO', forbidden: [14], key: 'wallet-r12-hours' },
      { rawText: 'Compra 10% de descuento en COTO', forbidden: [10], key: 'wallet-r12-percent' },
      { rawText: '3 cuotas de $ 500', forbidden: [500, 3], key: 'wallet-r12-cuotas' },
      { rawText: 'Compra 3x $500 en COTO', forbidden: [500, 3], key: 'wallet-r12-3x' },
      { rawText: 'Compra $ −50 en COTO', forbidden: [50], key: 'wallet-r12-unicode-minus' },
      { rawText: '$ 1.500 , 50', forbidden: [1500, 50], key: 'wallet-r12-split-cents' },
      { rawText: 'Compra rechazada $ 1.500 en COTO', forbidden: [1500], key: 'wallet-r12-rechazada' },
      { rawText: 'Compra denegada $ 1.500 en COTO', forbidden: [1500], key: 'wallet-r12-denegada' },
      { rawText: 'Pago fallido $ 1.500 en COTO', forbidden: [1500], key: 'wallet-r12-fallido' },
      { rawText: 'Anulación de compra $ 1.500 en COTO', forbidden: [1500], key: 'wallet-r12-anulacion' },
      { rawText: 'Compra USD 10 ($ 10) en COTO', forbidden: [10], key: 'wallet-r12-mixed-usd-dollar' },
    ];
    for (const { rawText, forbidden, key } of park) {
      vi.clearAllMocks();
      const result = await postWalletWithAutoConfirm({ rawText, key });
      expect(result.status, rawText).toBe(201);
      expect(result.body.autoConfirmed, rawText).toBe(false);
      expect(result.body.item.amount, rawText).toBeNull();
      expect(result.captured.row?.amount, rawText).toBeNull();
      for (const n of forbidden) expect(result.body.item.amount, rawText).not.toBe(n);
      expect(mocks.execute, rawText).not.toHaveBeenCalled();
    }
  });
});
