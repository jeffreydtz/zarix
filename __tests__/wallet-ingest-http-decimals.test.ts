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

    const invalidPark = [
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
      { rawText: 'Compra USD 10 ($ 10) en COTO', forbidden: [10], key: 'wallet-r12-mixed-usd-dollar' },
    ];
    for (const { rawText, forbidden, key } of invalidPark) {
      vi.clearAllMocks();
      const result = await postWalletWithAutoConfirm({ rawText, key });
      expect(result.status, rawText).toBe(201);
      expect(result.body.autoConfirmed, rawText).toBe(false);
      expect(result.body.item.amount, rawText).toBeNull();
      expect(result.captured.row?.amount, rawText).toBeNull();
      for (const n of forbidden) expect(result.body.item.amount, rawText).not.toBe(n);
      expect(mocks.execute, rawText).not.toHaveBeenCalled();
    }
    for (const { rawText, key } of [
      { rawText: 'Compra rechazada $ 1.500 en COTO', key: 'wallet-r12-rechazada' },
      { rawText: 'Compra denegada $ 1.500 en COTO', key: 'wallet-r12-denegada' },
      { rawText: 'Pago fallido $ 1.500 en COTO', key: 'wallet-r12-fallido' },
      { rawText: 'Anulación de compra $ 1.500 en COTO', key: 'wallet-r12-anulacion' },
    ]) {
      vi.clearAllMocks();
      const result = await postWalletWithAutoConfirm({ rawText, key });
      expect(result.status, rawText).toBe(201);
      expect(result.body.autoConfirmed, rawText).toBe(false);
      expect(result.captured.row?.amount_ambiguous, rawText).toBe(true);
      expect(mocks.execute, rawText).not.toHaveBeenCalled();
    }
  });

  it('parks round-13 refund, reference-as-amount, USD $ markers, and prod-preexisting contexts', async () => {
    const park = [
      'Refund $ 50 de Amazon',
      'Reversa de compra $ 1.500',
      'Contracargo $ 1.500',
      'Crédito en tu cuenta $ 1.500',
      'Reverso $ 1.500',
      'Ticket 1234 ARS 1.500',
      'Referencia 1234 USD 50',
      'Operación 456 ARS 1.500,50',
      'Referencia: 321 USD 12.50',
      'Factura 1234 EUR 50',
      'Ticket 1234 U$S 10',
      'Ticket 1234 ARS: 1.500',
      'Saldo disponible $ 1.500',
      'Tu límite es $ 1.500',
      'Available balance $ 1.500',
      'Refund $ 1.500',
      'Contracargo $ 1.500 en COTO',
      'Reverso $ 1.500 en COTO',
      'Crédito $ 1.500',
      '$ 1.250 50',
      '$1.250¹50',
      'Compra $ 1\u200b.500',
      `${'x'.repeat(4001)} Compra $ 1.500`,
      'Compra －$ 1.500',
      'Compra $ 1.500 + IVA',
      'Compra $ 1.500 c/u',
      'desde $ 1.500',
      'hasta $ 1.500',
      'Preautorización $ 1.500',
      'Reserva $ 1.500',
      'Retención $ 1.500',
      'Intento de compra $ 1.500',
      'Compra no aprobada $ 1.500',
      'Comprobante https://coto.example/$123',
      'Email $123@example.test',
      'Código AB-$123',
      'Compra $ 1,5 mil',
      'Compra $ 1M',
      'Compra $ 1500 dólares',
      'Recibiste $ 1.500 de Juan',
      'Te transfirieron $ 1.500',
      'Cobraste $ 1.500',
      '$ 12.345.678,90',
      '$12.345.678,90',
      '1.250,50 ARS',
      'ARS 1.250,50',
      'US$ 10',
      'US$ 12.50',
      'USD 12,50',
      '$ 0,99',
      '$ 1.000.000',
      '$ 1.234,5',
      '$ 1.500.-',
      '$ 12.500',
      'U$S 10',
      '$1.250,00',
      'ARS 99',
      '$ 1.250,50.',
      'Débito automático $ 2.450,30',
      '-$ 500',
      '-$1.234,56',
    ];
    for (const [i, rawText] of park.entries()) {
      vi.clearAllMocks();
      const result = await postWalletWithAutoConfirm({
        rawText,
        key: `wallet-r13-park-${i}`,
        contentType: 'text/plain',
        body: rawText,
      });
      expect(result.status, rawText).toBe(201);
      expect(result.body.autoConfirmed, rawText).toBe(false);
      expect(result.captured.row?.amount_ambiguous, rawText).toBe(true);
      expect(mocks.execute, rawText).not.toHaveBeenCalled();
      if (/Ticket 1234|Referencia|Factura 1234|Operación 456/.test(rawText)) {
        expect(result.body.item.amount, rawText).not.toBe(1234);
        expect(result.body.item.amount, rawText).not.toBe(456);
        expect(result.body.item.amount, rawText).not.toBe(321);
      }
    }

    const usdPrefix = [
      { rawText: 'Compra USD $10', currency: 'USD' },
      { rawText: 'Compra USD $ 10', currency: 'USD' },
      { rawText: 'Compra EUR $10', currency: 'EUR' },
      { rawText: 'Compra USD\u00a0$10', currency: 'USD' },
      { rawText: 'Compra USD\n$10', currency: 'USD' },
      { rawText: 'Compra $10 US$', currency: 'USD' },
      { rawText: 'Compra $ 10 US$.', currency: 'USD' },
      { rawText: 'Compra $ 10 US$ en COTO', currency: 'USD' },
    ];
    const kaelKeepAuto = [
      { rawText: 'Pagaste $ 3.500', amount: 3500, currency: 'ARS' },
      { rawText: 'Compra $ 1.250 en COTO', amount: 1250, currency: 'ARS' },
      { rawText: '25/10 12:30 Pagaste $ 1.250,50', amount: 1250.5, currency: 'ARS' },
      { rawText: 'Transferiste $ 8.000', amount: 8000, currency: 'ARS' },
    ];
    for (const [i, { rawText, currency }] of usdPrefix.entries()) {
      vi.clearAllMocks();
      const result = await postWalletWithAutoConfirm({
        rawText,
        key: `wallet-r13-usd-${i}`,
        contentType: 'text/plain',
        body: rawText,
      });
      expect(result.status, rawText).toBe(201);
      expect(result.body.item.amount, rawText).toBe(10);
      expect(result.captured.row?.amount, rawText).toBe(10);
      expect(result.captured.row?.amount_ambiguous, rawText).toBe(false);
      expect(result.captured.row?.currency, rawText).toBe(currency);
    }
    for (const [i, { rawText, amount, currency }] of kaelKeepAuto.entries()) {
      vi.clearAllMocks();
      const result = await postWalletWithAutoConfirm({
        rawText,
        key: `wallet-r13-kael-keep-${i}`,
        contentType: 'text/plain',
        body: rawText,
      });
      expect(result.status, rawText).toBe(201);
      expect(result.body.item.amount, rawText).toBe(amount);
      expect(result.captured.row?.amount, rawText).toBe(amount);
      expect(result.captured.row?.amount_ambiguous, rawText).toBe(false);
      expect(result.captured.row?.currency, rawText).toBe(currency);
    }
  });
});
