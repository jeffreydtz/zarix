import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  getUser: vi.fn(),
}));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: mocks.getUser } }),
}));
vi.mock('@/lib/services/transactions', () => ({
  transactionsService: { list: mocks.list },
}));

import { GET } from '@/app/api/export/transactions/route';

beforeEach(() => {
  mocks.getUser.mockResolvedValue({ data: { user: { id: 'synthetic-owner' } } });
  mocks.list.mockResolvedValue([{
    id: 'synthetic-transaction', type: 'expense', amount: 500, currency: 'ARS',
    amount_in_account_currency: 500, transaction_date: '2026-10-07T00:30:00Z',
    account: { name: 'Synthetic account', currency: 'ARS' },
    category: { name: 'Synthetic category' },
  }]);
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

describe('transaction export format contract', () => {
  it.each(['csv', 'json'])('declares the existing %s format version and UTC timezone', async format => {
    const response = await GET(new NextRequest(`http://localhost/api/export/transactions?format=${format}`));
    expect(response.status).toBe(200);
    expect(response.headers.get('X-Zarix-Export-Version')).toBe('1');
    expect(response.headers.get('X-Zarix-Export-Timezone')).toBe('UTC');
    expect(mocks.list).toHaveBeenLastCalledWith('synthetic-owner', expect.objectContaining({ limit: 10000 }));
    if (format === 'json') {
      const rows = await response.json();
      expect(Array.isArray(rows)).toBe(true);
      expect(rows[0]).toMatchObject({ id: 'synthetic-transaction', date: '2026-10-07T00:30:00Z', amount: 500 });
    }
  });

  it('exports the declared UTC calendar date even when the server uses another timezone', async () => {
    vi.stubEnv('TZ', 'America/Argentina/Buenos_Aires');
    const dateFormatter = vi.spyOn(Date.prototype, 'toLocaleDateString');
    const response = await GET(new NextRequest('http://localhost/api/export/transactions?format=csv'));
    const csv = await response.text();
    expect(dateFormatter).toHaveBeenCalledWith('es-AR', { timeZone: 'UTC' });
    expect(csv.split('\n')[1]).toMatch(/^"7\/10\/2026","Gasto","500","ARS"/);
    expect(csv.split('\n')[0].split(',')).toHaveLength(15);
  });
});
