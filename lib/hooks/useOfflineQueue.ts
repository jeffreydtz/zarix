'use client';

import { createClient } from '@/lib/supabase/client';
import { useEffect, useState, useCallback, useRef } from 'react';
import { syncPendingOperations, sendQueuedTransaction, queueItemInScope, type FinancialOperationOutcome } from '@/lib/offline-queue-sync';

import { dbGetAll, dbRemove, dbConfirm, recoverFinancialOperation, enqueueTransaction, enqueueOperation as persistOperation, getQueueOwnerId, type FinancialSubmitResult, type QueuedTransaction, type QueuedOperation } from '@/lib/offline-transaction-store';
export type { QueuedTransaction } from '@/lib/offline-transaction-store';

export function useOfflineQueue(endpointPrefix?: string) {
  const readScopedQueue = useCallback(async () => {
    const items = await dbGetAll();
    const ownerId = endpointPrefix ? null : await getQueueOwnerId();
    return {
      items: items.filter(item => queueItemInScope(item, ownerId, endpointPrefix)),
      legacy: endpointPrefix ? [] : items.filter(item => !item.ownerId && !item.endpoint?.startsWith('/api/shared/')),
    };
  }, [endpointPrefix]);
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [pendingCount, setPendingCount] = useState(0);
  const [pendingItems, setPendingItems] = useState<QueuedOperation[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [needsReview, setNeedsReview] = useState(false);
  const syncingRef = useRef(false);

  const refreshCount = useCallback(async () => {
    try {
      const { items, legacy } = await readScopedQueue();
      setPendingCount(items.length + legacy.length);
      setPendingItems([...items, ...legacy]);
      setNeedsReview(legacy.length > 0);
      if (legacy.length) setSyncError('Hay operaciones antiguas sin una sesión identificada. Revisá tus movimientos antes de volver a cargarlas.');
    } catch {
      // IndexedDB unavailable (e.g. Safari private mode)
    }
  }, [readScopedQueue]);

  const enqueue = useCallback(
    async (payload: QueuedTransaction['payload']): Promise<void> => {
      await enqueueTransaction(payload);
      await refreshCount();
    },
    [refreshCount]
  );

  const enqueueOperation = useCallback(async (endpoint: string, payload: unknown, method: 'POST' | 'PUT' = 'POST') => {
    const item = await persistOperation(endpoint, payload, method);
    await refreshCount();
    return item;
  }, [refreshCount]);

  const sync = useCallback(async (): Promise<FinancialOperationOutcome[]> => {
    if (syncingRef.current) return [];
    syncingRef.current = true;
    setSyncing(true);
    setSyncError(null);
    setNeedsReview(false);
    try {
      const { items } = await readScopedQueue();
      const outcomes = await syncPendingOperations(
        items.filter(item => !item.confirmedReceipt),
        sendQueuedTransaction,
        async (id, receipt) => {
          const item = items.find(candidate => candidate.id === id);
          if (item?.draftScope) await dbConfirm(id, receipt);
          else await dbRemove(id);
        }
      );
      const failure = outcomes.find(outcome => outcome.state === 'pending' || outcome.failure);
      if (failure?.failure === 'storage') {
        setSyncError('La operación quedó confirmada y la cola sigue guardada. Podés reintentar sin duplicarla.');
      } else if (failure?.status === 401) {
        setSyncError('Tus operaciones siguen guardadas. Iniciá sesión y reintentá.');
      } else if (failure) {
        setSyncError('Hay operaciones sin confirmar. Revisá la cola y reintentá sin volver a cargarlas.');
      }
      return outcomes;
    } catch {
      setSyncError('No se pudo leer la cola guardada. Reintentá cuando esté disponible.');
      return [];
    } finally {
      syncingRef.current = false;
      setSyncing(false);
      await refreshCount();
    }
  }, [refreshCount, readScopedQueue]);

  /** The user selects an ID, never a matching payload/form scope. */
  const retry = useCallback(async (id: string): Promise<FinancialSubmitResult | null> => {
    if (syncingRef.current) return null;
    syncingRef.current = true;
    setSyncing(true);
    setSyncError(null);
    try {
      const { items } = await readScopedQueue();
      const index = items.findIndex(item => item.id === id);
      if (index < 0) {
        setSyncError('La solicitud no pertenece a esta sesión o grupo.');
        return null;
      }
      const selected = items[index];
      const ordered = selected.method === 'PUT' || selected.endpoint?.endsWith('/sell');
      if (ordered && items.slice(0, index).some(item => item.endpoint === selected.endpoint && !item.confirmedReceipt)) {
        setSyncError('Reintentá primero la solicitud anterior de esta operación.');
        return null;
      }
      const result = await recoverFinancialOperation(id);
      if (result.state === 'pending') setSyncError(result.error || 'La solicitud sigue guardada sin confirmar.');
      return result;
    } catch {
      setSyncError('No se pudo retomar la solicitud. Sigue guardada para reintentar.');
      return null;
    } finally {
      syncingRef.current = false;
      setSyncing(false);
      await refreshCount();
    }
  }, [refreshCount, readScopedQueue]);

  const discard = useCallback(async (id: string) => {
    const { items, legacy } = await readScopedQueue();
    if (![...items, ...legacy].some(item => item.id === id)) return;
    await dbRemove(id);
    window.dispatchEvent(new CustomEvent('zarix-operation-discarded', { detail: id }));
    await refreshCount();
  }, [readScopedQueue, refreshCount]);

  useEffect(() => {
    refreshCount();
    if (navigator.onLine) void sync();
    window.addEventListener('zarix-queue-changed', refreshCount);
    const authListener = endpointPrefix ? null : createClient().auth.onAuthStateChange(() => {
      // Leave the auth lock before reading the current session.
      setTimeout(() => { void refreshCount(); if (navigator.onLine) void sync(); }, 0);
    });

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
      authListener?.data.subscription.unsubscribe();
      window.removeEventListener('zarix-queue-changed', refreshCount);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      navigator.serviceWorker?.removeEventListener('message', handleSwMessage);
    };
  }, [refreshCount, sync, endpointPrefix]);

  return { isOnline, pendingCount, pendingItems, discard, retry, syncing, syncError, needsReview, enqueue, enqueueOperation, sync };
}
