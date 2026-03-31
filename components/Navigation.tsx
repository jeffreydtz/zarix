'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function Navigation() {
  const pathname = usePathname();

  const links = [
    { href: '/dashboard', label: 'Inicio', icon: '🏠' },
    { href: '/expenses', label: 'Movimientos', icon: '💸' },
    { href: '/accounts', label: 'Cuentas', icon: '🏦' },
    { href: '/categories', label: 'Categorías', icon: '🏷️' },
    { href: '/investments', label: 'Inversiones', icon: '📈' },
    { href: '/analysis', label: 'Análisis', icon: '📊' },
    { href: '/settings', label: 'Config', icon: '⚙️' },
  ];

  return (
    <nav className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center gap-2">
            <span className="text-2xl">💰</span>
            <span className="font-bold text-xl">Zarix</span>
          </div>

          <div className="flex gap-1 overflow-x-auto">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                  pathname === link.href
                    ? 'bg-blue-100 text-blue-600 dark:bg-blue-900 dark:text-blue-300'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
              >
                <span className="mr-1">{link.icon}</span>
                <span className="hidden md:inline">{link.label}</span>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </nav>
  );
}
