import { describe, expect, it, vi } from 'vitest';
const db = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createServiceClientSync: () => db }));
import { redeemLinkCode } from '@/lib/telegram/link-code';

describe('atomic Telegram link code', () => {
  it('allows only one consumer and scopes custom codes to the owner', async () => {
    let available = true;
    const filters: unknown[][] = [];
    db.from.mockImplementation(() => {
      const q = { update: vi.fn(() => q), eq: vi.fn((...args) => { filters.push(args); return q; }), gt: vi.fn(() => q), select: vi.fn(() => q), maybeSingle: vi.fn(async () => { const found = available; available = false; return { data:found ? {id:'owner'}:null,error:null }; }) };
      return q;
    });
    expect(await Promise.all([redeemLinkCode('abcdef123456',123,'alice','owner'),redeemLinkCode('abcdef123456',456,'bob','owner')])).toEqual(['ok','invalid']);
    expect(filters).toContainEqual(['telegram_link_code','ABCDEF123456']);
    expect(filters).toContainEqual(['id','owner']);
  });
  it('preserves unique-chat conflict and propagates database failures', async () => {
    const q = { update:()=>q, eq:()=>q, gt:()=>q, select:()=>q, maybeSingle:vi.fn().mockResolvedValue({data:null,error:{code:'23505'}}) };
    db.from.mockReturnValue(q);
    expect(await redeemLinkCode('ABCD1234',123)).toBe('taken');
    q.maybeSingle.mockResolvedValue({data:null,error:{code:'08006'}});
    await expect(redeemLinkCode('ABCD1234',123)).rejects.toEqual({code:'08006'});
  });
});
