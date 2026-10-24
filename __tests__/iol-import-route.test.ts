import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { ApiError } from '@/lib/api-handler';

const FIXTURE_USER = 'fixture-import-user';
const FIXTURE_ACCOUNT = 'acct-fixture';

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  listInvestmentAccounts: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'fixture-import-user' } } }) },
  }),
}));
vi.mock('@/lib/services/investments', () => ({
  investmentsService: { create: mocks.create },
}));
vi.mock('@/lib/services/accounts', () => ({
  accountsService: { listInvestmentAccounts: mocks.listInvestmentAccounts },
}));

import { POST } from '@/app/api/import/investments/route';

function csvFile(price: string) {
  return new File(
    [`Simbolo,Descripcion,Cantidad,PPC,Ultimo,Moneda,Tipo\nAL30D,BONO,100,91.5,${price},USD,Bono\n`],
    'portafolio.csv',
    { type: 'text/csv' }
  );
}

async function importCsv(price: string) {
  const body = new FormData();
  body.set('file', csvFile(price));
  body.set('accountId', FIXTURE_ACCOUNT);
  return POST(new NextRequest('http://localhost/api/import/investments', { method: 'POST', body }));
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.listInvestmentAccounts.mockResolvedValue([{ id: FIXTURE_ACCOUNT }]);
});

describe('IOL investment import conflicts', () => {
  it('reports a changed price/quantity as updated/conflict without overwriting', async () => {
    mocks.create.mockRejectedValue(new ApiError('La solicitud ya se usó con otros datos.', 409));
    const response = await importCsv('93');
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      imported: 0,
      skipped: 0,
      failed: 0,
      updated: 1,
      conflicts: 1,
      conflictRows: [expect.objectContaining({ ticker: 'AL30D' })],
    });
    expect(mocks.create).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      userId: FIXTURE_USER,
      accountId: FIXTURE_ACCOUNT,
      ticker: 'AL30D',
    }));
  });

  it('counts an exact retry as imported when create reuses the existing row', async () => {
    mocks.create.mockResolvedValue({ id: 'inv-fixture', ticker: 'AL30D' });
    const response = await importCsv('92');
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      imported: 1,
      skipped: 0,
      failed: 0,
      updated: 0,
      conflicts: 0,
    });
  });
});
