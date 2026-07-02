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

export default function HeroSection() {
  return (
    <section className="mx-auto grid w-full max-w-6xl gap-12 px-4 pb-16 pt-14 sm:px-6 lg:px-8 lg:pt-20">
      <motion.div
        variants={fadeUpVariants}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: '-80px' }}
        className="max-w-3xl"
      >
        <h1 className="text-balance text-4xl font-bold leading-tight text-foreground sm:text-5xl md:text-6xl">
          Tu patrimonio real,
          <br />
          en tiempo real.
        </h1>
        <p className="mt-5 max-w-xl text-lg text-muted-foreground sm:text-xl">
          La unica app de finanzas que entiende el dolar blue, el MEP, el CCL y el Merval. Hecha para Argentina.
        </p>

        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/register?plan=normal"
            className="rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-[0_0_28px_rgba(34,197,94,0.3)] transition hover:brightness-110"
          >
            Empezar gratis
          </Link>
          <Link
            href="/demo"
            className="rounded-xl border border-primary/40 bg-primary/10 px-5 py-3 text-sm font-semibold text-foreground transition hover:border-primary/60 hover:bg-primary/20"
          >
            Probar la demo
          </Link>
          <Link
            href="#features"
            className="rounded-xl border border-border/90 bg-white/[0.02] px-5 py-3 text-sm font-semibold text-foreground transition hover:border-muted-foreground/40 hover:bg-white/[0.05]"
          >
            Ver como funciona
          </Link>
        </div>

        <div className="mt-6 flex flex-wrap gap-x-4 gap-y-2 text-sm text-muted-foreground">
          <span>✦ Sin tarjeta de credito</span>
          <span>✦ Gratis para siempre</span>
          <span>✦ PWA instalable</span>
        </div>
      </motion.div>
    </section>
  );
}
