'use client';

import { useEffect, useState } from 'react';
export type UserBenchmarkSettings = {
  plazo_fijo_tna: number | null;
  plazo_fijo_label: string | null;
  caucion_tna: number | null;
  caucion_label: string | null;
  fci_mm_ticker: string | null;
};

export default function BenchmarkSettingsForm() {
  const [form, setForm] = useState<UserBenchmarkSettings | null>(null);
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch('/api/user/benchmarks')
      .then((r) => r.json())
      .then((data) => {
        if (data && typeof data === 'object' && !data.error) setForm(data);
      })
      .catch(() => {});
  }, []);

  if (!form) return null;

  const save = async () => {
    setSaving(true);
    setMessage('');
    try {
      const res = await fetch('/api/user/benchmarks', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plazo_fijo_tna: form.plazo_fijo_tna,
          plazo_fijo_label: form.plazo_fijo_label,
          caucion_tna: form.caucion_tna,
          caucion_label: form.caucion_label,
          fci_mm_ticker: form.fci_mm_ticker,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(data.error || 'No se pudo guardar.');
        return;
      }
      setForm(data);
      setMessage('Guardado.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="card p-4 space-y-3">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Benchmarks de rendimiento real</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Zarix no inventa tasas. El plazo fijo intenta argentinadatos.com; caución y FCI money
          market quedan no disponibles hasta que cargues un TNA o un ticker CAFCI. Esto no es
          una recomendación de inversión.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="text-sm">
          TNA plazo fijo (%)
          <input
            type="number"
            step="0.01"
            min={0}
            max={400}
            className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2"
            value={form.plazo_fijo_tna ?? ''}
            onChange={(e) =>
              setForm({ ...form, plazo_fijo_tna: e.target.value === '' ? null : Number(e.target.value) })
            }
          />
        </label>
        <label className="text-sm">
          Fuente / etiqueta plazo fijo
          <input
            type="text"
            maxLength={80}
            className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2"
            value={form.plazo_fijo_label ?? ''}
            onChange={(e) => setForm({ ...form, plazo_fijo_label: e.target.value || null })}
          />
        </label>
        <label className="text-sm">
          TNA caución (%)
          <input
            type="number"
            step="0.01"
            min={0}
            max={400}
            className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2"
            value={form.caucion_tna ?? ''}
            onChange={(e) =>
              setForm({ ...form, caucion_tna: e.target.value === '' ? null : Number(e.target.value) })
            }
          />
        </label>
        <label className="text-sm">
          Fuente / etiqueta caución
          <input
            type="text"
            maxLength={80}
            className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2"
            value={form.caucion_label ?? ''}
            onChange={(e) => setForm({ ...form, caucion_label: e.target.value || null })}
          />
        </label>
        <label className="text-sm sm:col-span-2">
          Ticker CAFCI money market
          <input
            type="text"
            maxLength={32}
            className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2"
            placeholder="Ej. IOLDOLD (dato de ejemplo)"
            value={form.fci_mm_ticker ?? ''}
            onChange={(e) => setForm({ ...form, fci_mm_ticker: e.target.value || null })}
          />
        </label>
      </div>
      <button
        type="button"
        onClick={() => void save()}
        disabled={saving}
        className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
      >
        {saving ? 'Guardando…' : 'Guardar benchmarks'}
      </button>
      {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
    </section>
  );
}
