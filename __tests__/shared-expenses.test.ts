import { describe, it, expect } from 'vitest';
import {
  splitEqually,
  computeBalances,
  computeSettlements,
  isValidShareToken,
  type SharedGroupMember,
  type SharedExpense,
  type MemberBalance,
} from '@/lib/services/sharedExpenses';

function member(id: string, name = id): SharedGroupMember {
  return { id, group_id: 'g', user_id: null, display_name: name, email: null, phone: null };
}

describe('splitEqually — cent distribution', () => {
  it('distributes the remainder cent-by-cent and sums exactly to the total', () => {
    const parts = splitEqually(100, ['a', 'b', 'c']);
    expect(parts.map((p) => p.amount)).toEqual([33.34, 33.33, 33.33]);
    const total = parts.reduce((s, p) => s + p.amount, 0);
    expect(Math.round(total * 100)).toBe(10000);
  });

  it('handles a small amount with a leftover cent', () => {
    expect(splitEqually(10, ['a', 'b', 'c']).map((p) => p.amount)).toEqual([3.34, 3.33, 3.33]);
  });

  it('splits evenly when it divides cleanly', () => {
    expect(splitEqually(100, ['a', 'b']).map((p) => p.amount)).toEqual([50, 50]);
  });

  it('assigns the whole amount to a single member', () => {
    expect(splitEqually(42.5, ['solo'])).toEqual([{ member_id: 'solo', amount: 42.5 }]);
  });
});

describe('computeBalances', () => {
  it('computes paid / owed / net per member', () => {
    const members = [member('a', 'Ana'), member('b', 'Bob')];
    const expenses: SharedExpense[] = [
      {
        id: 'e1',
        group_id: 'g',
        paid_by_member_id: 'a',
        description: 'Dinner',
        amount: 100,
        expense_date: '2026-01-01',
        created_at: '2026-01-01',
        splits: [
          { member_id: 'a', amount: 50 },
          { member_id: 'b', amount: 50 },
        ],
      },
    ];
    const balances = computeBalances(members, expenses);
    const a = balances.find((x) => x.member_id === 'a')!;
    const b = balances.find((x) => x.member_id === 'b')!;
    expect(a).toMatchObject({ paid: 100, owed: 50, net: 50 });
    expect(b).toMatchObject({ paid: 0, owed: 50, net: -50 });
  });
});

describe('computeSettlements — greedy debtor/creditor matching', () => {
  it('settles a simple two-person debt', () => {
    const balances: MemberBalance[] = [
      { member_id: 'a', display_name: 'Ana', paid: 100, owed: 50, net: 50 },
      { member_id: 'b', display_name: 'Bob', paid: 0, owed: 50, net: -50 },
    ];
    const settlements = computeSettlements(balances);
    expect(settlements).toHaveLength(1);
    expect(settlements[0]).toMatchObject({ from_member_id: 'b', to_member_id: 'a', amount: 50 });
  });

  it('splits one creditor across multiple debtors', () => {
    const balances: MemberBalance[] = [
      { member_id: 'a', display_name: 'A', paid: 100, owed: 0, net: 100 },
      { member_id: 'b', display_name: 'B', paid: 0, owed: 60, net: -60 },
      { member_id: 'c', display_name: 'C', paid: 0, owed: 40, net: -40 },
    ];
    const settlements = computeSettlements(balances);
    expect(settlements).toHaveLength(2);
    const total = settlements.reduce((s, x) => s + x.amount, 0);
    expect(total).toBe(100);
    // largest debtor first
    expect(settlements[0]).toMatchObject({ from_member_id: 'b', to_member_id: 'a', amount: 60 });
    expect(settlements[1]).toMatchObject({ from_member_id: 'c', to_member_id: 'a', amount: 40 });
  });

  it('returns no settlements when everyone is squared up', () => {
    const balances: MemberBalance[] = [
      { member_id: 'a', display_name: 'A', paid: 50, owed: 50, net: 0 },
      { member_id: 'b', display_name: 'B', paid: 50, owed: 50, net: 0 },
    ];
    expect(computeSettlements(balances)).toEqual([]);
  });
});

describe('isValidShareToken', () => {
  it('accepts 32 lowercase hex chars', () => {
    expect(isValidShareToken('a'.repeat(32))).toBe(true);
    expect(isValidShareToken('0123456789abcdef0123456789abcdef')).toBe(true);
  });

  it('rejects wrong length, uppercase, and non-hex', () => {
    expect(isValidShareToken('a'.repeat(31))).toBe(false);
    expect(isValidShareToken('a'.repeat(33))).toBe(false);
    expect(isValidShareToken('A'.repeat(32))).toBe(false); // uppercase not allowed
    expect(isValidShareToken('g'.repeat(32))).toBe(false); // non-hex
    expect(isValidShareToken('')).toBe(false);
  });
});
