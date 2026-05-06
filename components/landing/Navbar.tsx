'use client';

import Link from 'next/link';
import { Menu, X } from 'lucide-react';
import { motion, useScroll, useTransform } from 'framer-motion';
import { useState } from 'react';

const navLinks = [
  { label: 'Caracteristicas', href: '#features' },
  { label: 'Precios', href: '#pricing' },
  { label: 'Iniciar sesion', href: '/login' },
];

export default function Navbar() {
  const [open, setOpen] = useState(false);
  const { scrollY } = useScroll();
  const navBorder = useTransform(scrollY, [0, 50], ['rgba(255,255,255,0)', 'rgba(255,255,255,0.06)']);
  const navBg = useTransform(scrollY, [0, 80], ['rgba(6,7,10,0.4)', 'rgba(6,7,10,0.88)']);

  return (
    <motion.header
      className="sticky top-0 z-50 border-b backdrop-blur-xl"
      style={{ borderColor: navBorder, backgroundColor: navBg }}
    >
      <nav className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link href="/" className="text-xl font-bold tracking-tight text-[#F8F9FA]">
          Zarix
        </Link>

        <div className="hidden items-center gap-8 md:flex">
          {navLinks.map((link) => (
            <Link
              key={link.label}
              href={link.href}
              className="text-sm font-medium text-[#8B949E] transition-colors hover:text-[#F8F9FA]"
            >
              {link.label}
            </Link>
          ))}
          <Link
            href="/register"
            className="rounded-xl bg-blue-500 px-4 py-2 text-sm font-semibold text-white shadow-[0_0_30px_rgba(59,130,246,0.25)] transition hover:bg-blue-400"
          >
            Comenzar gratis
          </Link>
        </div>

        <button
          type="button"
          aria-label={open ? 'Cerrar menu' : 'Abrir menu'}
          className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 text-[#F8F9FA] md:hidden"
          onClick={() => setOpen((prev) => !prev)}
        >
          {open ? <X size={18} /> : <Menu size={18} />}
        </button>
      </nav>

      {open ? (
        <div className="border-t border-white/10 bg-[#06070A]/95 px-4 py-4 md:hidden">
          <div className="mx-auto flex max-w-6xl flex-col gap-3">
            {navLinks.map((link) => (
              <Link
                key={link.label}
                href={link.href}
                className="rounded-lg px-2 py-2 text-sm text-[#8B949E] transition hover:bg-white/5 hover:text-[#F8F9FA]"
                onClick={() => setOpen(false)}
              >
                {link.label}
              </Link>
            ))}
            <Link
              href="/register"
              className="mt-2 inline-flex items-center justify-center rounded-xl bg-blue-500 px-4 py-2.5 text-sm font-semibold text-white"
              onClick={() => setOpen(false)}
            >
              Comenzar gratis
            </Link>
          </div>
        </div>
      ) : null}
    </motion.header>
  );
}
