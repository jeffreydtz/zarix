'use client';

/**
 * Pantalla de carga de marca. Se muestra al iniciar la app (web + móvil/PWA)
 * mientras el dashboard resuelve datos. El rayo "Z" se dibuja solo (efecto de
 * carga de energía) y rotan frases para entretener mientras se espera.
 * Respeta prefers-reduced-motion.
 */

import { useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';

const FRASES = [
  'Cotizando el dólar blue…',
  'Sincronizando tus cuentas…',
  'Sumando tu patrimonio…',
  'Calculando MEP y CCL…',
  'Mirando el Merval…',
  'Ordenando tus billetes…',
];

export default function BrandLoader() {
  const reduce = useReducedMotion();
  const [frase, setFrase] = useState(0);

  useEffect(() => {
    if (reduce) return;
    const id = setInterval(() => {
      setFrase((i) => (i + 1) % FRASES.length);
    }, 1700);
    return () => clearInterval(id);
  }, [reduce]);

  const drawTransition = reduce
    ? { duration: 0.01 }
    : {
        duration: 1.5,
        ease: [0.22, 1, 0.36, 1] as const,
        repeat: Infinity,
        repeatType: 'loop' as const,
        repeatDelay: 0.5,
      };

  return (
    <div
      className="fixed inset-0 z-[60] flex flex-col items-center justify-center gap-7 bg-background px-6"
      role="status"
      aria-busy="true"
      aria-label="Cargando Zarix"
    >
      {/* Halo suave detrás del logo */}
      <div className="relative flex items-center justify-center">
        <motion.div
          aria-hidden
          className="absolute h-44 w-44 rounded-full bg-primary/15 blur-2xl"
          animate={reduce ? undefined : { scale: [1, 1.15, 1], opacity: [0.35, 0.6, 0.35] }}
          transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
        />

        <motion.svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 400 400"
          className="relative h-28 w-28 text-primary drop-shadow-[0_0_18px_rgb(var(--primary)/0.45)]"
          initial={reduce ? false : { scale: 0.92, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
        >
          {/* Rayo Z que se dibuja solo */}
          <motion.path
            d="M 48,62 L 285,62 L 205,175 L 265,175 L 48,315 L 268,315"
            fill="none"
            stroke="currentColor"
            strokeWidth={30}
            strokeLinecap="butt"
            strokeLinejoin="miter"
            initial={{ pathLength: reduce ? 1 : 0 }}
            animate={{ pathLength: 1 }}
            transition={drawTransition}
          />
          {/* Moneda */}
          <motion.circle
            cx={316}
            cy={305}
            r={44}
            fill="none"
            stroke="currentColor"
            strokeWidth={11}
            initial={reduce ? false : { scale: 0, opacity: 0 }}
            animate={
              reduce
                ? { scale: 1, opacity: 1 }
                : { scale: [0, 1.12, 1], opacity: 1 }
            }
            transition={{ duration: 0.6, delay: 0.5, ease: 'backOut' }}
            style={{ transformOrigin: '316px 305px' }}
          />
          <motion.text
            x={316}
            y={321}
            textAnchor="middle"
            fill="currentColor"
            fontSize={40}
            fontWeight="bold"
            fontFamily="Arial Black, Arial, sans-serif"
            initial={reduce ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3, delay: 0.85 }}
          >
            $
          </motion.text>
        </motion.svg>
      </div>

      {/* Wordmark */}
      <motion.span
        className="text-2xl font-semibold tracking-tight text-foreground"
        initial={reduce ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.3 }}
      >
        Zarix
      </motion.span>

      {/* Frases rotativas */}
      <div className="h-5 overflow-hidden">
        <AnimatePresence mode="wait">
          <motion.p
            key={frase}
            className="text-sm text-foreground/55"
            initial={reduce ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? undefined : { opacity: 0, y: -10 }}
            transition={{ duration: 0.3 }}
          >
            {FRASES[frase]}
          </motion.p>
        </AnimatePresence>
      </div>
    </div>
  );
}
