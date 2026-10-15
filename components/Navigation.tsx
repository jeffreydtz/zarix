'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { useState, useRef, useEffect } from 'react';
import ThemeToggle from '@/components/ui/ThemeToggle';
import { brandAsset } from '@/lib/brand';
import { maybeReduceTransition, motionTransition } from '@/lib/motion';
import { useBodyScrollLock } from '@/lib/hooks/useBodyScrollLock';
import { useAddTransaction } from '@/components/add-transaction/AddTransactionProvider';
import { accountIdFromPathname } from '@/lib/account-route';
import type { LucideIcon } from 'lucide-react';
import {
  Home,
  ArrowLeftRight,
  Landmark,
  LineChart,
  PieChart,
  Target,
  Users,
  Repeat,
  Tags,
  Settings,
  Plus,
  ChevronDown,
} from 'lucide-react';

const PRIMARY_LINKS: Array<{ href: string; label: string; icon: LucideIcon }> = [
  { href: '/dashboard', label: 'Inicio', icon: Home },
  { href: '/expenses', label: 'Movimientos', icon: ArrowLeftRight },
  { href: '/accounts', label: 'Cuentas', icon: Landmark },
  { href: '/investments', label: 'Inversiones', icon: LineChart },
];

const MOBILE_TABS: Array<{ href: string; label: string; icon: LucideIcon }> = [
  { href: '/dashboard', label: 'Inicio', icon: Home },
  { href: '/expenses', label: 'Gastos', icon: ArrowLeftRight },
  { href: '/accounts', label: 'Cuentas', icon: Landmark },
];

const MORE_LINKS: Array<{ href: string; label: string; icon: LucideIcon }> = [
  { href: '/investments', label: 'Inversiones', icon: LineChart },
  { href: '/analysis', label: 'Análisis', icon: PieChart },
  { href: '/budgets', label: 'Presupuestos', icon: Target },
  { href: '/shared', label: 'Compartidos', icon: Users },
  { href: '/recurring', label: 'Planes', icon: Repeat },
  { href: '/categories', label: 'Categorías', icon: Tags },
  { href: '/settings', label: 'Config', icon: Settings },
];

export default function Navigation({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { open: openAdd } = useAddTransaction();
  const accountIdForNew = accountIdFromPathname(pathname);
  const openNewMovement = () => openAdd(accountIdForNew ? { accountId: accountIdForNew } : undefined);
  const shouldReduceMotion = useReducedMotion() ?? false;
  const [moreOpen, setMoreOpen] = useState(false);
  const [moreSheetOpen, setMoreSheetOpen] = useState(false);
  useBodyScrollLock(moreSheetOpen);
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

  const isMoreActive = MORE_LINKS.some(
    (l) => l.href === pathname && !PRIMARY_LINKS.some((p) => p.href === l.href)
  );

  return (
    <>
      {/* ——— Mobile: barra superior compacta ——— */}
      <header className="md:hidden shrink-0 z-40 bg-surface-glass/95 dark:bg-surface-glass/95 border-b border-border/75 pt-[env(safe-area-inset-top,0px)]">
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

            <div className="flex items-center gap-1" data-tour="nav">
              {PRIMARY_LINKS.map((link) => {
                const isActive = pathname === link.href;
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    prefetch
                    className="relative px-2 lg:px-3 py-2 rounded-control text-sm font-medium transition-colors min-h-[44px] flex items-center"
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
                      <link.icon className="w-4 h-4" aria-hidden />
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
                  <ChevronDown
                    className={`w-3.5 h-3.5 transition-transform duration-200 ease-out ${
                      moreOpen ? 'rotate-180' : ''
                    }`}
                    aria-hidden
                  />
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
                            <link.icon className="w-4 h-4" aria-hidden />
                            <span>{link.label}</span>
                          </Link>
                        );
                      })}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <button
                type="button"
                data-tour="add"
                onClick={openNewMovement}
                className="ml-1 inline-flex items-center gap-1.5 rounded-control bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground min-h-[44px] hover:brightness-95"
              >
                <Plus className="w-4 h-4" aria-hidden />
                Nuevo
              </button>
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
        data-tour="nav"
        className="md:hidden shrink-0 w-full z-40 overflow-visible bg-surface-glass/95 dark:bg-surface-glass/95 border-t border-border/80 pb-[env(safe-area-inset-bottom,0px)]"
        aria-label="Navegación principal"
      >
        <div className="flex items-stretch justify-around h-14 max-w-lg mx-auto px-1">
          {MOBILE_TABS.map((link) => {
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
                <link.icon className="w-5 h-5" aria-hidden />
                <span className="text-[10px] font-medium truncate max-w-full px-0.5">
                  {link.label}
                </span>
              </Link>
            );
          })}
          <button
            type="button"
            data-tour="add"
            onClick={openNewMovement}
            className="-mt-3 flex flex-1 flex-col items-center justify-center min-h-[48px]"
            aria-label="Nuevo movimiento"
          >
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/30">
              <Plus className="w-6 h-6" strokeWidth={2.5} />
            </span>
          </button>
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
            <ChevronDown className="w-5 h-5" aria-hidden />
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
                        <link.icon className="w-5 h-5" aria-hidden />
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
