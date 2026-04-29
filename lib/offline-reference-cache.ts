/**
 * Snapshots for cuenta / categoría selects when the SW has no cache hit
 * (ej. nunca se abrió el modal online) o la red falla.
 */

const KEYS = {
  accounts: 'zarix-offline-snapshot-accounts-v1',
  categories: 'zarix-offline-snapshot-categories-v1',
} as const;

const META_KEYS = {
  accounts: 'zarix-offline-snapshot-accounts-meta-v1',
  categories: 'zarix-offline-snapshot-categories-meta-v1',
} as const;

const inFlight = new Map<string, Promise<unknown[] | null>>();

type SnapshotMeta = { updatedAt: number };

function readArray<T>(key: string): T[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function writeArray<T>(key: string, data: T[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch {
    /* quota / private mode */
  }
}

function readMeta(key: string): SnapshotMeta | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SnapshotMeta;
    if (!parsed || typeof parsed.updatedAt !== 'number') return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeMeta(key: string, meta: SnapshotMeta): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(key, JSON.stringify(meta));
  } catch {
    /* ignore */
  }
}

export function getOfflineCachedAccounts<T>(): T[] {
  return readArray<T>(KEYS.accounts);
}

export function getOfflineCachedCategories<T>(): T[] {
  return readArray<T>(KEYS.categories);
}

/**
 * Actualiza snapshot solo si la respuesta parece confiable:
 * - Online: siempre (incluye lista vacía legítima).
 * - Offline: solo si hay filas (p. ej. cache del SW), nunca [] que borraría el último snapshot.
 */
export function maybePersistAccountsSnapshot<T>(rows: T[] | null, online: boolean): void {
  if (rows === null) return;
  if (online || rows.length > 0) {
    writeArray(KEYS.accounts, rows);
    writeMeta(META_KEYS.accounts, { updatedAt: Date.now() });
  }
}

export function maybePersistCategoriesSnapshot<T>(rows: T[] | null, online: boolean): void {
  if (rows === null) return;
  if (online || rows.length > 0) {
    writeArray(KEYS.categories, rows);
    writeMeta(META_KEYS.categories, { updatedAt: Date.now() });
  }
}

/**
 * Preferir API cuando es fiable; si estamos offline y la API devolvió [] o falló, usar snapshot.
 */
export function pickReferenceList<T>(fromApi: T[] | null, cached: T[]): T[] {
  const online = typeof navigator !== 'undefined' && navigator.onLine;
  if (fromApi !== null && (fromApi.length > 0 || online)) {
    return fromApi;
  }
  if (cached.length > 0) return cached;
  return fromApi ?? [];
}

/** GET que devuelve JSON array o null (error / no-OK / no-array). */
export async function fetchJsonArray<T>(url: string): Promise<T[] | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data: unknown = await res.json();
    return Array.isArray(data) ? (data as T[]) : null;
  } catch {
    return null;
  }
}

function isFresh(meta: SnapshotMeta | null, ttlMs: number): boolean {
  if (!meta) return false;
  return Date.now() - meta.updatedAt <= ttlMs;
}

/**
 * Evita fetches duplicados en la misma sesión y permite TTL configurable.
 */
export async function fetchReferenceList<T>(
  url: string,
  options?: { ttlMs?: number; force?: boolean }
): Promise<T[] | null> {
  const ttlMs = options?.ttlMs ?? 2 * 60 * 1000;
  const force = Boolean(options?.force);
  const isAccounts = url.startsWith('/api/accounts');
  const cached = isAccounts ? getOfflineCachedAccounts<T>() : getOfflineCachedCategories<T>();
  const meta = readMeta(isAccounts ? META_KEYS.accounts : META_KEYS.categories);

  if (!force && cached.length > 0 && isFresh(meta, ttlMs)) {
    return cached;
  }

  const key = `${url}::${force ? 'force' : 'normal'}`;
  const current = inFlight.get(key) as Promise<T[] | null> | undefined;
  if (current) return current;

  const request = fetchJsonArray<T>(url)
    .then((rows) => {
      const online = typeof navigator !== 'undefined' && navigator.onLine;
      if (isAccounts) {
        maybePersistAccountsSnapshot(rows, online);
      } else {
        maybePersistCategoriesSnapshot(rows, online);
      }
      return rows;
    })
    .finally(() => {
      inFlight.delete(key);
    });

  inFlight.set(key, request as Promise<unknown[] | null>);
  return request;
}
