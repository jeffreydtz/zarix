'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import DashboardMockup from '@/components/landing/DashboardMockup';

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
    <section className="mx-auto grid w-full max-w-6xl gap-12 px-4 pb-16 pt-14 sm:px-6 lg:grid-cols-2 lg:items-center lg:px-8 lg:pt-20">
      <motion.div
        variants={fadeUpVariants}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: '-80px' }}
      >
        <h1 className="text-balance text-4xl font-bold leading-tight text-[#F8F9FA] sm:text-5xl md:text-6xl">
          Tu patrimonio real,
          <br />
          en tiempo real.
        </h1>
        <p className="mt-5 max-w-xl text-lg text-[#8B949E] sm:text-xl">
          La unica app de finanzas que entiende el dolar blue, el MEP, el CCL y el Merval. Hecha para Argentina.
        </p>

        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/register?plan=normal"
            className="rounded-xl bg-blue-500 px-5 py-3 text-sm font-semibold text-white shadow-[0_0_28px_rgba(59,130,246,0.3)] transition hover:bg-blue-400"
          >
            Empezar gratis
          </Link>
          <Link
            href="#features"
            className="rounded-xl border border-white/10 bg-white/[0.02] px-5 py-3 text-sm font-semibold text-[#F8F9FA] transition hover:border-white/20 hover:bg-white/[0.05]"
          >
            Ver como funciona
          </Link>
        </div>

        <div className="mt-6 flex flex-wrap gap-x-4 gap-y-2 text-sm text-[#8B949E]">
          <span>✦ Sin tarjeta de credito</span>
          <span>✦ Gratis para siempre</span>
          <span>✦ PWA instalable</span>
        </div>
      </motion.div>

      <motion.div
        variants={fadeUpVariants}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: '-80px' }}
        transition={{ delay: 0.1 }}
        className="relative flex min-h-[420px] items-center justify-center"
      >
        <DashboardMockup />
      </motion.div>
    </section>
  );
}
