'use client';

import { useEffect } from 'react';
import {
  fetchJsonArray,
  maybePersistAccountsSnapshot,
  maybePersistCategoriesSnapshot,
} from '@/lib/offline-reference-cache';

/**
 * Guarda cuentas y categorías en localStorage cuando hay red, para selects offline (FAB, etc.).
 */
export default function OfflineReferenceWarmup() {
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (typeof navigator !== 'undefined' && !navigator.onLine) return;
      const online = typeof navigator !== 'undefined' && navigator.onLine;
      const [accs, cats] = await Promise.all([
        fetchJsonArray<unknown>('/api/accounts'),
        fetchJsonArray<unknown>('/api/categories'),
      ]);
      if (cancelled) return;
      maybePersistAccountsSnapshot(accs, online);
      maybePersistCategoriesSnapshot(cats, online);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
