'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';

type Pat = {
  id: string;
  name: string;
  token_prefix: string;
  scopes: string[];
  expires_at: string | null;
  last_used_at: string | null;
  revoked_at: string | null;
  created_at: string;
};

type AuditEvent = {
  id: string;
  action: string;
  source: string;
  ip_hash: string | null;
  user_agent: string | null;
  created_at: string;
};

function defaultOneYearExpiry(): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() + 1);
  return `${d.toISOString().slice(0, 10)}T23:59:59.000Z`;
}

const SCOPE_LABELS: Record<string, string> = {
  read: 'Lectura',
  write: 'Escritura',
  ingest: 'Cargar gastos',
  'write:confirm': 'Confirmar solo',
};

function scopeLabel(scope: string): string {
  return SCOPE_LABELS[scope] || scope;
}

const EXAMPLE_BODY = `{
  "amount": 1250.50,
  "currency": "ARS",
  "merchant": "Ejemplo Café (dato de ejemplo)",
  "cardName": "Visa Ejemplo",
  "timestamp": "2026-10-24T18:00:00-03:00"
}`;

export default function IntegrationsPanel({
  appBaseUrl,
  autoConfirm,
}: {
  appBaseUrl: string;
  autoConfirm: boolean;
}) {
  const ingestUrl = `${appBaseUrl || ''}/api/ingest/wallet`;
  const [tokens, setTokens] = useState<Pat[]>([]);
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [name, setName] = useState('Atajo Wallet');
  const [scopes, setScopes] = useState<string[]>(['ingest']);
  const [expiresAt, setExpiresAt] = useState(() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() + 1);
    return d.toISOString().slice(0, 10);
  });
  const [freshToken, setFreshToken] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [walletAuto, setWalletAuto] = useState(autoConfirm);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    const [t, a] = await Promise.all([
      fetch('/api/user/tokens').then((r) => r.json()),
      fetch('/api/user/audit').then((r) => r.json()),
    ]);
    setTokens(Array.isArray(t.tokens) ? t.tokens : []);
    setEvents(Array.isArray(a.events) ? a.events : []);
  }, []);

  useEffect(() => {
    load().catch(() => {});
  }, [load]);

  const createToken = async () => {
    setLoading(true);
    setMessage('');
    setFreshToken(null);
    try {
      const res = await fetch('/api/user/tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, scopes, expiresAt: `${(expiresAt || defaultOneYearExpiry().slice(0, 10))}T23:59:59.000Z` }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'No se pudo crear');
      setFreshToken(data.token);
      setMessage(data.warning || 'Clave creada. Copiala ahora: no se vuelve a mostrar.');
      await load();
    } catch (e) {
      setMessage(`❌ ${(e as Error).message}`);
    } finally {
      setLoading(false);
    }
  };

  const saveExpiry = async (id: string, value: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/user/tokens/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expiresAt: value ? `${value}T23:59:59.000Z` : defaultOneYearExpiry() }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'No se pudo actualizar');
      }
      await load();
    } catch (e) {
      setMessage(`❌ ${(e as Error).message}`);
    } finally {
      setLoading(false);
    }
  };

  const revoke = async (id: string) => {
    if (!confirm('¿Revocar esta clave? Deja de funcionar de inmediato.')) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/user/tokens/${id}`, { method: 'DELETE' });
      if (!res.ok && res.status !== 204) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'No se pudo revocar');
      }
      await load();
    } catch (e) {
      setMessage(`❌ ${(e as Error).message}`);
    } finally {
      setLoading(false);
    }
  };

  const sendTest = async () => {
    setLoading(true);
    setMessage('');
    try {
      const res = await fetch('/api/ingest/wallet/test', { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Falló el envío de prueba');
      const status = data.autoConfirmed ? 'autoConfirmed' : data.item?.status || 'pending';
      setMessage(
        `✅ Envío de ejemplo: ${status}. Revisalo en Bandeja de pendientes.`
      );
    } catch (e) {
      setMessage(`❌ ${(e as Error).message}`);
    } finally {
      setLoading(false);
    }
  };

  const toggleAuto = async () => {
    const next = !walletAuto;
    setWalletAuto(next);
    await fetch('/api/user/wallet-settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ wallet_auto_confirm: next }),
    });
  };

  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setMessage('Copiado.');
    } catch {
      setMessage('No pude copiar. Seleccioná el texto a mano.');
    }
  };

  const toggleScope = (scope: string) => {
    setScopes((prev) => (prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope]));
  };

  return (
    <div className="space-y-6">
      {message && (
        <div className="rounded-xl border border-border bg-surface-soft p-3 text-sm text-foreground">{message}</div>
      )}

      <section className="card space-y-4">
        <h2 className="text-xl font-semibold">Claves de acceso</h2>
        <p className="text-sm text-muted-foreground">
          La clave se muestra una sola vez. Elegí qué puede hacer: leer, dejar gastos pendientes o cargarlos desde el
          teléfono. Caduca en un año; podés cambiar la fecha.
        </p>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="flex-1 text-sm">
            Nombre
            <input
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label className="text-sm">
            Caduca
            <input
              type="date"
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
            />
          </label>
          <div className="flex flex-wrap gap-3 text-sm">
            {['read', 'write', 'ingest'].map((s) => (
              <label key={s} className="inline-flex items-center gap-1">
                <input type="checkbox" checked={scopes.includes(s)} onChange={() => toggleScope(s)} />
                {scopeLabel(s)}
              </label>
            ))}
            <label className="inline-flex items-center gap-1">
              <input
                type="checkbox"
                checked={scopes.includes('write:confirm')}
                onChange={() => toggleScope('write:confirm')}
              />
              Confirmar solo
            </label>
          </div>
          {scopes.includes('write:confirm') && (
            <p className="text-xs text-amber-700 dark:text-amber-400">
              Este permiso deja que un atajo confirme gastos solo, sin pasar por Pendientes. Si alguien copia tu
              clave, podría cargar movimientos. Lo más seguro es confirmar vos en Pendientes o Telegram. Escritura
              solo deja el gasto en la bandeja; no lo confirma.
            </p>
          )}
          <button type="button" className="btn-primary" disabled={loading} onClick={createToken}>
            Crear clave
          </button>
        </div>
        {freshToken && (
          <div className="rounded-xl border border-primary/40 bg-primary/5 p-3">
            <p className="text-xs text-muted-foreground mb-1">Mostrado una sola vez</p>
            <code className="block break-all text-sm">{freshToken}</code>
            <button type="button" className="mt-2 text-sm text-primary" onClick={() => copy(freshToken)}>
              Copiar clave
            </button>
          </div>
        )}
        <ul className="divide-y divide-border">
          {tokens.map((t) => (
            <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
              <div>
                <p className="font-medium">{t.name}</p>
                <p className="text-muted-foreground">
                  {t.token_prefix}… · {t.scopes.map(scopeLabel).join(', ')}
                  {t.expires_at ? ` · caduca ${new Date(t.expires_at).toLocaleDateString('es-AR')}` : ''}
                  {t.revoked_at ? ' · revocado' : t.last_used_at ? ` · usado ${new Date(t.last_used_at).toLocaleString('es-AR')}` : ''}
                </p>
              </div>
              {!t.revoked_at && (
                <div className="flex items-center gap-2">
                  <label className="text-xs text-muted-foreground">
                    Caduca
                    <input
                      type="date"
                      className="ml-1 rounded border border-border bg-background px-2 py-1"
                      value={t.expires_at ? t.expires_at.slice(0, 10) : ''}
                      onChange={(e) => saveExpiry(t.id, e.target.value)}
                    />
                  </label>
                  <button type="button" className="text-destructive" onClick={() => revoke(t.id)}>
                    Revocar
                  </button>
                </div>
              )}
            </li>
          ))}
          {tokens.length === 0 && <li className="py-2 text-sm text-muted-foreground">Todavía no hay claves.</li>}
        </ul>
      </section>

      <section className="card space-y-3">
        <h2 className="text-xl font-semibold">Atajo del iPhone (Wallet)</h2>
        <ol className="list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
          <li>En el iPhone abrí Atajos y creá una automatización cuando hay una transacción de Wallet.</li>
          <li>Agregá la acción para enviar datos a una página web.</li>
          <li>
            Dirección:{' '}
            <code className="text-foreground">{ingestUrl || 'https://tu-dominio/api/ingest/wallet'}</code>.
          </li>
          <li>Pegá tu clave de acceso en la autorización del atajo.</li>
          <li>
            Enviá el monto, la moneda, el comercio, la tarjeta y la fecha. Zarix deja el gasto en Pendientes para que
            lo confirmes. Si el atajo reenvía el mismo gasto, no se duplica; si es parecido, lo vas a ver marcado como
            posible duplicado.
          </li>
          <li>Revisá el resultado en Pendientes.</li>
        </ol>
        <details className="rounded-xl bg-secondary p-3 text-sm">
          <summary className="cursor-pointer font-medium text-foreground">Ejemplo de datos que envía el atajo</summary>
          <pre className="mt-2 overflow-x-auto text-xs">{EXAMPLE_BODY}</pre>
        </details>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="text-sm text-primary" onClick={() => copy(EXAMPLE_BODY)}>
            Copiar ejemplo
          </button>
          <button type="button" className="btn-primary" disabled={loading} onClick={sendTest}>
            Enviar prueba
          </button>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={walletAuto} onChange={toggleAuto} />
          Confirmar solo si el pendiente está completo y el comercio ya es conocido
        </label>
        <p className="text-sm">
          Los pendientes aparecen en{' '}
          <Link href="/pendientes" className="text-primary">
            Bandeja de pendientes
          </Link>
          .
        </p>
      </section>

      <section className="card space-y-3">
        <h2 className="text-xl font-semibold">Android (notificaciones del banco)</h2>
        <p className="text-sm text-muted-foreground">
          Cuando te llega la notificación del banco o de Wallet, tu automatización puede mandar ese texto a Zarix.
          Zarix interpreta el monto y el comercio. Los gastos aparecen en Pendientes; si el mismo aviso se reenvía, no
          se duplica.
        </p>
        <p className="text-sm text-muted-foreground">
          Paso a paso en la{' '}
          <Link href="/docs/android" className="text-primary">
            guía para Android
          </Link>
          .
        </p>
      </section>

      <section className="card space-y-3">
        <h2 className="text-xl font-semibold">Historial de actividad</h2>
        <p className="text-sm text-muted-foreground">
          Altas y bajas de claves, usos y cargas. Sin datos sensibles.
        </p>
        <ul className="divide-y divide-border text-sm">
          {events.map((e) => (
            <li key={e.id} className="py-2">
              <span className="font-medium">{e.action}</span>{' '}
              <span className="text-muted-foreground">
                · {e.source} · {new Date(e.created_at).toLocaleString('es-AR')}
              </span>
            </li>
          ))}
          {events.length === 0 && <li className="py-2 text-muted-foreground">Todavía no hay eventos.</li>}
        </ul>
      </section>
    </div>
  );
}
