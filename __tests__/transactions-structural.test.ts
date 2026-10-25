import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  applyArchivedAccountsTransactionFilter,
  buildToArsConverter,
  excludedCurrenciesNote,
} from '@/lib/services/transactions';

vi.mock('@/lib/services/cotizaciones', () => ({
  cotizacionesService: {
    getExchangeRate: vi.fn(),
  },
}));

import { cotizacionesService } from '@/lib/services/cotizaciones';

function makeQuery() {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const query: Record<string, (...args: unknown[]) => typeof query> = {};
  for (const method of ['eq', 'filter', 'or']) {
    query[method] = (...args: unknown[]) => {
      calls.push({ method, args });
      return query;
    };
  }
  return { query, calls };
}

describe('CU-001 applyArchivedAccountsTransactionFilter', () => {
  it('returns impossible id filter when there are no active accounts (branch B1)', () => {
    const { query, calls } = makeQuery();
    applyArchivedAccountsTransactionFilter(query, []);
    expect(calls).toEqual([
      { method: 'eq', args: ['id', '00000000-0000-0000-0000-000000000000'] },
    ]);
  });

  it('filters by active account ids when list is non-empty (branch B2)', () => {
    const { query, calls } = makeQuery();
    const ids = ['aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'];
    applyArchivedAccountsTransactionFilter(query, ids);
    expect(calls[0]).toEqual({
      method: 'filter',
      args: ['account_id', 'in', `("${ids[0]}")`],
    });
    expect(calls[1]).toEqual({
      method: 'or',
      args: [`destination_account_id.is.null,destination_account_id.in.("${ids[0]}")`],
    });
  });

  it('quotes UUIDs for PostgREST reserved characters (edge E3)', () => {
    const { query, calls } = makeQuery();
    const id = '11111111-2222-3333-4444-555555555555';
    applyArchivedAccountsTransactionFilter(query, [id]);
    expect(calls[0].args[2]).toContain(`"${id}"`);
  });
});

describe('CU-001 buildToArsConverter', () => {
  beforeEach(() => {
    vi.mocked(cotizacionesService.getExchangeRate).mockReset();
  });

  it('uses rate 1 for ARS without calling cotizaciones (branch B1)', async () => {
    const { toArs, excludedCurrencies } = await buildToArsConverter([
      { currency: 'ARS' },
    ]);
    expect(toArs({ amount: 100, currency: 'ARS' })).toBe(100);
    expect(excludedCurrencies).toEqual([]);
    expect(cotizacionesService.getExchangeRate).not.toHaveBeenCalled();
  });

  it('converts foreign currency using live rate (branch B2 success)', async () => {
    vi.mocked(cotizacionesService.getExchangeRate).mockResolvedValue(1200);
    const { toArs, excludedCurrencies } = await buildToArsConverter([
      { currency: 'USD' },
    ]);
    expect(toArs({ amount: 10, currency: 'USD' })).toBe(12000);
    expect(excludedCurrencies).toEqual([]);
    expect(cotizacionesService.getExchangeRate).toHaveBeenCalledWith('USD', 'ARS');
  });

  it('excludes currencies when rate lookup fails (branch B3 catch)', async () => {
    vi.mocked(cotizacionesService.getExchangeRate).mockRejectedValue(new Error('offline'));
    const { toArs, excludedCurrencies } = await buildToArsConverter([
      { currency: 'EUR' },
    ]);
    expect(toArs({ amount: 50, currency: 'EUR' })).toBeNull();
    expect(excludedCurrencies).toEqual(['EUR']);
  });

  it('defaults null currency to ARS (edge E4)', async () => {
    const { toArs } = await buildToArsConverter([{ currency: null }]);
    expect(toArs({ amount: 25, currency: null })).toBe(25);
  });
});

describe('CU-001 excludedCurrenciesNote', () => {
  it('returns null when no currencies were excluded (branch B1)', () => {
    expect(excludedCurrenciesNote([])).toBeNull();
  });

  it('returns warning text when currencies were excluded (branch B2)', () => {
    expect(excludedCurrenciesNote(['USD', 'EUR'])).toBe(
      '⚠️ Sin cotización para USD, EUR: esos movimientos no están incluidos en los totales.'
    );
  });
});
