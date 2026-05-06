'use client';

import { useEffect } from 'react';

export function useServiceWorker() {
  useEffect(() => {
    if (!('serviceWorker' in navigator) || process.env.NODE_ENV !== 'production') return;

    let cleanupOnlineListener: (() => void) | undefined;
    let cancelled = false;

    navigator.serviceWorker
      .register('/sw.js', { scope: '/', updateViaCache: 'none' })
      .then((registration) => {
        if (cancelled) return;

        // Register a Background Sync tag when the connection restores
        const requestSync = () => {
          if ('sync' in registration) {
            (registration.sync as { register: (tag: string) => Promise<void> })
              .register('zarix-sync')
              .catch(() => {});
          }
        };
        window.addEventListener('online', requestSync);
        cleanupOnlineListener = () => window.removeEventListener('online', requestSync);
      })
      .catch((error) => {
        console.error('[SW] Registration failed:', error);
      });

    return () => {
      cancelled = true;
      cleanupOnlineListener?.();
    };
  }, []);
}
