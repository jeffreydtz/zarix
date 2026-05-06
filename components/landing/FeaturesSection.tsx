'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, useScroll, useTransform } from 'framer-motion';
import {
  BarChart2,
  MessageCircle,
  PieChart,
  RefreshCw,
  Target,
  type LucideIcon,
} from 'lucide-react';
import FeatureMockup, { type FeatureItem } from '@/components/landing/FeatureMockup';

const features: Array<
  FeatureItem & {
    description: string;
    icon: LucideIcon;
  }
> = [
  {
    key: 'quotes',
    title: 'Dolar blue, MEP y CCL nativos',
    description:
      'No un widget generico. Las cotizaciones son parte del core de Zarix. Tu patrimonio siempre expresado al tipo de cambio real.',
    icon: RefreshCw,
  },
  {
    key: 'portfolio',
    title: 'Tu patrimonio en ARS y USD simultaneo',
    description:
      'Ve cuanto tenes en pesos y cuanto en dolares al mismo tiempo. Distribucion por cuenta, por activo, por categoria.',
    icon: PieChart,
  },
  {
    key: 'telegram',
    title: 'Registra un gasto en 5 segundos',
    description:
      'Mandale un mensaje a tu bot personal de Zarix y listo. Sin abrir la app. Sin formularios. Tambien parsea tickets por foto con IA.',
    icon: MessageCircle,
  },
  {
    key: 'stocks',
    title: 'GGAL, YPF, AAPL en un solo lugar',
    description:
      'Portafolio de acciones argentinas y americanas con P&L en tiempo real. Precio promedio de compra, variacion del dia, valor total de la posicion.',
    icon: BarChart2,
  },
  {
    key: 'budget',
    title: 'Alertas antes de que te pases',
    description:
      'Defini limites por categoria. Zarix te avisa cuando llegas al 80% antes de que sea tarde. Seguimiento semanal automatico.',
    icon: Target,
  },
];

export default function FeaturesSection() {
  const [activeFeature, setActiveFeature] = useState(0);
  const sectionRef = useRef<HTMLElement | null>(null);
  const itemRefs = useRef<Array<HTMLDivElement | null>>([]);
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ['start end', 'end start'],
  });
  const leftGlow = useTransform(scrollYProgress, [0, 0.5, 1], [0.15, 0.3, 0.15]);

  const activeItem = useMemo(() => features[activeFeature] ?? features[0], [activeFeature]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        if (visible[0]) {
          const index = Number((visible[0].target as HTMLElement).dataset.index ?? 0);
          setActiveFeature(index);
        }
      },
      { threshold: [0.35, 0.5, 0.75], rootMargin: '-20% 0px -20% 0px' }
    );

    itemRefs.current.forEach((node) => {
      if (node) observer.observe(node);
    });

    return () => observer.disconnect();
  }, []);

  return (
    <section id="features" ref={sectionRef} className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6 lg:px-8">
      <div className="mx-auto mb-12 max-w-3xl text-center">
        <h2 className="text-balance text-3xl font-semibold text-[#F8F9FA] sm:text-5xl">Producto pensado para Argentina, no adaptado despues.</h2>
      </div>

      <div className="grid gap-8 lg:grid-cols-2 lg:gap-12">
        <div className="hidden lg:block">
          <div className="sticky top-24">
            <motion.div className="pointer-events-none absolute inset-0 rounded-3xl bg-blue-500/10 blur-3xl" style={{ opacity: leftGlow }} />
            <div className="relative">
              <FeatureMockup feature={activeItem} />
            </div>
          </div>
        </div>

        <div className="space-y-4">
          {features.map((feature, index) => {
            const Icon = feature.icon;
            return (
              <div
                key={feature.key}
                ref={(node) => {
                  itemRefs.current[index] = node;
                }}
                data-index={index}
                className={`rounded-2xl border p-5 transition ${
                  activeFeature === index
                    ? 'border-white/[0.18] bg-[#10141c]'
                    : 'border-white/[0.06] bg-[#0F1117]'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 rounded-lg border border-blue-500/30 bg-blue-500/10 p-2 text-blue-400">
                    <Icon size={18} />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-[#F8F9FA]">{feature.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-[#8B949E]">{feature.description}</p>
                  </div>
                </div>

                <div className="mt-4 lg:hidden">
                  <FeatureMockup feature={feature} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
