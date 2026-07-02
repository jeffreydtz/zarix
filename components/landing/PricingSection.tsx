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
  'Cotizaciones dólar blue / MEP / CCL',
  'Presupuestos básicos',
  'Análisis mensual',
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
        <h2 className="text-3xl font-semibold text-foreground sm:text-5xl">Empeza gratis. Escala cuando quieras.</h2>
      </motion.div>

      <div className="mx-auto mt-10 grid max-w-4xl gap-4 lg:grid-cols-2">
        <article className="rounded-2xl border border-border/70 bg-card p-6">
          <span className="inline-flex rounded-full border border-border px-3 py-1 text-xs font-semibold text-muted-foreground">
            Gratis
          </span>
          <h3 className="mt-4 text-xl font-semibold text-foreground">Plan Free</h3>
          <p className="mt-1 text-muted-foreground">Gratis para siempre</p>
          <ul className="mt-5 space-y-2">
            {freeFeatures.map((feature) => (
              <li key={feature} className="flex items-center gap-2 text-sm text-foreground">
                <Check size={16} className="text-[#10B981]" />
                {feature}
              </li>
            ))}
          </ul>
          <Link
            href="/register?plan=normal"
            className="mt-6 inline-flex rounded-xl border border-border px-4 py-2.5 text-sm font-semibold text-foreground transition hover:border-muted-foreground/40 hover:bg-white/[0.04]"
          >
            Comenzar gratis
          </Link>
        </article>

        <article className="rounded-2xl border-[1.5px] border-primary bg-card p-6 shadow-[0_0_35px_rgba(34,197,94,0.18)]">
          <span className="inline-flex rounded-full bg-primary/15 px-3 py-1 text-xs font-semibold text-primary">
            Mas popular
          </span>
          <h3 className="mt-4 text-xl font-semibold text-foreground">Plan Premium</h3>
          <p className="mt-1 text-2xl font-bold text-foreground">USD 8/mes</p>
          <p className="text-sm text-muted-foreground">Pro</p>
          <ul className="mt-5 space-y-2">
            {premiumFeatures.map((feature) => (
              <li key={feature} className="flex items-center gap-2 text-sm text-foreground">
                <Check size={16} className="text-[#10B981]" />
                {feature}
              </li>
            ))}
          </ul>
          <Link
            href="/register?plan=premium"
            className="mt-6 inline-flex rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition hover:brightness-110"
          >
            Quiero Premium
          </Link>
        </article>
      </div>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        Cobro en ARS al tipo de cambio oficial · Sin permanencia · Cancela cuando quieras
      </p>
    </section>
  );
}
