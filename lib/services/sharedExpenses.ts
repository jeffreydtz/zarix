import { randomBytes } from 'crypto';
import { createServiceClientSync } from '@/lib/supabase/server';

// ── Tipos ───────────────────────────────────────────────────────────

export interface SharedGroup {
  id: string;
  owner_user_id: string;
  name: string;
  currency: string;
  share_token: string;
  is_active: boolean;
  created_at: string;
}

export interface SharedGroupMember {
  id: string;
  group_id: string;
  user_id: string | null;
  display_name: string;
  email: string | null;
  phone: string | null;
}

export interface SharedExpenseSplit {
  member_id: string;
  amount: number;
}

export interface SharedExpense {
  id: string;
  group_id: string;
  paid_by_member_id: string;
  description: string;
  amount: number;
  expense_date: string;
  created_at: string;
  splits: SharedExpenseSplit[];
}

export interface MemberBalance {
  member_id: string;
  display_name: string;
  paid: number;
  owed: number;
  /** positivo = le deben, negativo = debe */
  net: number;
}

export interface Settlement {
  from_member_id: string;
  from_name: string;
  to_member_id: string;
  to_name: string;
  amount: number;
}

export interface SharedGroupDetail {
  group: Pick<SharedGroup, 'id' | 'name' | 'currency' | 'created_at'>;
  members: SharedGroupMember[];
  expenses: SharedExpense[];
  totalSpent: number;
  balances: MemberBalance[];
  settlements: Settlement[];
}

export interface CreateSharedGroupInput {
  ownerUserId: string;
  name: string;
  currency: string;
  members: Array<{ displayName: string; email?: string | null; phone?: string | null }>;
}

const TOKEN_REGEX = /^[a-f0-9]{32}$/;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function isValidShareToken(token: string): boolean {
  return TOKEN_REGEX.test(token);
}

// ── Cálculo de saldos y liquidación (greedy) ────────────────────────

export function computeBalances(
  members: SharedGroupMember[],
  expenses: SharedExpense[]
): MemberBalance[] {
  const byId = new Map<string, MemberBalance>(
    members.map((m) => [
      m.id,
      { member_id: m.id, display_name: m.display_name, paid: 0, owed: 0, net: 0 },
    ])
  );

  for (const expense of expenses) {
    const payer = byId.get(expense.paid_by_member_id);
    if (payer) payer.paid = round2(payer.paid + expense.amount);
    for (const split of expense.splits) {
      const member = byId.get(split.member_id);
      if (member) member.owed = round2(member.owed + split.amount);
    }
  }

  for (const balance of byId.values()) {
    balance.net = round2(balance.paid - balance.owed);
  }
  return Array.from(byId.values());
}

export function computeSettlements(balances: MemberBalance[]): Settlement[] {
  const debtors = balances
    .filter((b) => b.net < -0.005)
    .map((b) => ({ ...b, remaining: -b.net }))
    .sort((a, b) => b.remaining - a.remaining);
  const creditors = balances
    .filter((b) => b.net > 0.005)
    .map((b) => ({ ...b, remaining: b.net }))
    .sort((a, b) => b.remaining - a.remaining);

  const settlements: Settlement[] = [];
  let d = 0;
  let c = 0;
  while (d < debtors.length && c < creditors.length) {
    const amount = round2(Math.min(debtors[d].remaining, creditors[c].remaining));
    if (amount > 0) {
      settlements.push({
        from_member_id: debtors[d].member_id,
        from_name: debtors[d].display_name,
        to_member_id: creditors[c].member_id,
        to_name: creditors[c].display_name,
        amount,
      });
    }
    debtors[d].remaining = round2(debtors[d].remaining - amount);
    creditors[c].remaining = round2(creditors[c].remaining - amount);
    if (debtors[d].remaining <= 0.005) d++;
    if (creditors[c].remaining <= 0.005) c++;
  }
  return settlements;
}

/** Divide un monto en partes iguales repartiendo el sobrante en centavos. */
export function splitEqually(amount: number, memberIds: string[]): SharedExpenseSplit[] {
  const cents = Math.round(amount * 100);
  const base = Math.floor(cents / memberIds.length);
  let remainder = cents - base * memberIds.length;
  return memberIds.map((memberId) => {
    const extra = remainder > 0 ? 1 : 0;
    remainder -= extra;
    return { member_id: memberId, amount: (base + extra) / 100 };
  });
}

// ── Servicio ────────────────────────────────────────────────────────

class SharedExpensesService {
  async createGroup(input: CreateSharedGroupInput): Promise<SharedGroup> {
    const supabase = createServiceClientSync();
    const shareToken = randomBytes(16).toString('hex');

    const { data: group, error } = await supabase
      .from('shared_groups')
      .insert({
        owner_user_id: input.ownerUserId,
        name: input.name,
        currency: input.currency,
        share_token: shareToken,
      })
      .select()
      .single();

    if (error) throw error;

    if (input.members.length > 0) {
      const { error: membersError } = await supabase.from('shared_group_members').insert(
        input.members.map((m) => ({
          group_id: group.id,
          display_name: m.displayName,
          email: m.email || null,
          phone: m.phone || null,
        }))
      );
      if (membersError) {
        // No dejar un grupo a medias si fallan los miembros
        await supabase.from('shared_groups').delete().eq('id', group.id);
        throw membersError;
      }
    }

    return group;
  }

  async listGroupsForOwner(
    userId: string
  ): Promise<Array<SharedGroup & { member_count: number; total_spent: number }>> {
    const supabase = createServiceClientSync();

    const { data: groups, error } = await supabase
      .from('shared_groups')
      .select('*, shared_group_members(id), shared_expenses(amount)')
      .eq('owner_user_id', userId)
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return (groups || []).map((g: any) => ({
      ...g,
      member_count: (g.shared_group_members || []).length,
      total_spent: round2(
        (g.shared_expenses || []).reduce((sum: number, e: any) => sum + Number(e.amount), 0)
      ),
      shared_group_members: undefined,
      shared_expenses: undefined,
    }));
  }

  async deleteGroup(groupId: string, userId: string): Promise<void> {
    const supabase = createServiceClientSync();
    const { error } = await supabase
      .from('shared_groups')
      .delete()
      .eq('id', groupId)
      .eq('owner_user_id', userId);
    if (error) throw error;
  }

  /** Acceso por token (link público). Devuelve null si el token no existe. */
  async getGroupByToken(token: string): Promise<SharedGroupDetail | null> {
    if (!isValidShareToken(token)) return null;
    const supabase = createServiceClientSync();

    const { data: group, error } = await supabase
      .from('shared_groups')
      .select('id, name, currency, created_at')
      .eq('share_token', token)
      .eq('is_active', true)
      .maybeSingle();

    if (error) throw error;
    if (!group) return null;

    const [membersRes, expensesRes] = await Promise.all([
      supabase
        .from('shared_group_members')
        .select('id, group_id, user_id, display_name, email, phone')
        .eq('group_id', group.id)
        .order('created_at', { ascending: true }),
      supabase
        .from('shared_expenses')
        .select('id, group_id, paid_by_member_id, description, amount, expense_date, created_at, shared_expense_splits(member_id, amount)')
        .eq('group_id', group.id)
        .order('expense_date', { ascending: false })
        .order('created_at', { ascending: false }),
    ]);

    if (membersRes.error) throw membersRes.error;
    if (expensesRes.error) throw expensesRes.error;

    const members = membersRes.data || [];
    const expenses: SharedExpense[] = (expensesRes.data || []).map((e: any) => ({
      id: e.id,
      group_id: e.group_id,
      paid_by_member_id: e.paid_by_member_id,
      description: e.description,
      amount: Number(e.amount),
      expense_date: e.expense_date,
      created_at: e.created_at,
      splits: (e.shared_expense_splits || []).map((s: any) => ({
        member_id: s.member_id,
        amount: Number(s.amount),
      })),
    }));

    const balances = computeBalances(members, expenses);
    return {
      group,
      members,
      expenses,
      totalSpent: round2(expenses.reduce((sum, e) => sum + e.amount, 0)),
      balances,
      settlements: computeSettlements(balances),
    };
  }

  private async getGroupIdByToken(token: string): Promise<string | null> {
    if (!isValidShareToken(token)) return null;
    const supabase = createServiceClientSync();
    const { data, error } = await supabase
      .from('shared_groups')
      .select('id')
      .eq('share_token', token)
      .eq('is_active', true)
      .maybeSingle();
    if (error) throw error;
    return data?.id ?? null;
  }

  async addMemberByToken(
    token: string,
    input: { displayName: string; email?: string | null; phone?: string | null }
  ): Promise<SharedGroupMember | null> {
    const groupId = await this.getGroupIdByToken(token);
    if (!groupId) return null;
    const supabase = createServiceClientSync();

    const { data, error } = await supabase
      .from('shared_group_members')
      .insert({
        group_id: groupId,
        display_name: input.displayName,
        email: input.email || null,
        phone: input.phone || null,
      })
      .select('id, group_id, user_id, display_name, email, phone')
      .single();

    if (error) throw error;
    return data;
  }

  async addExpenseByToken(
    token: string,
    input: {
      paidByMemberId: string;
      description: string;
      amount: number;
      expenseDate?: string;
      /** Miembros entre los que se divide; default: todos. */
      splitMemberIds?: string[];
    }
  ): Promise<SharedExpense | null> {
    const groupId = await this.getGroupIdByToken(token);
    if (!groupId) return null;
    const supabase = createServiceClientSync();

    // Validar que payer y participantes pertenezcan al grupo
    const { data: members, error: membersError } = await supabase
      .from('shared_group_members')
      .select('id')
      .eq('group_id', groupId);
    if (membersError) throw membersError;

    const memberIds = new Set((members || []).map((m) => m.id));
    if (!memberIds.has(input.paidByMemberId)) {
      throw new Error('El miembro que pagó no pertenece al grupo');
    }
    const splitIds =
      input.splitMemberIds && input.splitMemberIds.length > 0
        ? input.splitMemberIds
        : Array.from(memberIds);
    if (splitIds.some((id) => !memberIds.has(id))) {
      throw new Error('Hay participantes que no pertenecen al grupo');
    }

    const { data: expense, error } = await supabase
      .from('shared_expenses')
      .insert({
        group_id: groupId,
        paid_by_member_id: input.paidByMemberId,
        description: input.description,
        amount: round2(input.amount),
        expense_date: input.expenseDate || new Date().toISOString().slice(0, 10),
      })
      .select()
      .single();
    if (error) throw error;

    const splits = splitEqually(round2(input.amount), splitIds);
    const { error: splitsError } = await supabase.from('shared_expense_splits').insert(
      splits.map((s) => ({
        expense_id: expense.id,
        member_id: s.member_id,
        amount: s.amount,
      }))
    );
    if (splitsError) {
      await supabase.from('shared_expenses').delete().eq('id', expense.id);
      throw splitsError;
    }

    return { ...expense, amount: Number(expense.amount), splits };
  }

  async updateExpenseByToken(
    token: string,
    expenseId: string,
    input: {
      paidByMemberId: string;
      description: string;
      amount: number;
      expenseDate?: string;
      /** Miembros entre los que se divide; default: todos. */
      splitMemberIds?: string[];
    }
  ): Promise<SharedExpense | null> {
    const groupId = await this.getGroupIdByToken(token);
    if (!groupId) return null;
    const supabase = createServiceClientSync();

    // El gasto tiene que pertenecer a este grupo
    const { data: existing, error: existingError } = await supabase
      .from('shared_expenses')
      .select('id')
      .eq('id', expenseId)
      .eq('group_id', groupId)
      .maybeSingle();
    if (existingError) throw existingError;
    if (!existing) return null;

    // Validar que payer y participantes pertenezcan al grupo
    const { data: members, error: membersError } = await supabase
      .from('shared_group_members')
      .select('id')
      .eq('group_id', groupId);
    if (membersError) throw membersError;

    const memberIds = new Set((members || []).map((m) => m.id));
    if (!memberIds.has(input.paidByMemberId)) {
      throw new Error('El miembro que pagó no pertenece al grupo');
    }
    const splitIds =
      input.splitMemberIds && input.splitMemberIds.length > 0
        ? input.splitMemberIds
        : Array.from(memberIds);
    if (splitIds.some((id) => !memberIds.has(id))) {
      throw new Error('Hay participantes que no pertenecen al grupo');
    }

    const { data: expense, error } = await supabase
      .from('shared_expenses')
      .update({
        paid_by_member_id: input.paidByMemberId,
        description: input.description,
        amount: round2(input.amount),
        expense_date: input.expenseDate || new Date().toISOString().slice(0, 10),
      })
      .eq('id', expenseId)
      .eq('group_id', groupId)
      .select()
      .single();
    if (error) throw error;

    // Reemplazar los splits: borrar los viejos e insertar los nuevos
    const { error: deleteError } = await supabase
      .from('shared_expense_splits')
      .delete()
      .eq('expense_id', expenseId);
    if (deleteError) throw deleteError;

    const splits = splitEqually(round2(input.amount), splitIds);
    const { error: splitsError } = await supabase.from('shared_expense_splits').insert(
      splits.map((s) => ({
        expense_id: expenseId,
        member_id: s.member_id,
        amount: s.amount,
      }))
    );
    if (splitsError) throw splitsError;

    return { ...expense, amount: Number(expense.amount), splits };
  }

  async deleteExpenseByToken(token: string, expenseId: string): Promise<boolean> {
    const groupId = await this.getGroupIdByToken(token);
    if (!groupId) return false;
    const supabase = createServiceClientSync();

    const { error } = await supabase
      .from('shared_expenses')
      .delete()
      .eq('id', expenseId)
      .eq('group_id', groupId);
    if (error) throw error;
    return true;
  }
}

export const sharedExpensesService = new SharedExpensesService();
