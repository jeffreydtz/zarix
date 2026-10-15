/**
 * Snapshots for cuenta / categoría selects when the SW has no cache hit
 * (ej. nunca se abrió el modal online) o la red falla.
 */
import { createClient } from '@/lib/supabase/client';

const KEYS = {
  accounts: 'zarix-offline-snapshot-accounts-v2',
  categories: 'zarix-offline-snapshot-categories-v2',
} as const;

const META_KEYS = {
  accounts: 'zarix-offline-snapshot-accounts-meta-v2',
  categories: 'zarix-offline-snapshot-categories-meta-v2',
} as const;

const inFlight = new Map<string, Promise<unknown[] | null>>();
let currentOwner: string | null | undefined;
let sessionEpoch = 0;
let observingAuth = false;
export const REFERENCE_OWNER_CHANGED = 'zarix-reference-owner-changed';

type SnapshotMeta = { updatedAt: number; ownerId: string };

function observeOwner(ownerId: string | null): void {
  if (currentOwner === ownerId) return;
  const initialized = currentOwner !== undefined;
  currentOwner = ownerId;
  sessionEpoch++;
  inFlight.clear();
  if (initialized && typeof window !== 'undefined') window.dispatchEvent(new Event(REFERENCE_OWNER_CHANGED));
}

/** Browser identity scopes local references; the API still verifies Auth/RLS.
 * Unknown/failed/anonymous sessions must never adopt an old private snapshot. */
export async function getOfflineReferenceOwner(): Promise<string | null> {
  if (typeof window === 'undefined') return null;
  try {
    const client = createClient();
    if (!observingAuth) {
      client.auth.onAuthStateChange((_event, session) => observeOwner(session?.user.id ?? null));
      observingAuth = true;
    }
    const before = sessionEpoch;
    const { data, error } = await client.auth.getSession();
    if (error) { observeOwner(null); return null; }
    const ownerId = data.session?.user.id ?? null;
    if (before !== sessionEpoch && currentOwner !== ownerId) return null;
    observeOwner(ownerId);
    return ownerId;
  } catch {
    observeOwner(null);
    return null;
  }
}

function ownedKey(key: string, ownerId?: string | null): string | null {
  return ownerId && ownerId === currentOwner ? `${key}:${encodeURIComponent(ownerId)}` : null;
}

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

export function getOfflineCachedAccounts<T>(ownerId?: string | null): T[] {
  const key = ownedKey(KEYS.accounts, ownerId);
  return key ? readArray<T>(key) : [];
}

export function getOfflineCachedCategories<T>(ownerId?: string | null): T[] {
  const key = ownedKey(KEYS.categories, ownerId);
  return key ? readArray<T>(key) : [];
}

/**
 * Actualiza snapshot solo si la respuesta parece confiable:
 * - Online: siempre (incluye lista vacía legítima).
 * - Offline: solo si hay filas (p. ej. cache del SW), nunca [] que borraría el último snapshot.
 */
export function maybePersistAccountsSnapshot<T>(rows: T[] | null, online: boolean, ownerId?: string | null): void {
  const key = ownedKey(KEYS.accounts, ownerId);
  const metaKey = ownedKey(META_KEYS.accounts, ownerId);
  if (rows === null || !key || !metaKey || !ownerId) return;
  if (online || rows.length > 0) {
    writeArray(key, rows);
    writeMeta(metaKey, { updatedAt: Date.now(), ownerId });
  }
}

export function maybePersistCategoriesSnapshot<T>(rows: T[] | null, online: boolean, ownerId?: string | null): void {
  const key = ownedKey(KEYS.categories, ownerId);
  const metaKey = ownedKey(META_KEYS.categories, ownerId);
  if (rows === null || !key || !metaKey || !ownerId) return;
  if (online || rows.length > 0) {
    writeArray(key, rows);
    writeMeta(metaKey, { updatedAt: Date.now(), ownerId });
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

function isFresh(meta: SnapshotMeta | null, ttlMs: number, ownerId: string): boolean {
  if (!meta || meta.ownerId !== ownerId) return false;
  return Date.now() - meta.updatedAt <= ttlMs;
}

/**
 * Evita fetches duplicados en la misma sesión y permite TTL configurable.
 */
export async function fetchReferenceList<T>(
  url: string,
  options?: { ttlMs?: number; force?: boolean; ownerId?: string }
): Promise<T[] | null> {
  const ownerId = await getOfflineReferenceOwner();
  if (!ownerId || (options?.ownerId && options.ownerId !== ownerId)) return null;
  const epoch = sessionEpoch;
  const ttlMs = options?.ttlMs ?? 2 * 60 * 1000;
  const force = Boolean(options?.force);
  const isAccounts = url.startsWith('/api/accounts');
  const cached = isAccounts ? getOfflineCachedAccounts<T>(ownerId) : getOfflineCachedCategories<T>(ownerId);
  const meta = readMeta(ownedKey(isAccounts ? META_KEYS.accounts : META_KEYS.categories, ownerId)!);

  if (!force && cached.length > 0 && isFresh(meta, ttlMs, ownerId)) {
    return cached;
  }

  const key = `${ownerId}::${epoch}::${url}::${force ? 'force' : 'normal'}`;
  const current = inFlight.get(key) as Promise<T[] | null> | undefined;
  if (current) return current;

  const request = fetchJsonArray<T>(url)
    .then(async (rows) => {
      if (await getOfflineReferenceOwner() !== ownerId || epoch !== sessionEpoch) return null;
      const online = typeof navigator !== 'undefined' && navigator.onLine;
      if (isAccounts) {
        maybePersistAccountsSnapshot(rows, online, ownerId);
      } else {
        maybePersistCategoriesSnapshot(rows, online, ownerId);
      }
      return rows;
    })
    .finally(() => {
      inFlight.delete(key);
    });

  inFlight.set(key, request as Promise<unknown[] | null>);
  return request;
}
