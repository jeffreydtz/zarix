export interface PendingQueueItem {
  id: string;
  payload: unknown;
}

export interface QueueSyncResult {
  confirmed: number;
  failure?: 'response' | 'network' | 'storage';
  status?: number;
}

/** A pending item is removed only after confirmation, never on an HTTP rejection. */
export async function syncPendingTransactions(
  items: PendingQueueItem[],
  send: (item: PendingQueueItem) => Promise<{ ok: boolean; status: number }>,
  remove: (id: string) => Promise<void>
): Promise<QueueSyncResult> {
  let confirmed = 0;
  for (const item of items) {
    let response: { ok: boolean; status: number };
    try {
      response = await send(item);
    } catch {
      return { confirmed, failure: 'network' };
    }
    if (!response.ok) return { confirmed, failure: 'response', status: response.status };
    try {
      await remove(item.id);
    } catch {
      return { confirmed, failure: 'storage' };
    }
    confirmed++;
  }
  return { confirmed };
}
