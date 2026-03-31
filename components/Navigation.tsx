'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion } from 'framer-motion';
import ThemeToggle from '@/components/ui/ThemeToggle';

export default function Navigation() {
  const pathname = usePathname();

  const links = [
    { href: '/dashboard', label: 'Inicio', icon: '🏠' },
    { href: '/expenses', label: 'Movimientos', icon: '💸' },
    { href: '/accounts', label: 'Cuentas', icon: '🏦' },
    { href: '/categories', label: 'Categorías', icon: '🏷️' },
    { href: '/analysis', label: 'Análisis', icon: '📊' },
    { href: '/settings', label: 'Config', icon: '⚙️' },
  ];

  const secondaryLinks = [
    { href: '/investments', label: 'Inversiones', icon: '📈' },
  ];

  return (
    <motion.nav 
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-lg border-b border-slate-200 dark:border-slate-800 sticky top-0 z-40"
    >
      <div className="max-w-7xl mx-auto px-4 safe-area-inset">
        <div className="flex items-center justify-between h-16">
          <Link href="/dashboard" className="flex items-center gap-2 group">
            <motion.span 
              className="text-2xl"
              whileHover={{ rotate: [0, -10, 10, 0] }}
              transition={{ duration: 0.5 }}
            >
              💰
            </motion.span>
            <span className="font-bold text-xl bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
              Zarix
            </span>
          </Link>

          <div className="flex items-center gap-2">
            <div className="flex gap-1 overflow-x-auto hide-scrollbar">
              {links.map((link) => {
                const isActive = pathname === link.href;
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    className="relative px-3 py-2 rounded-xl text-sm font-medium transition-colors whitespace-nowrap"
                  >
                    {isActive && (
                      <motion.div
                        layoutId="activeTab"
                        className="absolute inset-0 bg-blue-100 dark:bg-blue-900/30 rounded-xl"
                        transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                      />
                    )}
                    <span className={`relative z-10 flex items-center gap-1 ${
                      isActive
                        ? 'text-blue-600 dark:text-blue-400'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                    }`}>
                      <span className="text-base">{link.icon}</span>
                      <span className="hidden md:inline">{link.label}</span>
                    </span>
                  </Link>
                );
              })}
              
              <div className="w-px h-6 bg-slate-200 dark:bg-slate-700 mx-1 self-center" />
              
              {secondaryLinks.map((link) => {
                const isActive = pathname === link.href;
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    className="relative px-3 py-2 rounded-xl text-sm font-medium transition-colors whitespace-nowrap"
                  >
                    {isActive && (
                      <motion.div
                        layoutId="activeTabSecondary"
                        className="absolute inset-0 bg-purple-100 dark:bg-purple-900/30 rounded-xl"
                        transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                      />
                    )}
                    <span className={`relative z-10 flex items-center gap-1 ${
                      isActive
                        ? 'text-purple-600 dark:text-purple-400'
                        : 'text-slate-500 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                    }`}>
                      <span className="text-base">{link.icon}</span>
                      <span className="hidden md:inline">{link.label}</span>
                    </span>
                  </Link>
                );
              })}
            </div>
            
            <ThemeToggle />
          </div>
        </div>
      </div>
    </motion.nav>
  );
}
