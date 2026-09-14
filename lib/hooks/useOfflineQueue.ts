'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { getOfflineUserId } from '@/lib/offline-reference-cache';

const DB_NAME = 'zarix-offline';
const DB_VERSION = 1;
const STORE_NAME = 'pending_transactions';

export interface QueuedTransaction {
  id: string;
  userId: string;
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

export async function dbGetAll(): Promise<QueuedTransaction[]> {
  const userId = await getOfflineUserId();
  if (!userId) return [];
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).getAll();
    req.onsuccess = () => resolve((req.result ?? []).filter((item: QueuedTransaction) => item.userId === userId));
    tx.oncomplete = () => db.close();
    req.onerror = () => reject(req.error);
  });
}

export async function dbAdd(item: QueuedTransaction): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(item);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => reject(tx.error);
  });
}

async function dbRemove(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(id);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => reject(tx.error);
  });
}

let syncInFlight: Promise<void> | null = null;

/** Shared by every mounted queue instance; browser lock serializes other tabs. */
export async function syncPendingTransactions(): Promise<void> {
  if (syncInFlight) return syncInFlight;
  const run = async () => {
      const items = await dbGetAll();
      for (const item of items) {
        try {
          if (await getOfflineUserId() !== item.userId) break;
          const res = await fetch('/api/transactions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-zarix-offline-owner': item.userId },
            body: JSON.stringify({ ...item.payload, clientRequestId: item.id }),
          });
          if (res.ok) {
            await dbRemove(item.id);
          } else if ([400, 403, 404, 422].includes(res.status)) {
            // Preserve this draft for recovery, but do not starve unrelated valid drafts.
            continue;
          } else {
            // Stop on session changes, throttling and server failure; preserve all drafts.
            break;
          }
          // 5xx: error transitorio del server → se deja en la cola y se
          // reintenta en el próximo sync.
        } catch {
          // Still offline — stop processing the queue
          break;
        }
      }
  };
  const attempt = (async () => {
    if (typeof navigator !== 'undefined' && navigator.locks) {
      await navigator.locks.request('zarix-offline-sync', { ifAvailable: true }, async lock => {
        if (lock) await run();
      });
    } else await run();
  })();
  const pending = attempt.finally(() => { syncInFlight = null; });
  syncInFlight = pending;
  return pending;
}

export function useOfflineQueue() {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [pendingCount, setPendingCount] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const syncingRef = useRef(false);

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
      const userId = await getOfflineUserId();
      if (!userId) throw new Error('Iniciá sesión antes de guardar un movimiento sin conexión.');
      const item: QueuedTransaction = {
        id: crypto.randomUUID(),
        userId,
        payload,
        createdAt: Date.now(),
      };
      await dbAdd(item);
      await refreshCount();
    },
    [refreshCount]
  );

  const sync = useCallback(async () => {
    if (syncingRef.current) return;
    syncingRef.current = true;
    setSyncing(true);
    try {
      await syncPendingTransactions();
    } catch {
      // DB error
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

  return { isOnline, pendingCount, syncing, enqueue, sync };
}
