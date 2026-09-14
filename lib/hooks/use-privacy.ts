'use client';

import { useSyncExternalStore } from 'react';

const STORAGE_KEY = 'zarix.privacy';
let memoryHidden: boolean | undefined;
const listeners = new Set<() => void>();

function readStored(): boolean {
  if (typeof window === 'undefined') return true;
  if (memoryHidden !== undefined) return memoryHidden;
  try {
    memoryHidden = window.localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    memoryHidden = false;
  }
  return memoryHidden;
}

function notify() {
  listeners.forEach((listener) => listener());
}

function onStorage(event: StorageEvent) {
  if (event.key === STORAGE_KEY || event.key === null) {
    memoryHidden = event.newValue === '1';
    notify();
  }
}

function subscribe(listener: () => void) {
  if (listeners.size === 0) window.addEventListener('storage', onStorage);
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) window.removeEventListener('storage', onStorage);
  };
}

function setHidden(value: boolean) {
  memoryHidden = value;
  try {
    window.localStorage.setItem(STORAGE_KEY, value ? '1' : '0');
  } catch {
    // La preferencia sigue funcionando en memoria con almacenamiento bloqueado.
  }
  notify();
}

function toggle() {
  setHidden(!readStored());
}

/** Oculta los montos durante SSR/hidratación hasta conocer la preferencia local. */
export function usePrivacy() {
  const hidden = useSyncExternalStore(subscribe, readStored, () => true);
  return { hidden, toggle, setHidden };
}

export const PRIVACY_MASK = '••••';
