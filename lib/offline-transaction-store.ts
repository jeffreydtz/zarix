import { sendQueuedTransaction } from '@/lib/offline-queue-sync';
import { createClient } from '@/lib/supabase/client';

const DB_NAME = 'zarix-offline';
const DB_VERSION = 1;
const STORE_NAME = 'pending_transactions';

export interface QueuedOperation {
  id: string;
  payload: unknown;
  ownerId?: string;
  draftScope?: string;
  confirmedReceipt?: any;
  endpoint?: string;
  method?: 'POST' | 'PUT';
  createdAt: number;
  sequence?: number;
}

export interface QueuedTransaction extends QueuedOperation {
  payload: {
    type: string;
    accountId: string;
    destinationAccountId?: string;
    amount: number;
    currency: string;
    categoryId?: string | null;
    description?: string;
    transactionDate?: string;
    notes?: string;
    tags?: string[];
    installments?: number;
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

export async function dbGetAll(): Promise<QueuedOperation[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).getAll();
    tx.oncomplete = () => { db.close(); resolve((req.result ?? []).sort((a: QueuedOperation, b: QueuedOperation) => (a.sequence ?? a.createdAt) - (b.sequence ?? b.createdAt))); };
    tx.onabort = () => { db.close(); reject(tx.error); };
    req.onerror = () => reject(req.error);
  });
}

export async function dbAdd(item: QueuedOperation): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const existing = store.getAll();
    existing.onsuccess = () => {
      // The readwrite transaction serializes tabs and gives same-millisecond
      // operations a stable order independent of their random request IDs.
      item.sequence = (existing.result as QueuedOperation[])
        .reduce((max, saved) => Math.max(max, saved.sequence ?? saved.createdAt), 0) + 1;
      store.add(item);
    };
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onabort = () => { db.close(); reject(tx.error); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

export async function dbRemove(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(id);
    tx.oncomplete = () => { db.close(); window.dispatchEvent(new Event('zarix-queue-changed')); resolve(); };
    tx.onabort = () => { db.close(); reject(tx.error); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

/** Persist before any HTTP request; never derive IDs from payload contents. */
export async function enqueueOperation(endpoint: string, payload: unknown, method: 'POST' | 'PUT' = 'POST', draftScope?: string): Promise<QueuedOperation> {
  const ownerId = endpoint.startsWith('/api/shared/') ? undefined : await getQueueOwnerId();
  if (!endpoint.startsWith('/api/shared/') && !ownerId) throw new Error('Iniciá sesión antes de guardar una operación.');
  const item = { id: crypto.randomUUID(), endpoint, method, payload, draftScope, ownerId: ownerId ?? undefined, createdAt: Date.now() };
  await dbAdd(item);
  window.dispatchEvent(new Event('zarix-queue-changed'));
  return item;
}

export async function enqueueTransaction(payload: QueuedTransaction['payload']): Promise<QueuedOperation> {
  return enqueueOperation('/api/transactions', payload);
}

export async function getQueueOwnerId(): Promise<string | null> {
  const { data, error } = await createClient().auth.getSession();
  if (error) throw error;
  return data.session?.user.id ?? null;
}

export interface FinancialSubmitResult {
  item: QueuedOperation;
  state: 'confirmed' | 'pending';
  receipt?: any;
  error?: string;
}

/** The form retains result.item until confirmed. A retry never mints another ID. */
export async function submitFinancialOperation(
  endpoint: string, payload: unknown, method: 'POST' | 'PUT' = 'POST', pending?: QueuedOperation, draftScope = endpoint
): Promise<FinancialSubmitResult> {
  const ownerId = endpoint.startsWith('/api/shared/') ? undefined : await getQueueOwnerId();
  // A pending form survives component teardown, reload and browser restart.
  const stored = await dbGetAll();
  const saved = pending ? stored.find(item => item.id === pending.id) ?? pending
    : stored.find(item => item.draftScope === draftScope && item.ownerId === ownerId);
  const item = saved ?? await enqueueOperation(endpoint, payload, method, draftScope);
  if (item.endpoint !== endpoint || item.method !== method || JSON.stringify(item.payload) !== JSON.stringify(payload)) {
    return { item, state: 'pending', error: 'La operación anterior sigue pendiente. Reintentá con sus datos originales o revisá la cola antes de cargar otra.' };
  }
  try {
    if (!endpoint.startsWith('/api/shared/') && item.ownerId !== await getQueueOwnerId()) {
      return { item, state: 'pending', error: 'La operación pertenece a otra sesión. Volvé a ingresar con esa cuenta.' };
    }
    const result = item.confirmedReceipt
      ? { ok: true, status: 200, receipt: item.confirmedReceipt, error: undefined }
      : await sendQueuedTransaction(item);
    if (!result.ok) return { item, state: 'pending', error: `${result.error || 'No se confirmó la operación.'} Sigue guardada para reintentar sin duplicarla.` };
    try {
      await dbConfirm(item.id, result.receipt);
      await dbRemove(item.id);
    } catch {
      return { item, state: 'pending', receipt: result.receipt,
        error: 'La operación está confirmada en el servidor, pero la cola no pudo actualizarse. Reintentá con la misma solicitud; no vuelvas a cargarla.' };
    }
    return { item, state: 'confirmed', receipt: result.receipt };
  } catch {
    return { item, state: 'pending', error: 'No se recibió una confirmación. La operación sigue guardada; reintentá sin volver a cargarla.' };
  }
}

/** Background confirmations remain attached to the draft until the form observes
 * them or the user explicitly removes them. Never resurrect a discarded item. */
export async function dbConfirm(id: string, receipt: unknown): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(id);
    request.onsuccess = () => {
      if (request.result) store.put({ ...request.result, confirmedReceipt: receipt });
    };
    tx.oncomplete = () => { db.close(); window.dispatchEvent(new Event('zarix-queue-changed')); resolve(); };
    tx.onabort = tx.onerror = () => { db.close(); reject(tx.error); };
  });
}
