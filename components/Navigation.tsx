'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { useState, useRef, useEffect } from 'react';
import ThemeToggle from '@/components/ui/ThemeToggle';

const PRIMARY_LINKS = [
  { href: '/dashboard',   label: 'Inicio',       icon: '🏠' },
  { href: '/expenses',    label: 'Movimientos',  icon: '💸' },
  { href: '/analysis',   label: 'Análisis',     icon: '📊' },
  { href: '/investments', label: 'Inversiones',  icon: '📈' },
];

const MORE_LINKS = [
  { href: '/accounts',   label: 'Cuentas',      icon: '🏦' },
  { href: '/budgets',    label: 'Presupuestos',  icon: '🎯' },
  { href: '/recurring',  label: 'Recurrentes',  icon: '🔄' },
  { href: '/categories', label: 'Categorías',   icon: '🏷️' },
  { href: '/settings',   label: 'Config',       icon: '⚙️' },
];

export default function Navigation() {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) {
        setMoreOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // Close dropdown on route change
  useEffect(() => { setMoreOpen(false); }, [pathname]);

  const isMoreActive = MORE_LINKS.some((l) => l.href === pathname);

  return (
    <motion.nav
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-lg border-b border-slate-200 dark:border-slate-800 sticky top-0 z-40"
    >
      <div className="max-w-5xl mx-auto px-4">
        <div className="flex items-center justify-between h-14">

          {/* Logo */}
          <Link href="/dashboard" className="flex items-center gap-2 shrink-0">
            <motion.div
              className="rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 shadow-sm"
              whileHover={{ rotate: [0, -10, 10, 0] }}
              transition={{ duration: 0.4 }}
            >
              <Image
                src="/Zarix%20Logo.png"
                alt="Zarix"
                width={28}
                height={28}
                className="w-7 h-7 object-cover"
                priority
              />
            </motion.div>
            <span className="font-bold text-lg bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
              Zarix
            </span>
          </Link>

          {/* Nav links */}
          <div className="flex items-center gap-1">
            {PRIMARY_LINKS.map((link) => {
              const isActive = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className="relative px-3 py-1.5 rounded-xl text-sm font-medium transition-colors"
                >
                  {isActive && (
                    <motion.div
                      layoutId="activeTab"
                      className="absolute inset-0 bg-blue-100 dark:bg-blue-900/30 rounded-xl"
                      transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                    />
                  )}
                  <span
                    className={`relative z-10 flex items-center gap-1.5 ${
                      isActive
                        ? 'text-blue-600 dark:text-blue-400'
                        : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                    }`}
                  >
                    <span className="text-sm">{link.icon}</span>
                    <span className="hidden sm:inline">{link.label}</span>
                  </span>
                </Link>
              );
            })}

            {/* More dropdown */}
            <div ref={moreRef} className="relative">
              <button
                onClick={() => setMoreOpen((o) => !o)}
                className={`relative px-3 py-1.5 rounded-xl text-sm font-medium transition-colors flex items-center gap-1 ${
                  isMoreActive || moreOpen
                    ? 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                }`}
              >
                <span className="hidden sm:inline">Más</span>
                <motion.span
                  animate={{ rotate: moreOpen ? 180 : 0 }}
                  transition={{ duration: 0.2 }}
                  className="text-xs leading-none"
                >
                  ▾
                </motion.span>
              </button>

              <AnimatePresence>
                {moreOpen && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: -4 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: -4 }}
                    transition={{ duration: 0.15 }}
                    className="absolute right-0 top-full mt-2 w-44 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xl shadow-slate-200/50 dark:shadow-black/30 overflow-hidden"
                  >
                    {MORE_LINKS.map((link) => {
                      const isActive = pathname === link.href;
                      return (
                        <Link
                          key={link.href}
                          href={link.href}
                          className={`flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${
                            isActive
                              ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 font-medium'
                              : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/50'
                          }`}
                        >
                          <span>{link.icon}</span>
                          <span>{link.label}</span>
                          {isActive && (
                            <span className="ml-auto w-1.5 h-1.5 rounded-full bg-blue-500" />
                          )}
                        </Link>
                      );
                    })}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <div className="w-px h-5 bg-slate-200 dark:bg-slate-700 mx-1" />

            <ThemeToggle />
          </div>
        </div>
      </div>
    </motion.nav>
  );
}
