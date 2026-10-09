/** Browser-owned batch identity. File bytes are reselected, never silently resent. */
export interface ImportBatchOptions {
  dateFormat: 'dmy' | 'mdy';
  resolutions: Record<string, { action: 'none' | 'map' | 'keep_name'; accountId?: string }>;
  skipDuplicates: boolean;
}
export interface ImportBatch {
  id: string;
  ownerId: string;
  fileHash: string;
  fileName: string;
  options: ImportBatchOptions;
  createdAt: number;
  acknowledged: boolean;
}
const STORE = 'batches';
function openJournal(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('zarix-import-journal', 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: ['ownerId', 'fileHash'] });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
export async function getImportBatch(ownerId: string, fileHash: string): Promise<ImportBatch | null> {
  const db = await openJournal();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get([ownerId, fileHash]);
    tx.oncomplete = () => { db.close(); resolve(req.result ?? null); };
    tx.onabort = () => { db.close(); reject(tx.error); };
  });
}
/** Read+write in one IndexedDB transaction arbitrates simultaneous tabs. */
export async function prepareImportBatch(
  input: Pick<ImportBatch, 'ownerId' | 'fileHash' | 'fileName' | 'options'>,
  replaceBatchId?: string
): Promise<ImportBatch> {
  const db = await openJournal();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    const req = store.get([input.ownerId, input.fileHash]);
    let result: ImportBatch;
    let failure: Error | undefined;
    req.onsuccess = () => {
      const prior = req.result as ImportBatch | undefined;
      if (replaceBatchId && prior?.id !== replaceBatchId) {
        failure = new Error('Este archivo cambió en otra pestaña. Volvé a seleccionarlo para revisar el lote.');
        tx.abort(); return;
      }
      if (replaceBatchId && !prior?.acknowledged) {
        failure = new Error('El lote anterior sigue pendiente de confirmación. Reintentá ese mismo lote con el archivo original, sin editarlo.');
        tx.abort(); return;
      }
      if (prior && !replaceBatchId) {
        // Retrying may settle previously skipped rows. Mark it unconfirmed
        // before sending, preserving the exact ID and options across reloads.
        result = { ...prior, acknowledged: false };
        store.put(result);
      } else {
        result = { ...input, id: crypto.randomUUID(), createdAt: Date.now(), acknowledged: false };
        store.put(result);
      }
    };
    tx.oncomplete = () => { db.close(); resolve(result); };
    tx.onabort = () => { db.close(); reject(failure ?? tx.error ?? new Error('No se pudo guardar el lote.')); };
  });
}
export async function acknowledgeImportBatch(batch: ImportBatch): Promise<void> {
  const db = await openJournal();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    const req = store.get([batch.ownerId, batch.fileHash]);
    req.onsuccess = () => {
      if (req.result?.id === batch.id) store.put({ ...req.result, acknowledged: true });
    };
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onabort = () => { db.close(); reject(tx.error); };
  });
}
