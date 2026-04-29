'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { useState, useRef, useEffect } from 'react';
import ThemeToggle from '@/components/ui/ThemeToggle';
import { brandAsset } from '@/lib/brand';
import { maybeReduceTransition, motionTransition } from '@/lib/motion';

const PRIMARY_LINKS = [
  { href: '/dashboard', label: 'Inicio', icon: '🏠' },
  { href: '/expenses', label: 'Movimientos', icon: '💸' },
  { href: '/accounts', label: 'Cuentas', icon: '🏦' },
  { href: '/investments', label: 'Inversiones', icon: '📈' },
];

const MORE_LINKS = [
  { href: '/analysis', label: 'Análisis', icon: '📊' },
  { href: '/budgets', label: 'Presupuestos', icon: '🎯' },
  { href: '/recurring', label: 'Planes', icon: '🔄' },
  { href: '/categories', label: 'Categorías', icon: '🏷️' },
  { href: '/settings', label: 'Config', icon: '⚙️' },
];

export default function Navigation({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const shouldReduceMotion = useReducedMotion() ?? false;
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
      <header className="md:hidden shrink-0 z-40 bg-surface-glass/90 dark:bg-surface-glass/85 backdrop-blur-xl border-b border-border/75 pt-[env(safe-area-inset-top,0px)]">
        <div className="flex items-center justify-between h-14 px-4">
          <Link
            href="/dashboard"
            prefetch
            className="flex items-center gap-2 shrink-0 min-h-[44px] min-w-[44px] -ml-2 pl-2"
          >
            <div className="w-9 h-9 rounded-card overflow-hidden bg-surface border border-border shadow-sm flex items-center justify-center p-1">
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
            <span className="font-semibold tracking-tight text-lg text-primary">Zarix</span>
          </Link>
          <ThemeToggle />
        </div>
      </header>

      {/* ——— Desktop: navegación completa (sin layout spring: menos trabajo en cada cambio de ruta) ——— */}
      <nav className="hidden md:block bg-surface-glass/85 dark:bg-surface-glass/78 backdrop-blur-xl border-b border-border/75 sticky top-0 z-40">
        <div className="max-w-shell mx-auto px-4">
          <div className="flex items-center justify-between h-14">
            <Link href="/dashboard" prefetch className="flex items-center gap-2 shrink-0 min-h-[44px]">
              <div className="w-8 h-8 rounded-control overflow-hidden bg-surface border border-border shadow-sm flex items-center justify-center p-0.5">
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
              <span className="font-semibold tracking-tight text-lg text-primary">Zarix</span>
            </Link>

            <div className="flex items-center gap-1">
              {PRIMARY_LINKS.map((link) => {
                const isActive = pathname === link.href;
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    prefetch
                    className="relative px-3 py-2 rounded-control text-sm font-medium transition-colors min-h-[44px] flex items-center"
                  >
                    {isActive && (
                      <span className="absolute inset-0 bg-primary/12 dark:bg-primary/16 rounded-control" aria-hidden />
                    )}
                    <span
                      className={`relative z-10 flex items-center gap-1.5 ${
                        isActive
                          ? 'text-primary'
                          : 'text-muted-foreground hover:text-foreground'
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
                  className={`relative px-3 py-2 rounded-control text-sm font-medium transition-colors flex items-center gap-1 min-h-[44px] ${
                    isMoreActive || moreOpen
                      ? 'bg-surface-soft text-foreground'
                      : 'text-muted-foreground hover:text-foreground hover:bg-surface-soft/70'
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
                      initial={{ opacity: 0, scale: shouldReduceMotion ? 1 : 0.96, y: shouldReduceMotion ? 0 : -6 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: shouldReduceMotion ? 1 : 0.96, y: shouldReduceMotion ? 0 : -4 }}
                      transition={maybeReduceTransition(shouldReduceMotion, {
                        ...motionTransition.smooth,
                        duration: 0.18,
                      })}
                      className="absolute right-0 top-full mt-2 w-52 bg-surface-elevated rounded-card border border-border shadow-xl overflow-hidden"
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
                                ? 'bg-primary/10 text-primary font-medium'
                                : 'text-foreground/85 hover:bg-surface-soft/70'
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

              <div className="w-px h-5 bg-border mx-1" />
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
        className="md:hidden shrink-0 w-full z-40 bg-surface-glass/95 dark:bg-surface-glass/90 backdrop-blur-xl border-t border-border/80 pb-[env(safe-area-inset-bottom,0px)]"
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
                    ? 'text-primary bg-primary/10'
                    : 'text-muted-foreground active:bg-surface-soft'
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
                ? 'text-primary bg-primary/10'
                : 'text-muted-foreground active:bg-surface-soft'
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
              transition={maybeReduceTransition(shouldReduceMotion, motionTransition.modal)}
              className="md:hidden fixed left-0 right-0 bottom-0 z-50 max-h-[min(70vh,520px)] rounded-t-3xl bg-surface-elevated border border-border shadow-2xl overflow-hidden flex flex-col pb-[env(safe-area-inset-bottom,0px)]"
            >
              <div className="flex justify-center pt-3 pb-2">
                <div className="w-10 h-1 rounded-full bg-border" />
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
                            ? 'bg-primary/10 text-primary font-semibold'
                            : 'text-foreground active:bg-surface-soft'
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
