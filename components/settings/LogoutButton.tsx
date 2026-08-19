'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function LogoutButton() {
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);

  const handleLogout = async () => {
    setLoggingOut(true);
    await createClient().auth.signOut();
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.ready.catch(() => null);
      reg?.active?.postMessage({ type: 'CLEAR_CACHES' });
    }
    if (typeof caches !== 'undefined') {
      const names = await caches.keys();
      await Promise.all(names.map((n) => caches.delete(n)));
    }
    router.push('/login');
    router.refresh();
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
