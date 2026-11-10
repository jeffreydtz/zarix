import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  from: vi.fn(),
  getById: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: mocks.getUser },
    from: mocks.from,
  }),
}));

vi.mock('@/lib/services/categories', () => ({
  categoriesService: { getById: (...args: unknown[]) => mocks.getById(...args) },
}));

import { POST } from '@/app/api/recurring/route';

const USER = 'user-1';
const ACCOUNT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
const SYSTEM_CATEGORY = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1';

function request(body: unknown) {
  return new NextRequest('http://localhost/api/recurring', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const validBody = {
  type: 'expense',
  accountId: ACCOUNT,
  amount: '15.000,50',
  currency: 'ARS',
  categoryId: SYSTEM_CATEGORY,
  description: 'Netflix',
  frequency: 'monthly',
  startDate: '2026-11-10',
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  mocks.getUser.mockResolvedValue({ data: { user: { id: USER } }, error: null });
  mocks.getById.mockResolvedValue({ id: SYSTEM_CATEGORY, name: 'Suscripciones', is_system: true });
  mocks.from.mockImplementation((table: string) => {
    const query: Record<string, unknown> = {};
    const self = query;
    query.select = vi.fn(() => self);
    query.eq = vi.fn(() => self);
    query.maybeSingle = vi.fn(async () => {
      if (table === 'accounts') return { data: { id: ACCOUNT }, error: null };
      return { data: null, error: null };
    });
    query.insert = vi.fn(() => self);
    query.single = vi.fn(async () => {
      if (table === 'recurring_rules') {
        return {
          data: { id: 'rule-1', user_id: USER, account_id: ACCOUNT, category_id: SYSTEM_CATEGORY, amount: 15000.5 },
          error: null,
        };
      }
      return { data: null, error: null };
    });
    return query;
  });
});
afterEach(() => vi.restoreAllMocks());

describe('POST /api/recurring', () => {
  it('accepts a system category and Argentine money string', async () => {
    const res = await POST(request(validBody));
    expect(res.status).toBe(201);
    expect(mocks.getById).toHaveBeenCalledWith(SYSTEM_CATEGORY, USER);
    const json = await res.json();
    expect(json.category_id).toBe(SYSTEM_CATEGORY);
    expect(json.amount).toBe(15000.5);
  });

  it('rejects an unknown category instead of treating system rows as invalid', async () => {
    mocks.getById.mockRejectedValue(new Error('not found'));
    const res = await POST(request(validBody));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Categoría inválida' });
  });
});
