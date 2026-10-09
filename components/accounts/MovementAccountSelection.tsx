'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { PLAN_LIMITS, type PlanName } from '@/lib/plans/rules';

type Choice = { id: string; name: string; movement_enabled: boolean };
export default function MovementAccountSelection({ accounts, plan }: { accounts: Choice[]; plan: PlanName }) {
  const router = useRouter();
  const [selected, setSelected] = useState(() => accounts.filter(a => a.movement_enabled).map(a => a.id));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const limit = PLAN_LIMITS[plan].accounts;
  const tooMany = selected.length > limit;

  async function save() {
    setSaving(true);
    setMessage('');
    try {
      const response = await fetch('/api/accounts/movement-selection', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accountIds: selected }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'No se pudo guardar la selección.');
      setMessage('Selección guardada.');
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo guardar la selección.');
    } finally { setSaving(false); }
  }

  return <section className="card space-y-3" aria-labelledby="movement-accounts-title">
    <h2 id="movement-accounts-title" className="font-semibold">Cuentas para nuevos movimientos</h2>
    <p className="text-sm text-muted-foreground">
      Plan {plan === 'premium' ? 'Premium' : 'Free'}: hasta {limit} cuentas habilitadas.
      Podés consultar y exportar el historial de todas tus cuentas. Cambiar esta selección no borra ni archiva nada.
    </p>
    {tooMany && <p role="alert" className="text-sm text-destructive">Elegí hasta {limit} cuentas para volver a registrar movimientos.</p>}
    <fieldset disabled={saving} className="space-y-2">
      <legend className="sr-only">Elegí las cuentas habilitadas</legend>
      {accounts.map(account => <label key={account.id} className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={selected.includes(account.id)} onChange={event => {
          setSelected(current => event.target.checked ? [...current, account.id] : current.filter(id => id !== account.id));
        }} />
        {account.name}
      </label>)}
    </fieldset>
    <div className="flex items-center gap-3">
      <button type="button" className="btn btn-secondary" onClick={save} disabled={saving || tooMany}>
        {saving ? 'Guardando…' : 'Guardar selección'}
      </button>
      <span className="text-sm text-muted-foreground">{selected.length}/{limit}</span>
    </div>
    {message && <p role="status" className="text-sm">{message}</p>}
  </section>;
}
