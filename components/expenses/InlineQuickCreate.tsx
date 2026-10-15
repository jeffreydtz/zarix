'use client';

import { submitAccountCreation, type AccountCreationAttempt } from '@/lib/account-create-request';
import { getOfflineReferenceOwner, REFERENCE_OWNER_CHANGED } from '@/lib/offline-reference-cache';

import { useEffect, useRef, useState } from 'react';
import {
  ACCOUNT_FORM_CURRENCIES,
  ACCOUNT_FORM_TYPES,
} from '@/components/accounts/account-form-constants';
import { sanitizeAmountInput } from '@/lib/sanitize-amount-input';
import type { AccountType } from '@/types/database';

/** Valor centinela de la opción "＋ Nueva…" en los selects del form de movimiento. */
export const QUICK_CREATE_OPTION = '__quick_create__';

const CATEGORY_QUICK_ICONS = ['🛒', '🍔', '🏠', '🚗', '💊', '🎓', '🎬', '✈️', '💼', '🎁', '📦', '🎯'];

/** Tarjetas de crédito piden límite/cierre/vencimiento: se crean desde Cuentas, no acá. */
const QUICK_ACCOUNT_TYPES = ACCOUNT_FORM_TYPES.filter((t) => t.value !== 'credit_card');

export interface QuickCreatedCategory {
  id: string;
  name: string;
  icon: string;
  type: string;
}

export interface QuickCreatedAccount {
  id: string;
  name: string;
  currency: string;
  balance: number;
  type?: AccountType;
}

const panelClass =
  'rounded-xl border border-primary/20 bg-primary/10 p-3 mt-2 space-y-2.5';
const inputClass =
  'w-full px-3 py-2 rounded-lg border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring';
const cancelClass =
  'px-3 py-1.5 text-sm rounded-lg border border-border text-muted-foreground hover:bg-secondary';

type CompletionTicket = { ownerId: string | null; epoch: number };

/** A completed request still belongs to its original form/session. Invalidate
 * UI callbacks synchronously on identity change, cancel or unmount, including
 * A -> B -> A. The underlying durable account request is left intact. */
function useQuickCreateCompletion() {
  const lifecycle = useRef({ mounted: false, epoch: 0 });
  const invalidate = () => { lifecycle.current.epoch++; };
  useEffect(() => {
    const ownedLifecycle = lifecycle.current;
    ownedLifecycle.mounted = true;
    const changed = () => { ownedLifecycle.epoch++; };
    window.addEventListener(REFERENCE_OWNER_CHANGED, changed);
    return () => {
      ownedLifecycle.mounted = false;
      ownedLifecycle.epoch++;
      window.removeEventListener(REFERENCE_OWNER_CHANGED, changed);
    };
  }, []);
  const active = (ticket: CompletionTicket | null) =>
    Boolean(ticket && lifecycle.current.mounted && ticket.epoch === lifecycle.current.epoch);
  const begin = async (): Promise<CompletionTicket> => {
    const startedEpoch = lifecycle.current.epoch;
    const ownerId = await getOfflineReferenceOwner();
    return { ownerId, epoch: startedEpoch };
  };
  const current = async (ticket: CompletionTicket) => {
    const ownerId = await getOfflineReferenceOwner();
    return Boolean(ticket.ownerId && active(ticket) && ownerId === ticket.ownerId);
  };
  return { begin, current, active, invalidate };
}

export function QuickCreateCategoryPanel({
  type,
  onCreated,
  onCancel,
}: {
  type: 'expense' | 'income';
  onCreated: (category: QuickCreatedCategory) => void;
  onCancel: () => void;
}) {
  const nameRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('🎯');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const completion = useQuickCreateCompletion();
  const cancel = () => { completion.invalidate(); onCancel(); };

  useEffect(() => {
    nameRef.current?.focus();
  }, []);

  const handleCreate = async () => {
    if (!name.trim() || loading) return;
    setError('');
    setLoading(true);
    let ticket: CompletionTicket | null = null;
    try {
      ticket = await completion.begin();
      if (!ticket.ownerId || !completion.active(ticket)) return;
      const res = await fetch('/api/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), icon, type }),
      });
      const data = await res.json().catch(() => null);
      if (!await completion.current(ticket) || !completion.active(ticket)) return;
      if (!res.ok || !data?.id) {
        throw new Error(data?.error || 'Error al crear la categoría');
      }
      onCreated({
        id: data.id,
        name: data.name ?? name.trim(),
        icon: data.icon ?? icon,
        type: data.type ?? type,
      });
    } catch (e: any) {
      if (completion.active(ticket)) setError(e.message || 'Error al crear la categoría');
    } finally {
      if (completion.active(ticket)) setLoading(false);
    }
  };

  return (
    <div className={panelClass}>
      <p className="text-xs font-semibold text-primary">
        Nueva categoría de {type === 'expense' ? 'gasto' : 'ingreso'}
      </p>
      <input
        ref={nameRef}
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            handleCreate();
          }
          if (e.key === 'Escape') cancel();
        }}
        placeholder="ej: Mascotas"
        className={inputClass}
      />
      <div className="flex flex-wrap gap-1">
        {CATEGORY_QUICK_ICONS.map((emoji) => (
          <button
            key={emoji}
            type="button"
            onClick={() => setIcon(emoji)}
            aria-label={`Icono ${emoji}`}
            className={`w-8 h-8 rounded-lg text-base leading-none ${
              icon === emoji
                ? 'bg-primary/20 ring-2 ring-ring'
                : 'bg-card border border-border'
            }`}
          >
            {emoji}
          </button>
        ))}
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleCreate}
          disabled={loading || !name.trim()}
          className="btn btn-primary text-sm px-3 py-1.5 disabled:opacity-50"
        >
          {loading ? 'Creando…' : 'Crear y usar'}
        </button>
        <button type="button" onClick={cancel} className={cancelClass}>
          Cancelar
        </button>
      </div>
    </div>
  );
}

export function QuickCreateAccountPanel({
  onCreated,
  onCancel,
}: {
  onCreated: (account: QuickCreatedAccount) => void;
  onCancel: () => void;
}) {
  const nameRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState('');
  const [typeValue, setTypeValue] = useState<string>('bank');
  const [currency, setCurrency] = useState('ARS');
  const [initialBalance, setInitialBalance] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const attempt = useRef<AccountCreationAttempt>({});
  const [pending, setPending] = useState(false);
  const completion = useQuickCreateCompletion();
  const cancel = () => { completion.invalidate(); onCancel(); };

  useEffect(() => {
    nameRef.current?.focus();
  }, []);

  useEffect(() => {
    const discarded = (event: Event) => {
      if ((event as CustomEvent<string>).detail !== attempt.current.pending?.id) return;
      attempt.current.pending = undefined;
      setPending(false);
      setError('Solicitud pendiente descartada. Podés editar los datos antes de crear otra.');
    };
    window.addEventListener('zarix-operation-discarded', discarded);
    return () => window.removeEventListener('zarix-operation-discarded', discarded);
  }, []);

  const handleCreate = async () => {
    if (!name.trim() || loading) return;
    setError('');
    setLoading(true);
    const typeData = ACCOUNT_FORM_TYPES.find((t) => t.value === typeValue);
    const balanceParsed = parseFloat(initialBalance.replace(',', '.'));
    let ticket: CompletionTicket | null = null;
    try {
      ticket = await completion.begin();
      if (!ticket.ownerId || !completion.active(ticket)) return;
      const payload = {
        name: name.trim(), type: typeValue, currency,
        icon: typeData?.icon || '💳', color: typeData?.color || '#3B82F6', isDebt: false,
        initialBalance: Number.isFinite(balanceParsed) ? balanceParsed : 0,
        includeInTotal: true, includeInLiquid: true,
      };
      const outcome = await submitAccountCreation(attempt.current, payload, {
        online: navigator.onLine, onPending: original => {
          if (!completion.active(ticket)) return;
          setPending(true);
          setName(String(original.name || ''));
          setTypeValue(String(original.type || 'bank'));
          setCurrency(String(original.currency || 'ARS'));
          setInitialBalance(String(original.initialBalance ?? ''));
        },
      });
      if (!await completion.current(ticket) || !completion.active(ticket)) return;
      if (outcome.state !== 'confirmed') { setError(outcome.message); return; }
      setPending(false);
      const data = outcome.account;
      onCreated({
        id: data.id,
        name: data.name ?? name.trim(),
        currency: data.currency ?? currency,
        balance: Number(data.balance ?? (Number.isFinite(balanceParsed) ? balanceParsed : 0)),
        type: (data.type ?? typeValue) as AccountType,
      });
    } catch (e: any) {
      if (completion.active(ticket)) setError(e.message || 'Error al crear la cuenta');
    } finally {
      if (completion.active(ticket)) setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleCreate();
    }
    if (e.key === 'Escape') cancel();
  };

  return (
    <div className={panelClass}>
      <p className="text-xs font-semibold text-primary">Nueva cuenta</p>
      <input
        disabled={pending || loading}
        ref={nameRef}
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="ej: Banco Galicia"
        className={inputClass}
      />
      <div className="grid grid-cols-2 gap-2">
        <select
          disabled={pending || loading}
          value={typeValue}
          onChange={(e) => setTypeValue(e.target.value)}
          className={inputClass}
          title="Tipo de cuenta"
        >
          {QUICK_ACCOUNT_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.icon} {t.label}
            </option>
          ))}
        </select>
        <select
          disabled={pending || loading}
          value={currency}
          onChange={(e) => setCurrency(e.target.value)}
          className={inputClass}
          title="Moneda"
        >
          {ACCOUNT_FORM_CURRENCIES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.flag} {c.label}
            </option>
          ))}
        </select>
      </div>
      <input
        disabled={pending || loading}
        type="text"
        inputMode="decimal"
        value={initialBalance}
        onChange={(e) => setInitialBalance(sanitizeAmountInput(e.target.value))}
        onKeyDown={handleKeyDown}
        placeholder="Saldo inicial (opcional)"
        className={inputClass}
      />
      <p className="text-[11px] text-muted-foreground">
        Las tarjetas de crédito se crean desde la sección Cuentas (piden límite y cierre).
      </p>
      {error && <p className="text-xs text-destructive">{error}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleCreate}
          disabled={loading || !name.trim()}
          className="btn btn-primary text-sm px-3 py-1.5 disabled:opacity-50"
        >
          {loading ? 'Creando…' : pending ? 'Reintentar la misma solicitud' : 'Crear y usar'}
        </button>
        <button type="button" onClick={cancel} className={cancelClass}>
          {pending ? 'Cerrar (queda pendiente)' : 'Cancelar'}
        </button>
      </div>
    </div>
  );
}
