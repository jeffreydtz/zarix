'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  confirmPreviewFromDraft,
  confirmRequestFromDraft,
  effectiveInboxItem,
  inboxOriginalStatusLabel,
  type InboxDraft,
} from '@/lib/pending-inbox-preview';

type Item = InboxDraft;

type Account = { id: string; name: string; currency: string };

export default function PendientesPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [editing, setEditing] = useState<Record<string, Partial<Item>>>({});
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    const res = await fetch('/api/pending-inbox');
    const data = await res.json().catch(() => ({}));
    setItems(Array.isArray(data.items) ? data.items : []);
  }, []);

  useEffect(() => {
    load().catch(() => {});
    fetch('/api/accounts?lite=1')
      .then((r) => r.json())
      .then((d) => setAccounts(Array.isArray(d) ? d : []))
      .catch(() => {});
  }, [load]);

  const patch = (id: string, fields: Partial<Item>) => {
    setEditing((prev) => ({ ...prev, [id]: { ...prev[id], ...fields } }));
  };

  const confirm = async (item: Item) => {
    const draft = effectiveInboxItem(item, editing[item.id]);
    const res = await fetch(`/api/pending-inbox/${item.id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(confirmRequestFromDraft(draft)),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMessage(data.error || 'No se pudo confirmar');
      return;
    }
    setMessage('Confirmado.');
    await load();
  };

  const discard = async (id: string) => {
    const res = await fetch(`/api/pending-inbox/${id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'discard' }),
    });
    if (!res.ok && res.status !== 204) {
      const data = await res.json().catch(() => ({}));
      setMessage(data.error || 'No se pudo descartar');
      return;
    }
    await load();
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-4xl space-y-6 px-4 py-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Bandeja de pendientes</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Movimientos que llegaron por Wallet o Android. Confirmalos, editalos o descartalos. Configuración en{' '}
            <Link href="/settings/integraciones" className="text-primary">
              Integraciones
            </Link>
            .
          </p>
        </div>
        {message && <p className="text-sm text-foreground">{message}</p>}
        <ul className="space-y-3">
          {items.map((item) => {
            const draft = effectiveInboxItem(item, editing[item.id]);
            const preview = confirmPreviewFromDraft(draft, accounts);
            return (
              <li key={item.id} className="card space-y-3">
                <p className="text-sm font-medium text-foreground">
                  Al confirmar: {preview.directionLabel}
                  {preview.amount != null ? ` · ${preview.amount} ${preview.currency}` : ''}
                  {` · ${preview.accountName}`}
                  {preview.installments > 1 ? ` · ${preview.installments} cuotas` : ''}
                  {preview.destinationAccount ? ` → ${preview.destinationAccount}` : ''}
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="text-sm">
                    Monto
                    <input
                      className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2"
                      value={draft.amount ?? ''}
                      onChange={(e) => patch(item.id, { amount: e.target.value === '' ? null : Number(e.target.value) })}
                    />
                  </label>
                  <label className="text-sm">
                    Comercio
                    <input
                      className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2"
                      value={draft.merchant ?? ''}
                      onChange={(e) => patch(item.id, { merchant: e.target.value })}
                    />
                  </label>
                  <label className="text-sm">
                    Tarjeta
                    <input
                      className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2"
                      value={draft.card_name ?? ''}
                      readOnly
                    />
                  </label>
                  <label className="text-sm">
                    Cuenta Zarix
                    <select
                      className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2"
                      value={draft.account_id ?? ''}
                      onChange={(e) => patch(item.id, { account_id: e.target.value })}
                    >
                      <option value="">Elegí una cuenta</option>
                      {accounts.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name} ({a.currency})
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <p className="text-xs text-muted-foreground">
                  {preview.directionLabel} · {draft.currency} · {new Date(item.created_at).toLocaleString('es-AR')}
                  {item.status === 'confirming' ? ' · reintento (quedó a medias)' : ''}
                  {item.status === 'uncertain' ? ' · resultado incierto (hay que reconciliar)' : ''}
                </p>
                {item.possible_duplicate_of ? (
                  <p className="text-sm text-amber-800 dark:text-amber-200">
                    Posible duplicado de{' '}
                    {item.possible_duplicate
                      ? `${item.possible_duplicate.merchant || 'movimiento'} · ${
                          item.possible_duplicate.amount ?? '—'
                        } ${item.possible_duplicate.currency} · ${inboxOriginalStatusLabel(item.possible_duplicate.status)}`
                      : item.possible_duplicate_of}
                    <button
                      type="button"
                      className="ml-2 text-destructive underline"
                      onClick={() => discard(item.id)}
                    >
                      Descartar
                    </button>
                  </p>
                ) : null}
                <div className="flex gap-2">
                  <button type="button" className="btn-primary" onClick={() => confirm(item)}>
                    Confirmar
                  </button>
                  <button type="button" className="text-sm text-destructive" onClick={() => discard(item.id)}>
                    Descartar
                  </button>
                </div>
              </li>
            );
          })}
          {items.length === 0 && (
            <li className="card text-sm text-muted-foreground">No hay pendientes. Cuando un atajo mande un gasto, aparece acá.</li>
          )}
        </ul>
      </div>
    </div>
  );
}
