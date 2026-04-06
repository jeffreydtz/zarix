/**
 * Snapshots for cuenta / categoría selects when the SW has no cache hit
 * (ej. nunca se abrió el modal online) o la red falla.
 */

const KEYS = {
  accounts: 'zarix-offline-snapshot-accounts-v1',
  categories: 'zarix-offline-snapshot-categories-v1',
} as const;

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
  if (online || rows.length > 0) writeArray(KEYS.accounts, rows);
}

export function maybePersistCategoriesSnapshot<T>(rows: T[] | null, online: boolean): void {
  if (rows === null) return;
  if (online || rows.length > 0) writeArray(KEYS.categories, rows);
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
