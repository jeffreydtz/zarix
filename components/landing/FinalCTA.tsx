'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';

const fadeUpVariants = {
  hidden: { opacity: 0, y: 30 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] },
  },
} as const;

export default function FinalCTA() {
  return (
    <section className="px-4 py-16 sm:px-6 lg:px-8">
      <motion.div
        variants={fadeUpVariants}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: '-80px' }}
        className="relative mx-auto max-w-5xl rounded-3xl border border-border/70 bg-card px-6 py-14 text-center shadow-[0_0_90px_rgba(34,197,94,0.15)]"
      >
        <div className="pointer-events-none absolute left-1/2 top-1/2 h-52 w-52 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/15 blur-3xl" />
        <h2 className="relative text-balance text-3xl font-semibold text-foreground sm:text-5xl">
          Cuanto vale tu patrimonio hoy?
        </h2>
        <p className="relative mx-auto mt-4 max-w-2xl text-muted-foreground">
          Descubrilo en 30 segundos. Sin configuracion. Sin letra chica.
        </p>
        <Link
          href="/register"
          className="relative mt-8 inline-flex rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-[0_0_30px_rgba(34,197,94,0.35)] transition hover:brightness-110"
        >
          Empezar gratis ahora
        </Link>
        <p className="relative mt-4 text-sm text-muted-foreground">
          Ya disponible como PWA · Instalable en tu celular · Sin app store
        </p>
      </motion.div>
    </section>
  );
}
