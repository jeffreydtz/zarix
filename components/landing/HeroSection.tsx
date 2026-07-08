'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import HeroScenery from './HeroScenery';
import HeroDashboardPreview from './HeroDashboardPreview';

const fadeUpVariants = {
  hidden: { opacity: 0, y: 30 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] },
  },
} as const;

export default function HeroSection() {
  return (
    <section className="light relative -mt-16 overflow-hidden pt-16 text-foreground">
      <HeroScenery />

      <div className="relative mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8">
        <motion.div
          variants={fadeUpVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-80px' }}
          className="mx-auto flex max-w-3xl flex-col items-center pt-14 text-center sm:pt-20"
        >
          <p className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-card/70 px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground backdrop-blur">
            <span className="h-1.5 w-1.5 rounded-full bg-primary" />
            Nuevo · Bot de Telegram
          </p>

          <h1 className="text-balance pt-6 text-4xl font-bold leading-[1.05] tracking-tight sm:text-6xl md:text-7xl">
            Tu patrimonio real,
            <br />
            <span className="text-primary">en tiempo real.</span>
          </h1>

          <p className="max-w-xl pt-6 text-lg text-muted-foreground sm:text-xl">
            La única app de finanzas que entiende el dólar blue, el MEP, el CCL
            y el Merval. Hecha para Argentina.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-3 pt-8">
            <Link
              href="/register?plan=normal"
              className="rounded-full bg-primary px-7 py-3.5 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/30 transition hover:brightness-95"
            >
              Empezar gratis
            </Link>
            <Link
              href="/demo"
              aria-label="Probar la demo"
              className="inline-flex h-[46px] w-[46px] items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/30 transition hover:brightness-95"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
                <path
                  d="M4 12 L12 4 M6 4 h6 v6"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </Link>
          </div>

          <div className="flex flex-wrap justify-center gap-x-4 gap-y-2 pt-5 text-sm text-muted-foreground">
            <span>Sin tarjeta de crédito</span>
            <span aria-hidden>·</span>
            <span>Gratis para siempre</span>
            <span aria-hidden>·</span>
            <span>PWA instalable</span>
          </div>
        </motion.div>

        {/* dashboard peeking from the fold, Margin-style: taller than its
            crop wrapper so the bottom is cut by the next (dark) section */}
        <motion.div
          variants={fadeUpVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-80px' }}
          className="mt-12 max-h-[300px] overflow-hidden sm:mt-16 sm:max-h-[400px]"
        >
          <HeroDashboardPreview />
        </motion.div>
      </div>
    </section>
  );
}
