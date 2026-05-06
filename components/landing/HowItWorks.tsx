'use client';

import { motion } from 'framer-motion';
import { CircleUserRound, Layers3, ScanSearch } from 'lucide-react';

const steps = [
  {
    number: '01',
    title: 'Crea tu cuenta gratis',
    description: 'Sin tarjeta. Sin burocracia. En 30 segundos ya tenes tu panel.',
    icon: CircleUserRound,
  },
  {
    number: '02',
    title: 'Conecta tus cuentas y activos',
    description:
      'Suma tus cuentas bancarias, billeteras y posiciones de inversion manualmente. Sin APIs de homebanking: vos controlas tus datos.',
    icon: Layers3,
  },
  {
    number: '03',
    title: 'Entende tu plata de verdad',
    description:
      'Dashboard, cotizaciones, presupuestos y analisis en una sola pantalla. Con el dolar real, no el oficial.',
    icon: ScanSearch,
  },
];

const fadeUpVariants = {
  hidden: { opacity: 0, y: 30 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] },
  },
} as const;

export default function HowItWorks() {
  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6 lg:px-8">
      <motion.div
        variants={fadeUpVariants}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: '-80px' }}
        className="mx-auto max-w-3xl text-center"
      >
        <h2 className="text-3xl font-semibold text-[#F8F9FA] sm:text-5xl">Arrancas en menos de 2 minutos</h2>
      </motion.div>

      <div className="mt-10 grid gap-4 md:grid-cols-3">
        {steps.map((step, index) => {
          const Icon = step.icon;
          return (
            <motion.article
              key={step.number}
              variants={fadeUpVariants}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: '-80px' }}
              transition={{ delay: index * 0.1 }}
              className="rounded-2xl border border-white/[0.06] bg-[#0F1117] p-6"
            >
              <p className="text-4xl font-bold text-blue-400/70">{step.number}</p>
              <div className="mt-4 inline-flex rounded-lg border border-blue-500/30 bg-blue-500/10 p-2 text-blue-400">
                <Icon size={18} />
              </div>
              <h3 className="mt-4 text-lg font-semibold text-[#F8F9FA]">{step.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-[#8B949E]">{step.description}</p>
            </motion.article>
          );
        })}
      </div>
    </section>
  );
}
