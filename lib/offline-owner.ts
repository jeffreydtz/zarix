const OWNER_KEY = 'zarix-offline-owner-v1';

/** Namespace only, never a server authorization credential. */
export function setOfflineOwner(userId: string | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (userId) localStorage.setItem(OWNER_KEY, userId);
    else localStorage.removeItem(OWNER_KEY);
  } catch { /* private mode */ }
}

export function getOfflineOwner(): string | null {
  if (typeof window === 'undefined') return null;
  try { return localStorage.getItem(OWNER_KEY); } catch { return null; }
}
