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
      rawText: 'Pagaste con Visa terminada en 1234 por $ 5.000,00 en COTO S.A.',
      key: 'wallet-r11-high-last4',
    });
    expect(last4.status).toBe(201);
    expect(last4.body.item.amount).toBe(5000);
    expect(last4.body.item.amount).not.toBe(1234);
    expect(last4.captured.row?.amount).toBe(5000);
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
      { rawText: 'Abonaste USD $10', currency: 'USD' },
      { rawText: 'Abonaste USD $ 10', currency: 'USD' },
      { rawText: 'Abonaste EUR $10', currency: 'EUR' },
      { rawText: 'Abonaste USD\u00a0$10', currency: 'USD' },
      { rawText: 'Abonaste USD\n$10', currency: 'USD' },
      { rawText: 'Pagaste $10 US$', currency: 'USD' },
      { rawText: 'Pagaste $ 10 US$.', currency: 'USD' },
      { rawText: 'Pagaste $ 10 US$ en COTO', currency: 'USD' },
    ];
    const kaelKeepAuto = [
      { rawText: 'Pagaste $ 3.500', amount: 3500, currency: 'ARS' },
      { rawText: 'Compraste en COTO por $ 1.250,50', amount: 1250.5, currency: 'ARS' },
      { rawText: '25/10 12:30 Pagaste $ 1.250,50', amount: 1250.5, currency: 'ARS' },
      { rawText: 'Transferiste $ 8.000', amount: 8000, currency: 'ARS' },
      { rawText: 'Pagaste con saldo $ 1.500 en COTO', amount: 1500, currency: 'ARS' },
      { rawText: 'Compra aprobada US$ 12.50', amount: 12.5, currency: 'USD' },
      { rawText: 'Abonaste USD 10', amount: 10, currency: 'USD' },
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

  it('parks round-14 signed/paren references, long JSON refunds, and prod-preexisting notices', async () => {
    const signed = [
      'Compra referencia 1234 USD -50',
      'Compra referencia 1234 USD +50',
      'Compra referencia 1234 USD (50)',
      'Compra referencia 1234 USD::50',
      'Compra referencia 1234 USD/50',
      'Compra referencia 1234 ARS -1.500',
      'Compra referencia 1234 EUR -50',
      'Compra en terminal 1234 ARS -1.500',
      'Compra referencia 1234 U$D -50',
      'Compra referencia 1234 AR$ -50',
      'Compra referencia 1234 USD: -50',
      'Compra referencia 1234 USD (+50)',
      'Compra referencia 1234 USD #50',
    ];
    const orchestrator38 = [
      'Vence tu resumen. Pago mínimo $ 2.000',
      'Pago de tu resumen mínimo $ 2.000',
      'Tu resumen vence mañana. Total a pagar $ 50.000',
      'Monto a pagar $ 50.000',
      'Recordatorio: pago de $ 3.000 programado',
      'Pago de $ 3.000 programado para mañana',
      'Pago de $ 3.000 en proceso',
      'Compra en proceso $ 1.500',
      'Tu compra de $ 1.500 está siendo procesada',
      'Compra en COTO por $ 1.500 pendiente de confirmación',
      'Importe a devolver $ 500',
      'Te vamos a devolver el importe de $ 500',
      'Reintegrado: compra $ 1.500',
      'Rembolso compra $ 1.500',
      'Compra rechasada $ 1.500',
      'Compra declinada $ 1.500',
      'Compra no autorizada $ 1.500',
      'Compra no realizada $ 1.500',
      'Compra sin fondos $ 1.500',
      'Compra simulada $ 1.500',
      'Compra estimada $ 1.500',
      'Recibió tu pago de $ 1.500',
      'Pagaste $ 1.500 + propina',
      'Pagaste $ 1.500 + impuestos',
      'Pagaste $ 1.500 sin IVA',
      'Pagaste $ 1.500 por mes',
      'Pagaste $ 1.500/mes',
      'Pago de $ 1.500 de 3',
      'Pagaste el 50% $ 1.500',
      'Pagaste seña $ 1.500',
      'Pagaste adelanto $ 1.500',
      'Importe original $ 1.500',
      'Importe bonificado $ 1.500',
      'Descuento total $ 1.500',
      'Total ahorrado $ 1.500',
      'Ahorraste en total $ 1.500',
      'Total descuentos $ 1.500',
      'Pago de intereses $ 1.500',
    ];
    expect(orchestrator38).toHaveLength(38);
    const kaelExtra = [
      'Importe reintegrado $ 800',
      'Total a pagar $ 5.000',
      'Monto mínimo $ 5.000',
      'Pago mínimo $ 5.000',
      'Pago no aprobado $ 800',
      'Compra en https://x.com $ 500',
      'Pagaste $ 1\u00AD.500',
    ];
    const park = [...signed, ...orchestrator38, ...kaelExtra];
    for (const [i, rawText] of park.entries()) {
      vi.clearAllMocks();
      const result = await postWalletWithAutoConfirm({
        rawText,
        key: `wallet-r14-park-${i}`,
        contentType: 'text/plain',
        body: rawText,
      });
      expect(result.status, rawText).toBe(201);
      expect(result.body.autoConfirmed, rawText).toBe(false);
      expect(result.captured.row?.amount_ambiguous, rawText).toBe(true);
      expect(mocks.execute, rawText).not.toHaveBeenCalled();
      expect(result.body.item.amount, rawText).not.toBe(1234);
    }

    const longRefund = `Refund $ 1.500\n${'x'.repeat(4050)}\nComercio: COTO\ncon tarjeta Visa`;
    const longNoRealizada = `Compra no realizada $ 1.500\n${'x'.repeat(4050)}\nComercio: COTO\ncon tarjeta Visa`;
    for (const [i, rawText] of [longRefund, longNoRealizada].entries()) {
      vi.clearAllMocks();
      const result = await postWalletWithAutoConfirm({
        rawText,
        key: `wallet-r14-long-json-${i}`,
        body: JSON.stringify({
          amount: 1500,
          rawText,
          timestamp: '2026-10-25T12:00:00.000Z',
          currency: 'ARS',
        }),
      });
      expect(result.status, rawText.slice(0, 40)).toBe(201);
      expect(result.body.autoConfirmed, rawText.slice(0, 40)).toBe(false);
      expect(result.captured.row?.amount_ambiguous, rawText.slice(0, 40)).toBe(true);
      expect(result.captured.row?.merchant, rawText.slice(0, 40)).not.toBe('COTO');
      expect(mocks.execute, rawText.slice(0, 40)).not.toHaveBeenCalled();
    }
  });

  it('parks round-15 JSON vs rawText mismatches with auto-confirm armed and writes nothing', async () => {
    const merchant = 'COTO';
    const cardName = 'tarjeta Visa';
    const timestamp = '2026-10-25T12:00:00.000Z';
    const parkBodies: Array<{ body: Record<string, unknown>; label: string }> = [
      { label: 'amount15-suffix-USD', body: { amount: 15, rawText: 'Pagaste 15 USD', merchant, cardName, timestamp } },
      { label: 'amount15-suffix-US$', body: { amount: 15, rawText: 'Pagaste 15 US$', merchant, cardName, timestamp } },
      { label: 'monto-negative', body: { monto: 1500, rawText: 'Pagaste -$ 1.500', merchant, cardName, timestamp } },
      { label: 'monto-zero', body: { monto: 1500, rawText: 'Pagaste $ 0', merchant, cardName, timestamp } },
      { label: 'monto-15000', body: { monto: 1500, rawText: 'Pagaste $ 15.000', merchant, cardName, timestamp } },
      { label: 'monto-string-15000', body: { monto: '1500', rawText: 'Pagaste $ 15.000', merchant, cardName, timestamp } },
      { label: 'importe-15000', body: { importe: 1500, rawText: 'Pagaste $ 15.000', merchant, cardName, timestamp } },
      { label: 'importe-string', body: { importe: '1500', rawText: 'Pagaste $ 15.000', merchant, cardName, timestamp } },
      { label: 'value-15000', body: { value: 1500, rawText: 'Pagaste $ 15.000', merchant, cardName, timestamp } },
      { label: 'value-string', body: { value: '1500', rawText: 'Pagaste $ 15.000', merchant, cardName, timestamp } },
      { label: 'amount-ARS-15000', body: { amount: 1500, currency: 'ARS', rawText: 'Pagaste $ 15.000', merchant, cardName, timestamp } },
      { label: 'json-ARS-text-USD', body: { amount: 1500, currency: 'ARS', rawText: 'Pagaste USD 1.500', merchant, cardName, timestamp } },
      { label: 'no-currency-USD-15', body: { amount: 1500, rawText: 'Pagaste USD 15', merchant, cardName, timestamp } },
      { label: 'cents-800-vs-900', body: { amount: 800, rawText: 'Pagaste $ 900', merchant, cardName, timestamp } },
      { label: 'amount-string-suffix-USD', body: { amount: '15', rawText: 'Pagaste 15 USD', merchant, cardName, timestamp } },
    ];
    for (const [i, { body, label }] of parkBodies.entries()) {
      vi.clearAllMocks();
      const result = await postWalletWithAutoConfirm({
        rawText: String(body.rawText),
        key: `wallet-r15-json-${i}`,
        body: JSON.stringify(body),
      });
      expect(result.status, label).toBe(201);
      expect(result.body.autoConfirmed, label).toBe(false);
      expect(result.captured.row?.amount_ambiguous, label).toBe(true);
      expect(mocks.execute, label).not.toHaveBeenCalled();
    }

    vi.clearAllMocks();
    const match = await postWalletWithAutoConfirm({
      rawText: 'Pagaste $ 1.500',
      key: 'wallet-r15-json-match',
      body: JSON.stringify({
        amount: 1500,
        currency: 'ARS',
        rawText: 'Pagaste $ 1.500',
        merchant,
        cardName,
        timestamp,
      }),
    });
    expect(match.status).toBe(201);
    expect(match.body.item.amount).toBe(1500);
    expect(match.captured.row?.amount).toBe(1500);
    expect(match.captured.row?.amount_ambiguous).toBe(false);
    expect(match.captured.row?.currency).toBe('ARS');
  });

  it('parks round-15 deny roots, URLs, template hedges, unicode, accounting and national currencies', async () => {
    const park = [
      'Recordatorio: Pagaste $ 1.500',
      'Recordá Pagaste $ 1.500',
      'Resumen: Pagaste $ 1.500',
      'Aviso: Pagaste $ 1.500',
      'Pagaste $ 1.500 https://banco.test/refund',
      'Pagaste $ 1.500 user@banco.test',
      'Nunca pagaste $ 1.500',
      'no, pagaste $ 1.500',
      '¿Pagaste $ 1.500?',
      'Pagaste $ 1.500?',
      '“Pagaste $ 1.500”',
      '"Pagaste $ 1.500"',
      '«Pagaste $ 1.500»',
      "Pagaste '$ 1.500'",
      'Pagaste la mitad de $ 3.000',
      'Pagaste en COTO, Juan te debe $ 1.500',
      'Pagaste $ 1\u034F.500',
      'Pagaste $ 1\u0085.500',
      'Pagaste $ 1\u2028.500',
      'Pagaste $ 1\u2029.500',
      'Pagaste $1500-',
      'Pagaste ($1500)',
      'Pagaste $1500CR',
      'Pagaste $ 1.500 CR',
      'Pagaste USD 10 dólares canadienses',
      'Pagaste $ 1.500 pesos mexicanos',
      'Pagaste $ 1.500 pesos chilenos',
      'Pagaste $ 1.500 pesos uruguayos',
      'Pagaste USD 10 dólares australianos',
      'Pago de interés $ 1.500',
    ];
    for (const [i, rawText] of park.entries()) {
      vi.clearAllMocks();
      const result = await postWalletWithAutoConfirm({
        rawText,
        key: `wallet-r15-park-${i}`,
        contentType: 'text/plain',
        body: rawText,
      });
      expect(result.status, rawText).toBe(201);
      expect(result.body.autoConfirmed, rawText).toBe(false);
      expect(result.captured.row?.amount_ambiguous, rawText).toBe(true);
      expect(mocks.execute, rawText).not.toHaveBeenCalled();
    }
  });

  it('keeps the 30-format table and 8 positives auto-confirmable over HTTP', async () => {
    const nbsp1250 = `$ 1\u00a0250`;
    const nbspCents = `$\u00a01.250,50`;
    const tokens: Array<{ token: string; amount: number; currency?: string }> = [
      { token: '$ 1.250,50', amount: 1250.5 },
      { token: '$1250', amount: 1250 },
      { token: '$ 1.250', amount: 1250 },
      { token: 'USD 12,50', amount: 12.5, currency: 'USD' },
      { token: 'US$ 12.50', amount: 12.5, currency: 'USD' },
      { token: 'ARS 1.234,5', amount: 1234.5 },
      { token: '$ 0,99', amount: 0.99 },
      { token: '$ 1.000.000', amount: 1_000_000 },
      { token: nbsp1250, amount: 1250 },
      { token: nbspCents, amount: 1250.5 },
    ];
    expect(tokens).toHaveLength(10);
    let i = 0;
    for (const { token, amount, currency } of tokens) {
      for (const rawText of [`Pagaste ${token}`, `Pagaste ${token} en COTO`, `Pagaste ${token}.`]) {
        vi.clearAllMocks();
        const result = await postWalletWithAutoConfirm({
          rawText,
          key: `wallet-r15-fmt-${i++}`,
          contentType: 'text/plain',
          body: rawText,
        });
        expect(result.status, rawText).toBe(201);
        expect(result.body.item.amount, rawText).toBe(amount);
        expect(result.captured.row?.amount, rawText).toBe(amount);
        expect(result.captured.row?.amount_ambiguous, rawText).toBe(false);
        if (currency) expect(result.captured.row?.currency, rawText).toBe(currency);
      }
    }
    const positives = [
      { rawText: 'Pagaste $ 3.500', amount: 3500 },
      { rawText: 'Compraste en COTO por $ 1.250,50', amount: 1250.5 },
      { rawText: 'Pagaste con Visa terminada en 1234 por $ 5.000,00 en COTO S.A.', amount: 5000 },
      { rawText: 'Transferiste $ 8.000', amount: 8000 },
      { rawText: 'Pagaste con saldo $ 1.500 en COTO', amount: 1500 },
      { rawText: 'Compra aprobada US$ 12.50', amount: 12.5 },
      { rawText: 'Abonaste USD 10', amount: 10 },
      { rawText: '25/10 12:30 Pagaste $ 1.250,50', amount: 1250.5 },
    ];
    expect(positives).toHaveLength(8);
    for (const [j, { rawText, amount }] of positives.entries()) {
      vi.clearAllMocks();
      const result = await postWalletWithAutoConfirm({
        rawText,
        key: `wallet-r15-pos-${j}`,
        contentType: 'text/plain',
        body: rawText,
      });
      expect(result.status, rawText).toBe(201);
      expect(result.body.item.amount, rawText).toBe(amount);
      expect(result.captured.row?.amount, rawText).toBe(amount);
      expect(result.captured.row?.amount_ambiguous, rawText).toBe(false);
      expect(result.body.item.amount, rawText).not.toBe(1234);
    }
  });

  it('parks r16 monto unmarked-text regressions over HTTP with auto-confirm armed', async () => {
    const merchant = 'COTO';
    const cardName = 'tarjeta Visa';
    const timestamp = '2026-10-25T12:00:00.000Z';
    const examples: Array<{ label: string; body: Record<string, unknown> }> = [
      { label: 'monto15-compra-1500,50', body: { monto: 15, rawText: 'Compra 1.500,50 en COTO', merchant, cardName, timestamp } },
      { label: 'monto15-compra-aprobada-importe', body: { monto: 15, rawText: 'Compra aprobada Importe: 1.500,00', merchant, cardName, timestamp } },
      { label: 'monto1500-pagaste--1500', body: { monto: 1500, rawText: 'Pagaste -1500', merchant, cardName, timestamp } },
      { label: 'monto15-pagaste--15', body: { monto: 15, rawText: 'Pagaste -15', merchant, cardName, timestamp } },
      { label: 'monto15-pagaste-0', body: { monto: 15, rawText: 'Pagaste 0', merchant, cardName, timestamp } },
      { label: 'amount15-compra-1500,50', body: { amount: 15, rawText: 'Compra 1.500,50 en COTO', merchant, cardName, timestamp } },
      { label: 'importe15-compra-1500,50', body: { importe: 15, rawText: 'Compra 1.500,50 en COTO', merchant, cardName, timestamp } },
      { label: 'value15-compra-1500,50', body: { value: 15, rawText: 'Compra 1.500,50 en COTO', merchant, cardName, timestamp } },
    ];
    const sample: Array<{ label: string; body: Record<string, unknown> }> = [
      { label: 's-signed-bare', body: { monto: 1500, rawText: '-1500', merchant, cardName, timestamp } },
      { label: 's-us-group', body: { monto: 15, rawText: 'Compra 1,500.50 en COTO', merchant, cardName, timestamp } },
      { label: 's-compra-1500', body: { monto: 15, rawText: 'Compra 1.500 en COTO', merchant, cardName, timestamp } },
      { label: 's-ars-glued', body: { monto: 15, rawText: 'Compra ARS1.500', merchant, cardName, timestamp } },
      { label: 's-usd-glued', body: { monto: 1500, rawText: 'Compra USD10', merchant, cardName, timestamp } },
      { label: 's-aprobada-signed', body: { monto: 1500, rawText: 'Compra aprobada -1500', merchant, cardName, timestamp } },
      { label: 's-importe-label', body: { monto: 15, rawText: 'Importe: 1.500,00', merchant, cardName, timestamp } },
      { label: 's-pagaste-importe', body: { monto: 15, rawText: 'Pagaste Importe: 1.500,00', merchant, cardName, timestamp } },
      { label: 's-pagaste-1500,00', body: { monto: 15, rawText: 'Pagaste 1.500,00', merchant, cardName, timestamp } },
      { label: 's-pagaste-signed-group', body: { monto: 15, rawText: 'Pagaste -1.500,00', merchant, cardName, timestamp } },
      { label: 's-paren-15', body: { monto: 1500, rawText: 'Pagaste (15)', merchant, cardName, timestamp } },
      { label: 's-trailing-minus', body: { monto: 1500, rawText: 'Pagaste 15-', merchant, cardName, timestamp } },
      { label: 's-15CR', body: { monto: 1500, rawText: 'Pagaste 15CR', merchant, cardName, timestamp } },
      { label: 's-pagaste-15', body: { monto: 1500, rawText: 'Pagaste 15', merchant, cardName, timestamp } },
      { label: 's-euro-prefix', body: { monto: 1500, rawText: 'Pagaste €15', merchant, cardName, timestamp } },
      { label: 's-euro-suffix', body: { monto: 1500, rawText: 'Pagaste 15 €', merchant, cardName, timestamp } },
      { label: 's-quince', body: { monto: 1500, rawText: 'Pagaste quince', merchant, cardName, timestamp } },
      { label: 's-pesos-unmarked', body: { monto: 15, rawText: 'Pagaste 1.500,00 pesos', merchant, cardName, timestamp } },
      { label: 's-dolares', body: { monto: 1500, currency: 'USD', rawText: 'Pagaste 15 dólares', merchant, cardName, timestamp } },
      { label: 's-euros', body: { monto: 1500, currency: 'EUR', rawText: 'Pagaste 15 euros', merchant, cardName, timestamp } },
      { label: 's-15.00', body: { monto: 15, rawText: 'Pagaste 15.00', merchant, cardName, timestamp } },
      { label: 's-1.500', body: { monto: 15, rawText: 'Pagaste 1.500', merchant, cardName, timestamp } },
      { label: 's-1,500', body: { monto: 15, rawText: 'Pagaste 1,500', merchant, cardName, timestamp } },
      { label: 's-monto-string', body: { monto: '15', rawText: 'Compra 1.500,50 en COTO', merchant, cardName, timestamp } },
      { label: 's-currency-ARS', body: { monto: 15, currency: 'ARS', rawText: 'Compra 1.500,50 en COTO', merchant, cardName, timestamp } },
      { label: 's-currency-USD', body: { monto: 15, currency: 'USD', rawText: 'Compra 1.500,50 en COTO', merchant, cardName, timestamp } },
      { label: 's-currency-EUR', body: { monto: 15, currency: 'EUR', rawText: 'Compra 1.500,50 en COTO', merchant, cardName, timestamp } },
      { label: 's-monto1500-vs-1500,50', body: { monto: 1500, rawText: 'Compra 1.500,50 en COTO', merchant, cardName, timestamp } },
      { label: 's-pagaste-0-string', body: { monto: '15', rawText: 'Pagaste 0', merchant, cardName, timestamp } },
      { label: 's-pagaste--15-string', body: { monto: '15', rawText: 'Pagaste -15', merchant, cardName, timestamp } },
    ];
    expect(sample.length).toBeGreaterThanOrEqual(30);
    for (const [i, { label, body }] of [...examples, ...sample].entries()) {
      vi.clearAllMocks();
      const result = await postWalletWithAutoConfirm({
        rawText: String(body.rawText),
        key: `wallet-r16-monto-${i}`,
        body: JSON.stringify(body),
      });
      expect(result.status, label).toBe(201);
      expect(result.body.autoConfirmed, label).toBe(false);
      expect(result.captured.row?.amount_ambiguous, label).toBe(true);
      expect(mocks.execute, label).not.toHaveBeenCalled();
    }
  });

  it('keeps Kael 12 real notifications auto-confirmable over HTTP', async () => {
    const twelve = [
      { rawText: 'Pagaste $ 3.500', amount: 3500, currency: 'ARS' },
      { rawText: 'Compraste en COTO por $ 1.250,50', amount: 1250.5, currency: 'ARS' },
      { rawText: '25/10 12:30 Pagaste $ 1.250,50', amount: 1250.5, currency: 'ARS' },
      { rawText: 'Transferiste $ 8.000', amount: 8000, currency: 'ARS' },
      { rawText: 'Pagaste con saldo $ 1.500 en COTO', amount: 1500, currency: 'ARS' },
      { rawText: 'Compra aprobada US$ 12.50', amount: 12.5, currency: 'USD' },
      { rawText: 'Abonaste USD 10', amount: 10, currency: 'USD' },
      { rawText: 'Pagaste con Visa terminada en 1234 por $ 5.000,00 en COTO S.A.', amount: 5000, currency: 'ARS' },
      { rawText: 'Abonaste USD $10', amount: 10, currency: 'USD' },
      { rawText: 'Abonaste EUR $10', amount: 10, currency: 'EUR' },
      { rawText: 'Pagaste $10 US$', amount: 10, currency: 'USD' },
      { rawText: 'Pagaste $ 10 US$ en COTO', amount: 10, currency: 'USD' },
    ];
    expect(twelve).toHaveLength(12);
    for (const [i, { rawText, amount, currency }] of twelve.entries()) {
      vi.clearAllMocks();
      const result = await postWalletWithAutoConfirm({
        rawText,
        key: `wallet-r16-kael12-${i}`,
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
