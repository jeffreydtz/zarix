'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import { brandAsset } from '@/lib/brand';
import { formatCurrency } from '@/lib/utils/currency';
import type { SharedGroupDetail, SharedGroupMember } from '@/lib/services/sharedExpenses';

interface Props {
  token: string;
  initialData: SharedGroupDetail;
}

type Tab = 'gastos' | 'saldos';

function storageKey(groupId: string) {
  return `zarix_shared_member_${groupId}`;
}

function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('es-AR', {
    day: 'numeric',
    month: 'short',
  });
}

export default function SharedGroupView({ token, initialData }: Props) {
  const [data, setData] = useState<SharedGroupDetail>(initialData);
  const [tab, setTab] = useState<Tab>('gastos');
  const [memberId, setMemberId] = useState<string | null>(null);
  const [identityReady, setIdentityReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Identidad del invitado (sin cuenta): guardada en este dispositivo
  useEffect(() => {
    const stored = localStorage.getItem(storageKey(initialData.group.id));
    if (stored && initialData.members.some((m) => m.id === stored)) {
      setMemberId(stored);
    }
    setIdentityReady(true);
  }, [initialData.group.id, initialData.members]);

  const reload = useCallback(async () => {
    try {
      const res = await fetch(`/api/shared/${token}`, { cache: 'no-store' });
      if (!res.ok) throw new Error();
      setData(await res.json());
    } catch {
      setError('No pudimos actualizar los datos. Probá de nuevo.');
    }
  }, [token]);

  const me = useMemo(
    () => data.members.find((m) => m.id === memberId) || null,
    [data.members, memberId]
  );

  const selectIdentity = (member: SharedGroupMember) => {
    localStorage.setItem(storageKey(data.group.id), member.id);
    setMemberId(member.id);
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="bg-surface-glass/95 border-b border-border/75 sticky top-0 z-30 backdrop-blur-xl">
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center gap-2">
          <div className="w-8 h-8 rounded-control overflow-hidden bg-surface border border-border flex items-center justify-center p-0.5">
            <Image src={brandAsset.logoSvg} alt="" width={24} height={24} className="w-6 h-6 object-contain" unoptimized />
          </div>
          <span className="font-semibold tracking-tight text-primary">Zarix</span>
          <span className="text-xs text-muted-foreground ml-auto">Gastos compartidos</span>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-4 pb-16">
        <div className="card p-5">
          <h1 className="text-xl font-semibold">{data.group.name}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {data.members.length} {data.members.length === 1 ? 'miembro' : 'miembros'} · Total
            gastado:{' '}
            <span className="font-medium text-foreground">
              {formatCurrency(data.totalSpent, data.group.currency)}
            </span>
          </p>
          {me && (
            <p className="text-xs text-muted-foreground mt-2">
              Estás participando como <span className="font-medium text-foreground">{me.display_name}</span>{' '}
              <button
                type="button"
                className="underline hover:text-foreground"
                onClick={() => {
                  localStorage.removeItem(storageKey(data.group.id));
                  setMemberId(null);
                }}
              >
                cambiar
              </button>
            </p>
          )}
        </div>

        {error && (
          <div className="card p-3 text-sm text-red-600 dark:text-red-400" role="alert">
            {error}
          </div>
        )}

        {identityReady && !me ? (
          <IdentityPicker
            token={token}
            members={data.members}
            onSelect={selectIdentity}
            onJoined={async (member) => {
              await reload();
              selectIdentity(member);
            }}
          />
        ) : (
          <>
            <div className="flex gap-1 p-1 rounded-card bg-surface-soft border border-border">
              {(['gastos', 'saldos'] as Tab[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTab(t)}
                  className={`flex-1 py-2 rounded-control text-sm font-medium transition-colors ${
                    tab === t ? 'bg-surface-elevated text-primary shadow-sm' : 'text-muted-foreground'
                  }`}
                >
                  {t === 'gastos' ? 'Gastos' : 'Saldos'}
                </button>
              ))}
            </div>

            {tab === 'gastos' ? (
              <ExpensesTab token={token} data={data} meId={memberId} onChanged={reload} />
            ) : (
              <BalancesTab data={data} meId={memberId} />
            )}
          </>
        )}
      </main>
    </div>
  );
}

// ── Identidad ───────────────────────────────────────────────────────

function IdentityPicker({
  token,
  members,
  onSelect,
  onJoined,
}: {
  token: string;
  members: SharedGroupMember[];
  onSelect: (m: SharedGroupMember) => void;
  onJoined: (m: SharedGroupMember) => void;
}) {
  const [joining, setJoining] = useState(members.length === 0);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const join = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/shared/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName: name, email, phone }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Error al unirse al grupo');
      onJoined(body);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="card p-5 space-y-4">
      <h2 className="font-semibold">¿Quién sos?</h2>
      {!joining && (
        <>
          <div className="space-y-1.5">
            {members.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => onSelect(m)}
                className="w-full text-left px-4 py-3 rounded-control border border-border bg-surface hover:bg-surface-soft transition-colors text-sm font-medium"
              >
                {m.display_name}
                {(m.email || m.phone) && (
                  <span className="block text-xs text-muted-foreground font-normal">
                    {m.email || m.phone}
                  </span>
                )}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setJoining(true)}
            className="text-sm text-primary font-medium hover:underline"
          >
            No estoy en la lista — unirme al grupo
          </button>
        </>
      )}
      {joining && (
        <div className="space-y-3">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Tu nombre"
            maxLength={60}
            className="w-full px-3 py-2.5 rounded-control border border-border bg-surface text-sm"
          />
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            type="email"
            className="w-full px-3 py-2.5 rounded-control border border-border bg-surface text-sm"
          />
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="Teléfono (opcional si pusiste email)"
            className="w-full px-3 py-2.5 rounded-control border border-border bg-surface text-sm"
          />
          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
          <div className="flex gap-2">
            <button
              type="button"
              disabled={saving || !name.trim() || (!email.trim() && !phone.trim())}
              onClick={join}
              className="flex-1 py-2.5 rounded-control bg-primary text-white text-sm font-medium disabled:opacity-50"
            >
              {saving ? 'Uniéndote…' : 'Unirme'}
            </button>
            {members.length > 0 && (
              <button
                type="button"
                onClick={() => setJoining(false)}
                className="px-4 py-2.5 rounded-control border border-border text-sm"
              >
                Volver
              </button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            No necesitás cuenta: con tu nombre y un email o teléfono alcanza.
          </p>
        </div>
      )}
    </div>
  );
}

// ── Gastos ──────────────────────────────────────────────────────────

function ExpensesTab({
  token,
  data,
  meId,
  onChanged,
}: {
  token: string;
  data: SharedGroupDetail;
  meId: string | null;
  onChanged: () => Promise<void>;
}) {
  const [adding, setAdding] = useState(false);
  const memberName = (id: string) =>
    data.members.find((m) => m.id === id)?.display_name || '¿?';

  const deleteExpense = async (expenseId: string) => {
    if (!confirm('¿Eliminar este gasto?')) return;
    await fetch(`/api/shared/${token}/expenses/${expenseId}`, { method: 'DELETE' });
    await onChanged();
  };

  return (
    <div className="space-y-3">
      {adding ? (
        <AddExpenseForm
          token={token}
          data={data}
          meId={meId}
          onDone={async () => {
            setAdding(false);
            await onChanged();
          }}
          onCancel={() => setAdding(false)}
        />
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="w-full py-3 rounded-card bg-primary text-white font-medium text-sm"
        >
          + Agregar gasto
        </button>
      )}

      {data.expenses.length === 0 && !adding && (
        <div className="card p-8 text-center text-sm text-muted-foreground">
          Todavía no hay gastos. ¡Agregá el primero!
        </div>
      )}

      {data.expenses.map((e) => (
        <div key={e.id} className="card p-4 flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <p className="font-medium text-sm truncate">{e.description}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Pagó <span className="font-medium">{memberName(e.paid_by_member_id)}</span> ·{' '}
              {formatDate(e.expense_date)} · entre {e.splits.length}
            </p>
          </div>
          <div className="text-right shrink-0">
            <p className="font-semibold text-sm">{formatCurrency(e.amount, data.group.currency)}</p>
            <button
              type="button"
              onClick={() => deleteExpense(e.id)}
              className="text-xs text-muted-foreground hover:text-red-500 mt-1"
            >
              Eliminar
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function AddExpenseForm({
  token,
  data,
  meId,
  onDone,
  onCancel,
}: {
  token: string;
  data: SharedGroupDetail;
  meId: string | null;
  onDone: () => Promise<void>;
  onCancel: () => void;
}) {
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [paidBy, setPaidBy] = useState(meId || data.members[0]?.id || '');
  const [participants, setParticipants] = useState<Set<string>>(
    new Set(data.members.map((m) => m.id))
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleParticipant = (id: string) => {
    setParticipants((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const submit = async () => {
    const parsed = Number(amount.replace(',', '.'));
    if (!description.trim() || !Number.isFinite(parsed) || parsed <= 0 || participants.size === 0) {
      setError('Completá descripción, monto y al menos un participante.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/shared/${token}/expenses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description: description.trim(),
          amount: parsed,
          paidByMemberId: paidBy,
          splitMemberIds: Array.from(participants),
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Error al agregar el gasto');
      await onDone();
    } catch (e: any) {
      setError(e.message);
      setSaving(false);
    }
  };

  return (
    <div className="card p-4 space-y-3">
      <h3 className="font-semibold text-sm">Nuevo gasto</h3>
      <input
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="¿Qué pagaron? (ej: Asado, nafta…)"
        maxLength={200}
        className="w-full px-3 py-2.5 rounded-control border border-border bg-surface text-sm"
      />
      <input
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        placeholder={`Monto en ${data.group.currency}`}
        inputMode="decimal"
        className="w-full px-3 py-2.5 rounded-control border border-border bg-surface text-sm"
      />
      <div>
        <label className="text-xs text-muted-foreground block mb-1">¿Quién pagó?</label>
        <select
          value={paidBy}
          onChange={(e) => setPaidBy(e.target.value)}
          className="w-full px-3 py-2.5 rounded-control border border-border bg-surface text-sm"
        >
          {data.members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.display_name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="text-xs text-muted-foreground block mb-1">Se divide entre</label>
        <div className="flex flex-wrap gap-1.5">
          {data.members.map((m) => {
            const active = participants.has(m.id);
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => toggleParticipant(m.id)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                  active
                    ? 'bg-primary/12 border-primary/40 text-primary'
                    : 'bg-surface border-border text-muted-foreground'
                }`}
              >
                {m.display_name}
              </button>
            );
          })}
        </div>
      </div>
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          disabled={saving}
          onClick={submit}
          className="flex-1 py-2.5 rounded-control bg-primary text-white text-sm font-medium disabled:opacity-50"
        >
          {saving ? 'Guardando…' : 'Guardar gasto'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2.5 rounded-control border border-border text-sm"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}

// ── Saldos ──────────────────────────────────────────────────────────

function BalancesTab({ data, meId }: { data: SharedGroupDetail; meId: string | null }) {
  return (
    <div className="space-y-3">
      <div className="card p-4">
        <h3 className="font-semibold text-sm mb-3">Saldo por persona</h3>
        <div className="space-y-2">
          {data.balances.map((b) => (
            <div key={b.member_id} className="flex items-center justify-between text-sm">
              <span className={b.member_id === meId ? 'font-semibold' : ''}>
                {b.display_name}
                {b.member_id === meId && ' (vos)'}
              </span>
              <span
                className={`font-medium ${
                  b.net > 0.005
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : b.net < -0.005
                      ? 'text-red-600 dark:text-red-400'
                      : 'text-muted-foreground'
                }`}
              >
                {b.net > 0.005 ? '+' : ''}
                {formatCurrency(b.net, data.group.currency)}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="card p-4">
        <h3 className="font-semibold text-sm mb-3">Cómo saldar las cuentas</h3>
        {data.settlements.length === 0 ? (
          <p className="text-sm text-muted-foreground">Están a mano. 🎉</p>
        ) : (
          <ul className="space-y-2">
            {data.settlements.map((s, i) => (
              <li key={i} className="text-sm">
                <span className="font-medium">{s.from_name}</span> le paga{' '}
                <span className="font-semibold">
                  {formatCurrency(s.amount, data.group.currency)}
                </span>{' '}
                a <span className="font-medium">{s.to_name}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
