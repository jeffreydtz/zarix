export interface PendingQueueItem {
  id: string;
  payload: unknown;
  ownerId?: string;
  endpoint?: string;
  method?: 'POST' | 'PUT';
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

/** A redirect/login page or truncated success is not a financial acknowledgement. */
export async function sendQueuedTransaction(
  item: PendingQueueItem,
  fetcher: typeof fetch = fetch
): Promise<{ ok: boolean; status: number; receipt?: any; error?: string }> {
  const endpoint = item.endpoint || '/api/transactions';
  // A pending record can only target one of the known idempotent financial APIs.
  if (!/^\/api\/(transactions|accounts|investments|investments\/[0-9a-f-]+\/sell|shared\/[a-f0-9]{32}\/expenses(?:\/[0-9a-f-]+)?)$/.test(endpoint)) {
    return { ok: false, status: 400 };
  }
  const response = await fetcher(endpoint, {
    method: item.method || 'POST',
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': item.id, ...(item.ownerId ? { 'X-Queue-Owner': item.ownerId } : {}) },
    body: JSON.stringify(item.payload),
  });
  if (!response.ok) {
    const rejected = await response.json().catch(() => null);
    return { ok: false, status: response.status, error: typeof rejected?.error === 'string' ? rejected.error : undefined };
  }
  if (response.headers.get('Idempotency-Key') !== item.id) return { ok: false, status: response.status };
  const receipt = await response.json();
  const id = receipt?.id ?? receipt?.sale?.id;
  return { ok: typeof id === 'string' && id.length > 0, status: response.status, receipt };
}

/** Legacy ownerless private records require review; never adopt them on login. */
export function queueItemInScope(item: PendingQueueItem, ownerId: string | null, endpointPrefix?: string): boolean {
  if (endpointPrefix) return item.endpoint?.startsWith(endpointPrefix) === true;
  return !item.endpoint?.startsWith('/api/shared/') && !!ownerId && item.ownerId === ownerId;
}

export interface FinancialOperationOutcome {
  id: string;
  state: 'confirmed' | 'pending';
  failure?: 'response' | 'network' | 'storage';
  status?: number;
}

/** Independent rejected operations must not starve unrelated pending work.
 * Updates to the same sale position/shared expense retain their original order. */
export async function syncPendingOperations(
  items: PendingQueueItem[],
  send: (item: PendingQueueItem) => Promise<{ ok: boolean; status: number; receipt?: any }>,
  remove: (id: string, receipt?: any) => Promise<void>
): Promise<FinancialOperationOutcome[]> {
  const outcomes: FinancialOperationOutcome[] = [];
  const blocked = new Set<string>();
  for (const item of items) {
    const dependency = item.method === 'PUT' || item.endpoint?.endsWith('/sell') ? item.endpoint : undefined;
    if (dependency && blocked.has(dependency)) {
      outcomes.push({ id:item.id, state:'pending' });
      continue;
    }
    try {
      const response = await send(item);
      if (!response.ok) {
        outcomes.push({ id:item.id, state:'pending', failure:'response', status:response.status });
        if (dependency) blocked.add(dependency);
        continue;
      }
      try {
        await remove(item.id, response.receipt);
        outcomes.push({ id:item.id, state:'confirmed' });
      } catch {
        outcomes.push({ id:item.id, state:'confirmed', failure:'storage' });
      }
    } catch {
      outcomes.push({ id:item.id, state:'pending', failure:'network' });
      if (dependency) blocked.add(dependency);
    }
  }
  return outcomes;
}
