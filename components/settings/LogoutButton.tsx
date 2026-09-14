'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { clearOfflineReferenceSnapshots } from '@/lib/offline-reference-cache';
import { setOfflineOwner } from '@/lib/offline-owner';

export default function LogoutButton() {
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);
  const [error, setError] = useState('');

  const handleLogout = async () => {
    setLoggingOut(true);
    setError('');
    try {
      const result = await createClient().auth.signOut();
      if (result.error) throw result.error;
      setOfflineOwner(null);
      clearOfflineReferenceSnapshots();
      // ready never settles when no worker is registered (e.g. first visit).
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations().catch(() => []);
        regs.forEach(reg => reg.active?.postMessage({ type: 'CLEAR_CACHES' }));
      }
      if (typeof caches !== 'undefined') {
        await caches.keys().then(names => Promise.all(names.filter(n => n.startsWith('zarix')).map(n => caches.delete(n)))).catch(() => {});
      }
      router.push('/login');
      router.refresh();
    } catch {
      setError('No pudimos cerrar la sesión. Reintentá.');
      setLoggingOut(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="card p-6"
    >
      <h2 className="text-lg font-semibold mb-1 flex items-center gap-2">
        <span>🚪</span> Sesión
      </h2>
      <p className="text-sm text-muted-foreground mb-4">
        Cerrá tu sesión en este dispositivo.
      </p>
      {error && <p role="alert" className="text-sm text-destructive mb-3">{error}</p>}
      <button
        onClick={handleLogout}
        disabled={loggingOut}
        className="btn bg-destructive hover:bg-destructive/90 text-destructive-foreground px-4 py-2 text-sm disabled:opacity-50"
      >
        {loggingOut ? 'Cerrando...' : 'Cerrar sesión'}
      </button>
    </motion.div>
  );
}
