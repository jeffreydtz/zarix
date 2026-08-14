'use client';

import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'zarix.privacy';
const EVENT_NAME = 'zarix:privacy-changed';

function readStored(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * Modo privado GLOBAL del dashboard (patrón Nubank/Ualá: la app se abre en
 * público). Oculta montos en plata; porcentajes y deltas siguen visibles.
 * Mismo mecanismo que use-investments-privacy (localStorage + evento) pero
 * con clave propia: el módulo de inversiones conserva su toggle independiente.
 */
export function usePrivacy(): {
  hidden: boolean;
  toggle: () => void;
  setHidden: (value: boolean) => void;
} {
  const [hidden, setHiddenState] = useState<boolean>(false);

  useEffect(() => {
    setHiddenState(readStored());
    const sync = () => setHiddenState(readStored());
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) sync();
    };
    window.addEventListener('storage', onStorage);
    window.addEventListener(EVENT_NAME, sync);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener(EVENT_NAME, sync);
    };
  }, []);

  const setHidden = useCallback((value: boolean) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, value ? '1' : '0');
    } catch {
      /* ignore quota errors */
    }
    setHiddenState(value);
    window.dispatchEvent(new Event(EVENT_NAME));
  }, []);

  const toggle = useCallback(() => {
    setHidden(!readStored());
  }, [setHidden]);

  return { hidden, toggle, setHidden };
}

export const PRIVACY_MASK = '••••';
