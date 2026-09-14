import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
const state = vi.hoisted(() => ({ rows: new Map<string, any>(), inserts: 0, balance: 1000, userId: 'user-a' }));
vi.mock('@/lib/supabase/server', () => ({ createServiceClientSync: () => ({
  from: (table: string) => {
    const filters: Record<string, unknown> = {};
    let payload: any;
    const query = {
      select: () => query,
      eq: (key: string, value: unknown) => { filters[key] = value; return query; },
      insert: (value: unknown) => { payload = value; return query; },
      maybeSingle: async () => {
        const row = state.rows.get(String(filters.id));
        return { data: row?.user_id === filters.user_id ? row : null, error: null };
      },
      single: async () => {
        if (table === 'accounts') return { data: { id: filters.id, user_id: filters.user_id, currency: 'ARS', is_active: true }, error: null };
        if (state.rows.has(payload.id)) return { data: null, error: { code: '23505' } };
        state.rows.set(payload.id, payload);
        state.inserts++;
        state.balance -= payload.amount;
        return { data: payload, error: null };
      },
    };
    return query;
  },
}) }));
vi.mock('@/lib/services/accounts', () => ({ accountsService: {}, normalizeDebtBalanceForStorage: vi.fn() }));
vi.mock('@/lib/services/cotizaciones', () => ({ cotizacionesService: { getExchangeRate: vi.fn() } }));
vi.mock('@/lib/offline-reference-cache', () => ({ getOfflineUserId: async () => state.userId }));
import { transactionsService, offlineTransactionId, type CreateTransactionInput } from '@/lib/services/transactions';
import { dbAdd, dbGetAll, syncPendingTransactions } from '@/lib/hooks/useOfflineQueue';

const key = '6de23313-c580-467a-ae6e-49464d822173';
const input = (): CreateTransactionInput => ({ userId: 'user-a', type: 'expense', accountId: 'account-a', amount: 100, currency: 'ARS', clientRequestId: key });
beforeEach(() => {
  state.rows.clear(); state.inserts = 0; state.balance = 1000; state.userId = 'user-a';
  vi.stubGlobal('indexedDB', new IDBFactory());
  vi.stubGlobal('navigator', {});
});

describe('Offline idempotente sin una segunda modificación de saldo', () => {
  it('recupera el original al repetir la clave e ignora campos cambiados', async () => {
    const first = await transactionsService.create(input());
    const second = await transactionsService.create({ ...input(), amount: 999, description: 'Intento cambiado' });
    expect(second).toEqual(first);
    expect(second.amount).toBe(100);
    expect(state.inserts).toBe(1);
    expect(state.balance).toBe(900);
  });
  it('recupera la misma fila después de dos inserts concurrentes', async () => {
    const [a, b] = await Promise.all([transactionsService.create(input()), transactionsService.create(input())]);
    expect(a.id).toBe(b.id);
    expect(state.inserts).toBe(1);
    expect(state.balance).toBe(900);
  });
  it('aplica el mismo mecanismo a transferencias', async () => {
    const transfer = { ...input(), type: 'transfer' as const, destinationAccountId: 'destination-a' };
    const [a, b] = await Promise.all([transactionsService.create(transfer), transactionsService.create(transfer)]);
    expect(a.id).toBe(b.id);
    expect(state.inserts).toBe(1);
  });
  it('separa las claves de dos usuarios y normaliza mayúsculas del UUID', () => {
    expect(offlineTransactionId('user-a', key)).not.toBe(offlineTransactionId('user-b', key));
    expect(offlineTransactionId('user-a', key)).toBe(offlineTransactionId('user-a', key.toUpperCase()));
  });
  it('rechaza claves inválidas y cuotas antes de insertar', async () => {
    await expect(transactionsService.create({ ...input(), clientRequestId: 'invalid' })).rejects.toThrow('Identificador');
    await expect(transactionsService.create({ ...input(), installments: 2 })).rejects.toThrow('cuotas');
    expect(state.inserts).toBe(0);
  });
  it('no duplica una transacción si el servidor la guardó pero se perdió la respuesta', async () => {
    await dbAdd({ id: key, userId: 'user-a', createdAt: 1, payload: {
      type: 'expense', accountId: 'account-a', amount: 100, currency: 'ARS', categoryId: null,
      description: 'Sin conexión', transactionDate: '2026-09-14',
    } });
    let first = true;
    vi.stubGlobal('fetch', vi.fn(async (_url, options) => {
      const body = JSON.parse(options.body);
      expect(body.clientRequestId).toBe(key);
      const row = await transactionsService.create({ ...body, userId: state.userId });
      if (first) { first = false; throw new Error('Respuesta perdida después del commit'); }
      return new Response(JSON.stringify(row), { status: 201 });
    }));
    await syncPendingTransactions();
    expect(await dbGetAll()).toHaveLength(1);
    await syncPendingTransactions();
    expect(await dbGetAll()).toHaveLength(0);
    expect(state.inserts).toBe(1);
    expect(state.balance).toBe(900);
  });
});
