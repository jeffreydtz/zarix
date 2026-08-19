'use client';

import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Monitor, Moon, Sun } from 'lucide-react';

// Ciclo: sistema (sigue al dispositivo) → claro → oscuro → sistema.
const ORDER = ['system', 'light', 'dark'] as const;
type Mode = (typeof ORDER)[number];

const META: Record<Mode, { icon: typeof Sun; label: string }> = {
  system: { icon: Monitor, label: 'Automático (sistema)' },
  light: { icon: Sun, label: 'Claro' },
  dark: { icon: Moon, label: 'Oscuro' },
};

export default function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className="w-11 h-11 min-w-[44px] min-h-[44px] rounded-xl bg-secondary animate-pulse" />
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
      className="relative w-11 h-11 min-w-[44px] min-h-[44px] rounded-xl bg-secondary
                 flex items-center justify-center overflow-hidden touch-manipulation
                 hover:bg-surface-soft transition-colors"
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
          className="text-foreground"
        >
          {(() => {
            const Icon = META[current].icon;
            return <Icon className="w-5 h-5" />;
          })()}
        </motion.span>
      </AnimatePresence>
    </motion.button>
  );
}
