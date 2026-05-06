'use client';

import { motion } from 'framer-motion';
import { DollarSign, LayoutDashboard, TrendingUp } from 'lucide-react';

const fadeUpVariants = {
  hidden: { opacity: 0, y: 30 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] },
  },
} as const;

const cards = [
  {
    title: '5 tipos de cambio, 0 claridad',
    description:
      'Oficial, blue, MEP, CCL, crypto. A cuanto vale realmente tu plata? Con Zarix lo sabes al instante, en la moneda que elijas.',
    icon: DollarSign,
  },
  {
    title: 'Tus cuentas en 10 lugares distintos',
    description:
      'Banco, Mercado Pago, Uala, efectivo, crypto. Zarix los unifica en un solo panel. Tu foto financiera real, completa.',
    icon: LayoutDashboard,
  },
  {
    title: 'Cuanto perdiste por la inflacion este mes?',
    description:
      'No solo registras gastos. Zarix trackea tu patrimonio en USD para que veas si realmente estas ganando o perdiendo poder adquisitivo.',
    icon: TrendingUp,
  },
];

export default function ProblemSection() {
  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6 lg:px-8">
      <motion.div
        variants={fadeUpVariants}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: '-80px' }}
        className="mx-auto max-w-3xl text-center"
      >
        <h2 className="text-balance text-3xl font-semibold text-[#F8F9FA] sm:text-5xl">
          El dinero en Argentina es caotico.
          <br />
          Zarix lo ordena.
        </h2>
      </motion.div>

      <div className="mt-10 grid gap-4 md:grid-cols-3">
        {cards.map((card, index) => {
          const Icon = card.icon;
          return (
            <motion.article
              key={card.title}
              variants={fadeUpVariants}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: '-80px' }}
              transition={{ delay: index * 0.08 }}
              className="rounded-2xl border border-white/[0.06] bg-[#0F1117] p-6 transition hover:border-white/[0.12]"
            >
              <div className="inline-flex rounded-lg border border-blue-500/30 bg-blue-500/10 p-2 text-blue-400">
                <Icon size={20} />
              </div>
              <h3 className="mt-4 text-lg font-semibold text-[#F8F9FA]">{card.title}</h3>
              <p className="mt-3 text-sm leading-relaxed text-[#8B949E]">{card.description}</p>
            </motion.article>
          );
        })}
      </div>
    </section>
  );
}
