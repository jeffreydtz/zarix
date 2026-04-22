'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { useState, useRef, useEffect } from 'react';
import ThemeToggle from '@/components/ui/ThemeToggle';
import { brandAsset } from '@/lib/brand';

const PRIMARY_LINKS = [
  { href: '/dashboard', label: 'Inicio', icon: '🏠' },
  { href: '/expenses', label: 'Movimientos', icon: '💸' },
  { href: '/accounts', label: 'Cuentas', icon: '🏦' },
  { href: '/investments', label: 'Inversiones', icon: '📈' },
];

const MORE_LINKS = [
  { href: '/analysis', label: 'Análisis', icon: '📊' },
  { href: '/budgets', label: 'Presupuestos', icon: '🎯' },
  { href: '/recurring', label: 'Recurrentes', icon: '🔄' },
  { href: '/categories', label: 'Categorías', icon: '🏷️' },
  { href: '/settings', label: 'Config', icon: '⚙️' },
];

export default function Navigation({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const [moreSheetOpen, setMoreSheetOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent | TouchEvent) {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) {
        setMoreOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('touchstart', handleClick, { passive: true });
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('touchstart', handleClick);
    };
  }, []);

  useEffect(() => {
    setMoreOpen(false);
    setMoreSheetOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!moreSheetOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMoreSheetOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [moreSheetOpen]);

  const isMoreActive = MORE_LINKS.some((l) => l.href === pathname);

  return (
    <>
      {/* ——— Mobile: barra superior compacta ——— */}
      <header className="md:hidden shrink-0 z-40 bg-white/90 dark:bg-[#06070A]/90 backdrop-blur-lg border-b border-slate-200 dark:border-[#232733] pt-[env(safe-area-inset-top,0px)]">
        <div className="flex items-center justify-between h-14 px-4">
          <Link
            href="/dashboard"
            prefetch
            className="flex items-center gap-2 shrink-0 min-h-[44px] min-w-[44px] -ml-2 pl-2"
          >
            <div className="w-9 h-9 rounded-xl overflow-hidden bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm flex items-center justify-center p-1">
              <Image
                src={brandAsset.logoSvg}
                alt=""
                width={28}
                height={28}
                className="w-7 h-7 object-contain"
                priority
                unoptimized
              />
            </div>
            <span className="font-bold text-lg text-emerald-600 dark:text-emerald-400">Zarix</span>
          </Link>
          <ThemeToggle />
        </div>
      </header>

      {/* ——— Desktop: navegación completa (sin layout spring: menos trabajo en cada cambio de ruta) ——— */}
      <nav className="hidden md:block bg-white/80 dark:bg-[#06070A]/80 backdrop-blur-lg border-b border-slate-200 dark:border-[#232733] sticky top-0 z-40">
        <div className="max-w-5xl mx-auto px-4">
          <div className="flex items-center justify-between h-14">
            <Link href="/dashboard" prefetch className="flex items-center gap-2 shrink-0 min-h-[44px]">
              <div className="w-8 h-8 rounded-xl overflow-hidden bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm flex items-center justify-center p-0.5">
                <Image
                  src={brandAsset.logoSvg}
                  alt=""
                  width={24}
                  height={24}
                  className="w-6 h-6 object-contain"
                  priority
                  unoptimized
                />
              </div>
              <span className="font-bold text-lg text-emerald-600 dark:text-emerald-400">Zarix</span>
            </Link>

            <div className="flex items-center gap-1">
              {PRIMARY_LINKS.map((link) => {
                const isActive = pathname === link.href;
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    prefetch
                    className="relative px-3 py-2 rounded-xl text-sm font-medium transition-colors min-h-[44px] flex items-center"
                  >
                    {isActive && (
                      <span className="absolute inset-0 bg-emerald-100 dark:bg-emerald-500/15 rounded-xl" aria-hidden />
                    )}
                    <span
                      className={`relative z-10 flex items-center gap-1.5 ${
                        isActive
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                      }`}
                    >
                      <span>{link.icon}</span>
                      <span>{link.label}</span>
                    </span>
                  </Link>
                );
              })}

              <div ref={moreRef} className="relative">
                <button
                  type="button"
                  onClick={() => setMoreOpen((o) => !o)}
                  className={`relative px-3 py-2 rounded-xl text-sm font-medium transition-colors flex items-center gap-1 min-h-[44px] ${
                    isMoreActive || moreOpen
                      ? 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200'
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                  }`}
                >
                  <span>Más</span>
                  <span
                    className={`inline-block text-xs leading-none transition-transform duration-200 ease-out ${
                      moreOpen ? 'rotate-180' : ''
                    }`}
                  >
                    ▾
                  </span>
                </button>

                <AnimatePresence>
                  {moreOpen && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.95, y: -4 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95, y: -4 }}
                      transition={{ duration: 0.15 }}
                      className="absolute right-0 top-full mt-2 w-48 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xl overflow-hidden"
                    >
                      {MORE_LINKS.map((link) => {
                        const isActive = pathname === link.href;
                        return (
                          <Link
                            key={link.href}
                            href={link.href}
                            prefetch
                            className={`flex items-center gap-3 px-4 py-3 text-sm min-h-[44px] transition-colors ${
                              isActive
                                ? 'bg-emerald-50 dark:bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-medium'
                                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/50'
                            }`}
                          >
                            <span>{link.icon}</span>
                            <span>{link.label}</span>
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
      </nav>

      <div className="flex-1 min-h-0 w-full min-w-0 overflow-y-auto overscroll-y-contain pb-mobile-nav md:flex-none md:overflow-visible md:pb-0 md:min-h-0">
        {children}
      </div>

      {/* ——— Mobile: barra inferior (thumb zone); en flujo flex para que no “flote” al scrollear (iOS/PWA) ——— */}
      <nav
        className="md:hidden shrink-0 w-full z-40 bg-white/95 dark:bg-[#06070A]/95 backdrop-blur-md border-t border-slate-200 dark:border-[#232733] pb-[env(safe-area-inset-bottom,0px)]"
        aria-label="Navegación principal"
      >
        <div className="flex items-stretch justify-around h-14 max-w-lg mx-auto px-1">
          {PRIMARY_LINKS.map((link) => {
            const isActive = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                prefetch
                className={`flex flex-1 flex-col items-center justify-center gap-0.5 min-w-0 min-h-[48px] rounded-xl transition-colors ${
                  isActive
                    ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-50/80 dark:bg-emerald-500/15'
                    : 'text-slate-500 dark:text-slate-400 active:bg-slate-100 dark:active:bg-slate-800'
                }`}
              >
                <span className="text-lg leading-none" aria-hidden>
                  {link.icon}
                </span>
                <span className="text-[10px] font-medium truncate max-w-full px-0.5">
                  {link.label === 'Movimientos' ? 'Movs' : link.label}
                </span>
              </Link>
            );
          })}
          <button
            type="button"
            onClick={() => setMoreSheetOpen(true)}
            className={`flex flex-1 flex-col items-center justify-center gap-0.5 min-h-[48px] rounded-xl transition-colors ${
              isMoreActive || moreSheetOpen
                ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-50/80 dark:bg-emerald-500/15'
                : 'text-slate-500 dark:text-slate-400 active:bg-slate-100 dark:active:bg-slate-800'
            }`}
            aria-expanded={moreSheetOpen}
            aria-haspopup="dialog"
            aria-label="Más opciones"
          >
            <span className="text-lg leading-none" aria-hidden>
              ⋯
            </span>
            <span className="text-[10px] font-medium">Más</span>
          </button>
        </div>
      </nav>

      {/* Sheet “Más” en móvil */}
      <AnimatePresence>
        {moreSheetOpen && (
          <>
            <motion.button
              type="button"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="md:hidden fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px]"
              aria-label="Cerrar menú"
              onClick={() => setMoreSheetOpen(false)}
            />
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label="Más secciones"
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 320 }}
              className="md:hidden fixed left-0 right-0 bottom-0 z-50 max-h-[min(70vh,520px)] rounded-t-3xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-2xl overflow-hidden flex flex-col pb-[env(safe-area-inset-bottom,0px)]"
            >
              <div className="flex justify-center pt-3 pb-2">
                <div className="w-10 h-1 rounded-full bg-slate-300 dark:bg-slate-600" />
              </div>
              <ul className="overflow-y-auto overscroll-contain px-2 pb-4 space-y-0.5">
                {MORE_LINKS.map((link) => {
                  const isActive = pathname === link.href;
                  return (
                    <li key={link.href}>
                      <Link
                        href={link.href}
                        prefetch
                        onClick={() => setMoreSheetOpen(false)}
                        className={`flex items-center gap-3 px-4 py-3.5 rounded-xl text-base min-h-[48px] ${
                          isActive
                            ? 'bg-emerald-50 dark:bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-semibold'
                            : 'text-slate-700 dark:text-slate-200 active:bg-slate-100 dark:active:bg-slate-700/50'
                        }`}
                      >
                        <span className="text-xl">{link.icon}</span>
                        <span>{link.label}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
