'use client';

import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { createClient } from '@/lib/supabase/client';
import { translatePasskeyError } from '@/lib/auth/auth-error-messages';

type Passkey = {
  id: string;
  friendly_name?: string;
  created_at: string;
  last_used_at?: string;
};

function formatDate(value?: string): string {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('es-AR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export default function PasskeysSection() {
  const [supported, setSupported] = useState<boolean | null>(null);
  const [passkeys, setPasskeys] = useState<Passkey[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');

  const loadPasskeys = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const supabase = createClient();
      const { data, error } = await supabase.auth.passkey.list();
      if (error) throw error;
      setPasskeys(data ?? []);
    } catch (err) {
      setError(translatePasskeyError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const ok =
      typeof window !== 'undefined' &&
      typeof window.PublicKeyCredential !== 'undefined';
    setSupported(ok);
    if (ok) void loadPasskeys();
    else setLoading(false);
  }, [loadPasskeys]);

  const handleRegister = async () => {
    setBusy(true);
    setError('');
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.registerPasskey();
      if (error) throw error;
      await loadPasskeys();
    } catch (err) {
      setError(translatePasskeyError(err));
    } finally {
      setBusy(false);
    }
  };

  const handleRename = async (passkeyId: string) => {
    const friendlyName = editingName.trim();
    if (!friendlyName) {
      setEditingId(null);
      return;
    }
    setBusy(true);
    setError('');
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.passkey.update({ passkeyId, friendlyName });
      if (error) throw error;
      setEditingId(null);
      await loadPasskeys();
    } catch (err) {
      setError(translatePasskeyError(err));
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (passkey: Passkey) => {
    const label = passkey.friendly_name || 'esta passkey';
    if (!window.confirm(`¿Eliminar ${label}? No vas a poder iniciar sesión con ella.`)) {
      return;
    }
    setBusy(true);
    setError('');
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.passkey.delete({ passkeyId: passkey.id });
      if (error) throw error;
      await loadPasskeys();
    } catch (err) {
      setError(translatePasskeyError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="card p-6"
    >
      <h2 className="text-lg font-semibold mb-1 flex items-center gap-2">
        <span>🔑</span> Passkeys
      </h2>
      <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
        Iniciá sesión con tu huella, cara o PIN del dispositivo, sin contraseña. Tu email y
        contraseña siguen funcionando como respaldo.
      </p>

      {supported === false && (
        <div className="p-4 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-sm text-amber-700 dark:text-amber-400">
          Este navegador o dispositivo no soporta passkeys. Probá desde un navegador moderno con
          biometría o PIN.
        </div>
      )}

      {supported && (
        <div className="space-y-4">
          {error && (
            <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-400">
              {error}
            </div>
          )}

          {loading ? (
            <p className="text-sm text-slate-500">Cargando passkeys...</p>
          ) : passkeys.length === 0 ? (
            <p className="text-sm text-slate-500">Todavía no registraste ninguna passkey.</p>
          ) : (
            <ul className="space-y-2">
              {passkeys.map((pk) => (
                <li
                  key={pk.id}
                  className="flex items-center justify-between gap-3 p-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                >
                  {editingId === pk.id ? (
                    <input
                      autoFocus
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') void handleRename(pk.id);
                        if (e.key === 'Escape') setEditingId(null);
                      }}
                      maxLength={120}
                      className="input flex-1"
                      placeholder="Nombre de la passkey"
                    />
                  ) : (
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate">
                        {pk.friendly_name || 'Passkey'}
                      </div>
                      <div className="text-xs text-slate-500">
                        Creada {formatDate(pk.created_at)}
                        {pk.last_used_at ? ` · Usada ${formatDate(pk.last_used_at)}` : ''}
                      </div>
                    </div>
                  )}

                  <div className="flex shrink-0 gap-2">
                    {editingId === pk.id ? (
                      <>
                        <button
                          onClick={() => void handleRename(pk.id)}
                          disabled={busy}
                          className="text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline disabled:opacity-50"
                        >
                          Guardar
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          className="text-sm text-slate-500 hover:underline"
                        >
                          Cancelar
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => {
                            setEditingId(pk.id);
                            setEditingName(pk.friendly_name || '');
                          }}
                          disabled={busy}
                          className="text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 disabled:opacity-50"
                        >
                          Renombrar
                        </button>
                        <button
                          onClick={() => void handleDelete(pk)}
                          disabled={busy}
                          className="text-sm text-red-600 dark:text-red-400 hover:underline disabled:opacity-50"
                        >
                          Eliminar
                        </button>
                      </>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}

          <button
            onClick={handleRegister}
            disabled={busy || loading}
            className="btn btn-primary px-4 py-2 text-sm"
          >
            {busy ? 'Procesando...' : '➕ Agregar passkey'}
          </button>
        </div>
      )}
    </motion.div>
  );
}
