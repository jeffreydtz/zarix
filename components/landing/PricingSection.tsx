'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { Check } from 'lucide-react';

const fadeUpVariants = {
  hidden: { opacity: 0, y: 30 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] },
  },
} as const;

const freeFeatures = [
  'Dashboard completo',
  'Movimientos ilimitados',
  '2 cuentas conectadas',
  'Cotizaciones dolar blue / MEP / CCL',
  'Presupuestos basicos',
  'Analisis mensual',
];

const premiumFeatures = [
  'Todo lo del plan Free',
  'Bot de Telegram personal',
  'OCR de tickets por foto (IA)',
  'Portafolio de inversiones (Merval + USA)',
  'Cuentas ilimitadas',
  'Analitica avanzada y proyecciones',
  'Exportacion de datos (CSV)',
  'Alertas inteligentes',
];

export default function PricingSection() {
  return (
    <section id="pricing" className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6 lg:px-8">
      <motion.div
        variants={fadeUpVariants}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: '-80px' }}
        className="mx-auto max-w-3xl text-center"
      >
        <h2 className="text-3xl font-semibold text-[#F8F9FA] sm:text-5xl">Empeza gratis. Escala cuando quieras.</h2>
      </motion.div>

      <div className="mx-auto mt-10 grid max-w-4xl gap-4 lg:grid-cols-2">
        <article className="rounded-2xl border border-white/[0.08] bg-[#0F1117] p-6">
          <span className="inline-flex rounded-full border border-white/[0.12] px-3 py-1 text-xs font-semibold text-[#8B949E]">
            Gratis
          </span>
          <h3 className="mt-4 text-xl font-semibold text-[#F8F9FA]">Plan Free</h3>
          <p className="mt-1 text-[#8B949E]">Gratis para siempre</p>
          <ul className="mt-5 space-y-2">
            {freeFeatures.map((feature) => (
              <li key={feature} className="flex items-center gap-2 text-sm text-[#F8F9FA]">
                <Check size={16} className="text-[#10B981]" />
                {feature}
              </li>
            ))}
          </ul>
          <Link
            href="/register?plan=normal"
            className="mt-6 inline-flex rounded-xl border border-white/[0.12] px-4 py-2.5 text-sm font-semibold text-[#F8F9FA] transition hover:border-white/[0.2] hover:bg-white/[0.04]"
          >
            Comenzar gratis
          </Link>
        </article>

        <article className="rounded-2xl border-[1.5px] border-blue-500 bg-[#0F1117] p-6 shadow-[0_0_35px_rgba(59,130,246,0.18)]">
          <span className="inline-flex rounded-full bg-blue-500/15 px-3 py-1 text-xs font-semibold text-blue-300">
            Mas popular
          </span>
          <h3 className="mt-4 text-xl font-semibold text-[#F8F9FA]">Plan Premium</h3>
          <p className="mt-1 text-2xl font-bold text-[#F8F9FA]">USD 8/mes</p>
          <p className="text-sm text-[#8B949E]">Pro</p>
          <ul className="mt-5 space-y-2">
            {premiumFeatures.map((feature) => (
              <li key={feature} className="flex items-center gap-2 text-sm text-[#F8F9FA]">
                <Check size={16} className="text-[#10B981]" />
                {feature}
              </li>
            ))}
          </ul>
          <Link
            href="/register?plan=premium"
            className="mt-6 inline-flex rounded-xl bg-blue-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-400"
          >
            Quiero Premium
          </Link>
        </article>
      </div>

      <p className="mt-6 text-center text-sm text-[#8B949E]">
        Cobro en ARS al tipo de cambio oficial · Sin permanencia · Cancela cuando quieras
      </p>
    </section>
  );
}
