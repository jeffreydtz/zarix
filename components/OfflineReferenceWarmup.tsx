'use client';

import { useEffect } from 'react';
import {
  fetchReferenceList,
  maybePersistAccountsSnapshot,
  maybePersistCategoriesSnapshot,
} from '@/lib/offline-reference-cache';

/**
 * Guarda cuentas y categorías en localStorage cuando hay red, para selects offline (FAB, etc.).
 */
export default function OfflineReferenceWarmup() {
  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      if (typeof navigator !== 'undefined' && !navigator.onLine) return;
      const online = typeof navigator !== 'undefined' && navigator.onLine;
      const [accs, cats] = await Promise.all([
        fetchReferenceList<unknown>('/api/accounts?lite=1', { ttlMs: 2 * 60 * 1000 }),
        fetchReferenceList<unknown>('/api/categories', { ttlMs: 2 * 60 * 1000 }),
      ]);
      if (cancelled) return;
      maybePersistAccountsSnapshot(accs, online);
      maybePersistCategoriesSnapshot(cats, online);
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
    return () => {
      cancelled = true;
      cancelSchedule();
    };
  }, []);

  return null;
}
