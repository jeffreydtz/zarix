'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { syncPendingTransactions } from '@/lib/offline-queue-sync';

const DB_NAME = 'zarix-offline';
const DB_VERSION = 1;
const STORE_NAME = 'pending_transactions';

export interface QueuedTransaction {
  id: string;
  payload: {
    type: string;
    accountId: string;
    destinationAccountId?: string;
    amount: number;
    currency: string;
    categoryId: string | null;
    description: string;
    transactionDate: string;
    exchangeRateOverride?: number;
  };
  createdAt: number;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function dbGetAll(): Promise<QueuedTransaction[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).getAll();
    req.onsuccess = () => resolve(req.result ?? []);
    req.onerror = () => reject(req.error);
  });
}

async function dbAdd(item: QueuedTransaction): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(item);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function dbRemove(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export function useOfflineQueue() {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [pendingCount, setPendingCount] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [needsReview, setNeedsReview] = useState(false);
  const syncingRef = useRef(false);
  const reviewRequiredRef = useRef(false);

  const refreshCount = useCallback(async () => {
    try {
      const items = await dbGetAll();
      setPendingCount(items.length);
    } catch {
      // IndexedDB unavailable (e.g. Safari private mode)
    }
  }, []);

  const enqueue = useCallback(
    async (payload: QueuedTransaction['payload']): Promise<void> => {
      const item: QueuedTransaction = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        payload,
        createdAt: Date.now(),
      };
      await dbAdd(item);
      await refreshCount();
    },
    [refreshCount]
  );

  const sync = useCallback(async () => {
    if (syncingRef.current || reviewRequiredRef.current) return;
    syncingRef.current = true;
    setSyncing(true);
    setSyncError(null);
    setNeedsReview(false);
    try {
      const items = await dbGetAll();
      const result = await syncPendingTransactions(
        items,
        (item) => fetch('/api/transactions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(item.payload),
          }),
        dbRemove
      );
      if (result.failure === 'storage') {
        reviewRequiredRef.current = true;
        setNeedsReview(true);
        setSyncError('Se confirmó un registro, pero no se pudo actualizar la cola. Revisá tus movimientos antes de volver a sincronizar.');
      } else if (result.status === 401 || result.status === 403) {
        setSyncError('Tus movimientos siguen guardados. Iniciá sesión y reintentá.');
      } else if (result.failure) {
        setSyncError('No se pudo confirmar el registro. Tus movimientos siguen guardados para reintentar.');
      }
    } catch {
      setSyncError('No se pudo leer la cola guardada. Reintentá cuando esté disponible.');
    } finally {
      syncingRef.current = false;
      setSyncing(false);
      await refreshCount();
    }
  }, [refreshCount]);

  useEffect(() => {
    refreshCount();

    const handleOnline = () => {
      setIsOnline(true);
      sync();
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Listen for Background Sync trigger from service worker
    const handleSwMessage = (e: MessageEvent) => {
      if (e.data?.type === 'SYNC_QUEUE') sync();
    };
    navigator.serviceWorker?.addEventListener('message', handleSwMessage);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      navigator.serviceWorker?.removeEventListener('message', handleSwMessage);
    };
  }, [refreshCount, sync]);

  return { isOnline, pendingCount, syncing, syncError, needsReview, enqueue, sync };
}
