import type { InternalAiChatRequest } from '@/types/internal-ai-chat';
export interface PendingAiChat { key: string; ownerId: string; payload: InternalAiChatRequest }
type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
const storageKey = (ownerId: string) => `zarix:pending-ai-chat:${ownerId}`;

export function readPendingAiChat(ownerId: string, storage: StorageLike = localStorage): PendingAiChat | null {
  const raw = storage.getItem(storageKey(ownerId));
  if (!raw) return null;
  const value = JSON.parse(raw) as PendingAiChat;
  if (value?.ownerId !== ownerId || typeof value.key !== 'string' || !/^[a-zA-Z0-9:_-]{1,180}$/.test(value.key)
    || typeof value.payload?.message !== 'string' || !Array.isArray(value.payload.history)
    || value.payload.history.some(turn => !turn || !['user', 'model'].includes(turn.role) || typeof turn.text !== 'string')) {
    throw new Error('Hay una solicitud de IA pendiente que necesita revisión. No se envió otra solicitud.');
  }
  return value;
}

/** Never replace an unresolved mutation intent, even after a browser restart. */
export function persistPendingAiChat(entry: PendingAiChat, storage: StorageLike = localStorage): PendingAiChat {
  const previous = readPendingAiChat(entry.ownerId, storage);
  if (previous) {
    if (JSON.stringify(previous.payload) !== JSON.stringify(entry.payload)) {
      throw new Error('Hay una solicitud anterior sin confirmar. Reintentá primero el mensaje pendiente.');
    }
    return previous;
  }
  storage.setItem(storageKey(entry.ownerId), JSON.stringify(entry));
  return entry;
}
export function clearPendingAiChat(ownerId: string, key: string, storage: StorageLike = localStorage): void {
  const previous = readPendingAiChat(ownerId, storage);
  if (previous?.key === key) storage.removeItem(storageKey(ownerId));
}
