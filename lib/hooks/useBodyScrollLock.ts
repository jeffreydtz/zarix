'use client';

import { useEffect } from 'react';

/**
 * Congela el scroll del <body> mientras un overlay/modal está abierto.
 * Evita el rubber-band del fondo detrás del modal en PWA iOS.
 * Pasá `locked=false` (o el estado de apertura) en componentes que están
 * siempre montados y togglean un modal interno.
 */
export function useBodyScrollLock(locked: boolean = true) {
  useEffect(() => {
    if (!locked) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [locked]);
}
