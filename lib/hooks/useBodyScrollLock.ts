'use client';

import { useEffect } from 'react';

/**
 * Congela el scroll del <body> mientras un overlay/modal está abierto.
 * Evita el rubber-band del fondo detrás del modal en PWA iOS.
 * Pasá `locked=false` (o el estado de apertura) en componentes que están
 * siempre montados y togglean un modal interno.
 *
 * Usa un contador global: snapshotea el overflow original solo al primer
 * lock y lo restaura solo cuando se libera el último. Así dos overlays
 * anidados (p.ej. panel + modal) no se pisan el valor previo y el body
 * no queda trabado en `overflow: hidden`.
 */
let lockCount = 0;
let previousOverflow = '';

export function useBodyScrollLock(locked: boolean = true) {
  useEffect(() => {
    if (!locked) return;
    if (lockCount === 0) {
      previousOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
    }
    lockCount += 1;
    return () => {
      lockCount -= 1;
      if (lockCount === 0) {
        document.body.style.overflow = previousOverflow;
      }
    };
  }, [locked]);
}
