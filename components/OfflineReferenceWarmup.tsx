'use client';

import { useEffect } from 'react';
import {
  fetchReferenceList,
  getOfflineReferenceOwner,
  REFERENCE_OWNER_CHANGED,
} from '@/lib/offline-reference-cache';

/**
 * Guarda cuentas y categorías en localStorage cuando hay red, para selects offline (FAB, etc.).
 */
export default function OfflineReferenceWarmup() {
  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      if (typeof navigator !== 'undefined' && !navigator.onLine) return;
      const ownerId = await getOfflineReferenceOwner();
      if (!ownerId || cancelled) return;
      await Promise.all([
        fetchReferenceList<unknown>('/api/accounts?lite=1', { ttlMs: 2 * 60 * 1000, ownerId }),
        fetchReferenceList<unknown>('/api/categories', { ttlMs: 2 * 60 * 1000, ownerId }),
      ]);
    };

    // No competir con el primer fetch de la página / transición de ruta (misma prioridad de red).
    const schedule =
      typeof requestIdleCallback !== 'undefined'
        ? () => {
            const id = requestIdleCallback(() => void run(), { timeout: 4000 });
            return () => cancelIdleCallback(id);
          }
        : () => {
            const t = window.setTimeout(() => void run(), 800);
            return () => clearTimeout(t);
          };

    const cancelSchedule = schedule();
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    const ownerChanged = () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      // Leave the auth callback/lock before reading the new session.
      refreshTimer = setTimeout(() => { if (!cancelled) void run(); }, 0);
    };
    window.addEventListener(REFERENCE_OWNER_CHANGED, ownerChanged);
    return () => {
      cancelled = true;
      cancelSchedule();
      if (refreshTimer) clearTimeout(refreshTimer);
      window.removeEventListener(REFERENCE_OWNER_CHANGED, ownerChanged);
    };
  }, []);

  return null;
}
