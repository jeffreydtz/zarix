'use client';

import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'zarix.investments.privacy';
const EVENT_NAME = 'zarix:investments-privacy-changed';

function readStored(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * Modo privado del módulo de inversiones.
 * Oculta montos en plata (valor total, valor por posición, balance de cuentas).
 * P&L y porcentajes siguen visibles. Estado en localStorage, sincronizado entre tabs y componentes.
 */
export function useInvestmentsPrivacy(): {
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

/** Placeholder visible cuando el modo privado está activo. */
export const PRIVACY_MASK = '••••';
