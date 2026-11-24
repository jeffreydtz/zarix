'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';

type Account = { id: string; name: string; currency: string };

export default function StatementIngestPanel() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountId, setAccountId] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch('/api/accounts?lite=1')
      .then((r) => r.json())
      .then((d) => setAccounts(Array.isArray(d) ? d : []))
      .catch(() => {});
  }, []);

  const upload = async () => {
    const file = inputRef.current?.files?.[0];
    if (!file) {
      setMessage('Elegí un PDF o CSV.');
      return;
    }
    setLoading(true);
    setMessage('');
    try {
      const form = new FormData();
      form.append('file', file);
      if (accountId) form.append('accountId', accountId);
      const res = await fetch('/api/ingest/statement', { method: 'POST', body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(data.error || 'No se pudo leer el archivo.');
        return;
      }
      const parked = Number(data.parked) || 0;
      const duplicates = Number(data.duplicates) || 0;
      if (parked > 0) {
        setMessage(
          `Dejé ${parked} movimiento${parked === 1 ? '' : 's'} en Pendientes` +
            (duplicates > 0 ? ` (${duplicates} ya estaban, no se duplicaron).` : '. Nada se registró en el libro.')
        );
      } else if (duplicates > 0) {
        setMessage('Esos movimientos ya estaban en Pendientes. No se duplicaron.');
      } else {
        setMessage('No encontré movimientos nuevos.');
      }
      if (inputRef.current) inputRef.current.value = '';
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="card space-y-3">
      <h2 className="text-xl font-semibold">Resumen de tarjeta o movimientos del banco</h2>
      <p className="text-sm text-muted-foreground">
        Subí el PDF del resumen o un archivo CSV de la cuenta. Zarix extrae los movimientos y los deja en{' '}
        <Link href="/pendientes" className="text-primary">
          Pendientes
        </Link>
        . Nunca los registra solo: vos confirmás cada uno.
      </p>
      <label className="text-sm">
        Cuenta (opcional)
        <select
          className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2"
          value={accountId}
          onChange={(e) => setAccountId(e.target.value)}
        >
          <option value="">Elegir al confirmar</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name} ({a.currency})
            </option>
          ))}
        </select>
      </label>
      <input ref={inputRef} type="file" accept=".pdf,.csv,.txt,application/pdf,text/csv,text/plain" />
      <button type="button" className="btn-primary" disabled={loading} onClick={upload}>
        {loading ? 'Leyendo…' : 'Enviar a Pendientes'}
      </button>
      {message && <p className="text-sm text-foreground">{message}</p>}
    </section>
  );
}
