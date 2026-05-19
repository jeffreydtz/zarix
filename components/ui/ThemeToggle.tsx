'use client';

import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// Ciclo: sistema (sigue al dispositivo) → claro → oscuro → sistema.
const ORDER = ['system', 'light', 'dark'] as const;
type Mode = (typeof ORDER)[number];

const META: Record<Mode, { icon: string; label: string }> = {
  system: { icon: '🖥️', label: 'Automático (sistema)' },
  light: { icon: '☀️', label: 'Claro' },
  dark: { icon: '🌙', label: 'Oscuro' },
};

export default function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className="w-11 h-11 min-w-[44px] min-h-[44px] rounded-xl bg-slate-100 dark:bg-slate-800 animate-pulse" />
    );
  }

  const current: Mode = (ORDER as readonly string[]).includes(theme ?? '')
    ? (theme as Mode)
    : 'system';
  const next = ORDER[(ORDER.indexOf(current) + 1) % ORDER.length];

  return (
    <motion.button
      whileTap={{ scale: 0.9 }}
      onClick={() => setTheme(next)}
      className="relative w-11 h-11 min-w-[44px] min-h-[44px] rounded-xl bg-slate-100 dark:bg-slate-800
                 flex items-center justify-center overflow-hidden touch-manipulation
                 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
      aria-label={`Tema: ${META[current].label}. Tocar para ${META[next].label}`}
      title={`Tema: ${META[current].label}`}
    >
      <AnimatePresence mode="wait">
        <motion.span
          key={current}
          initial={{ y: 20, opacity: 0, rotate: 90 }}
          animate={{ y: 0, opacity: 1, rotate: 0 }}
          exit={{ y: -20, opacity: 0, rotate: -90 }}
          transition={{ duration: 0.2 }}
          className="text-xl"
        >
          {META[current].icon}
        </motion.span>
      </AnimatePresence>
    </motion.button>
  );
}
