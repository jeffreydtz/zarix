'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { formatCurrency } from '@/lib/utils/currency';
import { TRANSACTION_CURRENCIES } from '@/lib/constants/transaction-currencies';

interface GroupSummary {
  id: string;
  name: string;
  currency: string;
  share_token: string;
  member_count: number;
  total_spent: number;
  created_at: string;
}

interface DraftMember {
  displayName: string;
  email: string;
  phone: string;
}

export default function SharedGroupsPage() {
  const [groups, setGroups] = useState<GroupSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/shared-groups', { cache: 'no-store' });
      if (!res.ok) throw new Error();
      setGroups(await res.json());
    } catch {
      setError('No pudimos cargar tus grupos.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const copyLink = async (group: GroupSummary) => {
    const url = `${window.location.origin}/shared/${group.share_token}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(group.id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      prompt('Copiá el link:', url);
    }
  };

  const deleteGroup = async (group: GroupSummary) => {
    if (!confirm(`¿Eliminar "${group.name}" y todos sus gastos? Esta acción no se puede deshacer.`))
      return;
    await fetch(`/api/shared-groups/${group.id}`, { method: 'DELETE' });
    await load();
  };

  return (
    <div className="max-w-shell mx-auto px-4 py-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Gastos compartidos</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Dividí gastos con amigos. Ellos no necesitan cuenta: les pasás un link.
          </p>
        </div>
      </div>

      {error && (
        <div className="card p-3 text-sm text-red-600 dark:text-red-400" role="alert">
          {error}
        </div>
      )}

      {creating ? (
        <CreateGroupForm
          onDone={async () => {
            setCreating(false);
            await load();
          }}
          onCancel={() => setCreating(false)}
        />
      ) : (
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="w-full py-3 rounded-card bg-primary text-white font-medium text-sm"
        >
          + Crear grupo
        </button>
      )}

      {loading ? (
        <div className="card p-8 text-center text-sm text-muted-foreground">Cargando…</div>
      ) : groups.length === 0 && !creating ? (
        <div className="card p-8 text-center text-sm text-muted-foreground">
          Todavía no tenés grupos. Creá uno y compartí el link.
        </div>
      ) : (
        <div className="space-y-3">
          {groups.map((g) => (
            <div key={g.id} className="card p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold truncate">{g.name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {g.member_count} {g.member_count === 1 ? 'miembro' : 'miembros'} · Total:{' '}
                    {formatCurrency(g.total_spent, g.currency)}
                  </p>
                </div>
                <Link
                  href={`/shared/${g.share_token}`}
                  className="shrink-0 px-3 py-1.5 rounded-control bg-primary/12 text-primary text-xs font-medium"
                >
                  Abrir
                </Link>
              </div>
              <div className="flex gap-2 mt-3">
                <button
                  type="button"
                  onClick={() => copyLink(g)}
                  className="flex-1 py-2 rounded-control border border-border text-xs font-medium hover:bg-surface-soft transition-colors"
                >
                  {copiedId === g.id ? '✓ Link copiado' : 'Copiar link para invitar'}
                </button>
                <button
                  type="button"
                  onClick={() => deleteGroup(g)}
                  className="px-3 py-2 rounded-control border border-border text-xs text-muted-foreground hover:text-red-500 transition-colors"
                >
                  Eliminar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CreateGroupForm({
  onDone,
  onCancel,
}: {
  onDone: () => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState('');
  const [currency, setCurrency] = useState('ARS');
  const [members, setMembers] = useState<DraftMember[]>([{ displayName: '', email: '', phone: '' }]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateMember = (index: number, patch: Partial<DraftMember>) => {
    setMembers((prev) => prev.map((m, i) => (i === index ? { ...m, ...patch } : m)));
  };

  const submit = async () => {
    if (!name.trim()) {
      setError('Poné un nombre al grupo.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/shared-groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          currency,
          members: members.filter((m) => m.displayName.trim()),
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Error al crear el grupo');
      await onDone();
    } catch (e: any) {
      setError(e.message);
      setSaving(false);
    }
  };

  return (
    <div className="card p-4 space-y-3">
      <h2 className="font-semibold text-sm">Nuevo grupo</h2>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Nombre (ej: Viaje a Bariloche)"
        maxLength={80}
        className="w-full px-3 py-2.5 rounded-control border border-border bg-surface text-sm"
      />
      <div>
        <label className="text-xs text-muted-foreground block mb-1">Moneda</label>
        <select
          value={currency}
          onChange={(e) => setCurrency(e.target.value)}
          className="w-full px-3 py-2.5 rounded-control border border-border bg-surface text-sm"
        >
          {TRANSACTION_CURRENCIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-2">
        <label className="text-xs text-muted-foreground block">
          Miembros (vos incluido — el email/teléfono es opcional)
        </label>
        {members.map((m, i) => (
          <div key={i} className="flex gap-2">
            <input
              value={m.displayName}
              onChange={(e) => updateMember(i, { displayName: e.target.value })}
              placeholder="Nombre"
              maxLength={60}
              className="flex-1 min-w-0 px-3 py-2 rounded-control border border-border bg-surface text-sm"
            />
            <input
              value={m.email}
              onChange={(e) => updateMember(i, { email: e.target.value })}
              placeholder="Email/teléfono"
              className="flex-1 min-w-0 px-3 py-2 rounded-control border border-border bg-surface text-sm"
            />
            <button
              type="button"
              onClick={() => setMembers((prev) => prev.filter((_, j) => j !== i))}
              className="px-2 text-muted-foreground hover:text-red-500"
              aria-label="Quitar miembro"
            >
              ✕
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => setMembers((prev) => [...prev, { displayName: '', email: '', phone: '' }])}
          className="text-sm text-primary font-medium hover:underline"
        >
          + Agregar miembro
        </button>
        <p className="text-xs text-muted-foreground">
          Los que falten se pueden sumar solos desde el link.
        </p>
      </div>
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          disabled={saving}
          onClick={submit}
          className="flex-1 py-2.5 rounded-control bg-primary text-white text-sm font-medium disabled:opacity-50"
        >
          {saving ? 'Creando…' : 'Crear grupo'}
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
