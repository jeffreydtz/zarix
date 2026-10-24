'use client';

import { useState } from 'react';
import { Loader2, Upload } from 'lucide-react';
import type { Account } from '@/types/database';

interface BrokerImportPanelProps {
  accounts: Account[];
  onImported: () => void;
}

export default function BrokerImportPanel({ accounts, onImported }: BrokerImportPanelProps) {
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? '');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  if (accounts.length === 0) return null;

  const onFile = async (file: File | null) => {
    if (!file || !accountId) return;
    setBusy(true);
    setMessage(null);
    try {
      const body = new FormData();
      body.set('file', file);
      body.set('accountId', accountId);
      const r = await fetch('/api/import/investments', { method: 'POST', body });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || 'No se pudo importar');
      setMessage(
        `Importadas ${data.imported ?? 0} posiciones` +
          (data.skipped ? ` · ${data.skipped} filas omitidas` : '') +
          (data.failed ? ` · ${data.failed} con error` : '')
      );
      onImported();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'No se pudo importar');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-2 sm:items-end">
      <label className="text-xs text-muted-foreground">
        Importar IOL (CSV/Excel de Mi Portafolio)
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <select
          className="input text-sm py-1.5"
          value={accountId}
          onChange={(e) => setAccountId(e.target.value)}
        >
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
        <label className="btn btn-secondary inline-flex items-center gap-1.5 text-sm cursor-pointer">
          {busy ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <Upload size={14} aria-hidden />}
          {busy ? 'Importando…' : 'Elegir archivo'}
          <input
            type="file"
            accept=".csv,.txt,.xlsx,.xls"
            className="sr-only"
            disabled={busy}
            onChange={(e) => {
              const file = e.target.files?.[0] ?? null;
              e.target.value = '';
              void onFile(file);
            }}
          />
        </label>
      </div>
      {message ? <p className="text-xs text-muted-foreground">{message}</p> : null}
    </div>
  );
}
