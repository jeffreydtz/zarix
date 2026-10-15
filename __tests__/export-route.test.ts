import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { parseCSVFile } from '@/lib/import/csv';

const mocks = vi.hoisted(() => ({ list: vi.fn(), user: { id: 'viewer' } as { id: string } | null }));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: mocks.user } }) } }),
}));
vi.mock('@/lib/services/transactions', () => ({ transactionsService: { list: mocks.list } }));
import { GET } from '@/app/api/export/transactions/route';

const transfer = {
  id: 'transfer-id', type: 'transfer', amount: 100, currency: 'USD',
  amount_in_account_currency: 95000, destination_amount_in_account_currency: 100,
  exchange_rate: 1, transaction_date: '2026-01-15T12:00:00Z',
  account: { name: 'Caja "ARS"', currency: 'ARS' },
  destination_account: { name: 'Dólares', currency: 'USD' },
  category: { name: 'Cambio, ahorro' }, description: 'Cambio\ncon "comprobante"', notes: '',
};
beforeEach(() => {
  mocks.user = { id: 'viewer' };
  mocks.list.mockReset().mockResolvedValue([transfer]);
});

describe('export preserving transaction equivalents', () => {
  it('exports original and both account amounts without losing the currencies', async () => {
    const response = await GET(new NextRequest('http://localhost/api/export/transactions?format=json'));
    expect(response.status).toBe(200);
    expect((await response.json())[0]).toMatchObject({
      amount: 100, currency: 'USD', amountInAccountCurrency: 95000,
      destinationAmountInAccountCurrency: 100, accountCurrency: 'ARS', destinationCurrency: 'USD',
      account: 'Caja "ARS"', destinationAccount: 'Dólares',
    });
    expect(mocks.list).toHaveBeenCalledWith('viewer', expect.objectContaining({ limit: 10000 }));
  });

  it('round-trips quoted names and multiline descriptions as one CSV record', async () => {
    const response = await GET(new NextRequest('http://localhost/api/export/transactions?format=csv'));
    const { rows } = parseCSVFile(await response.text());
    expect(rows).toHaveLength(1);
    expect(rows[0][5]).toBe('Caja "ARS"');
    expect(rows[0][6]).toBe('Cambio, ahorro');
    expect(rows[0][7]).toBe('Cambio\ncon "comprobante"');
    expect(rows[0].slice(10, 14)).toEqual(['Dólares', 'ARS', 'USD', '100']);
  });

  it('refuses an export without an authenticated user before listing transactions', async () => {
    mocks.user = null;
    const response = await GET(new NextRequest('http://localhost/api/export/transactions'));
    expect(response.status).toBe(401);
    expect(mocks.list).not.toHaveBeenCalled();
  });
});
