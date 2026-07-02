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

interface FeatureCard extends FeatureItem {
  description: string;
  icon: LucideIcon;
  /** Preview compacto para mobile (no aparece en desktop, evita stack de mockups grandes). */
  preview: { label: string; value: string }[];
}

const features: FeatureCard[] = [
  {
    key: 'quotes',
    title: 'Dólar blue, MEP y CCL nativos',
    description:
      'No es un widget genérico. Las cotizaciones son parte del core de Zarix y tu patrimonio siempre se expresa al tipo de cambio real.',
    icon: RefreshCw,
    preview: [
      { label: 'Blue', value: '$1.085' },
      { label: 'MEP', value: '$1.071' },
      { label: 'CCL', value: '$1.092' },
    ],
  },
  {
    key: 'portfolio',
    title: 'Tu patrimonio en ARS y USD simultáneo',
    description:
      'Cuánto tenés en pesos y cuánto en dólares al mismo tiempo. Distribución por cuenta, por activo y por categoría.',
    icon: PieChart,
    preview: [
      { label: 'ARS', value: '$2.847.320' },
      { label: 'USD', value: '2.619' },
    ],
  },
  {
    key: 'telegram',
    title: 'Registrá un gasto en 5 segundos',
    description:
      'Mandale un mensaje a tu bot personal de Zarix y listo. Sin abrir la app, sin formularios. También parsea tickets por foto con IA.',
    icon: MessageCircle,
    preview: [
      { label: 'Mensaje', value: '«Gasté 15.000 en nafta»' },
      { label: 'Categorizado', value: 'Transporte −$15.000' },
    ],
  },
  {
    key: 'stocks',
    title: 'GGAL, YPF, AAPL y bonos en un solo lugar',
    description:
      'Portafolio de acciones argentinas, CEDEARs y bonos soberanos con P&L en vivo. Precio promedio, variación del día y valor total por posición.',
    icon: BarChart2,
    preview: [
      { label: 'GGAL', value: '+3,2%' },
      { label: 'AL30', value: '+0,5%' },
      { label: 'AAPL', value: '+0,8%' },
    ],
  },
  {
    key: 'budget',
    title: 'Alertas antes de que te pases',
    description:
      'Definí límites por categoría. Zarix te avisa al 80% antes de que sea tarde. Resumen semanal automático por Telegram.',
    icon: Target,
    preview: [
      { label: 'Restaurantes', value: '91% del límite' },
      { label: 'Supermercado', value: '76% del límite' },
    ],
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
  const leftGlow = useTransform(scrollYProgress, [0, 0.5, 1], [0.12, 0.28, 0.12]);

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
    <section
      id="features"
      ref={sectionRef}
      className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6 sm:py-28 lg:px-8"
    >
      <div className="mx-auto mb-14 max-w-2xl text-center sm:mb-20">
        <span className="inline-flex items-center rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
          Producto local
        </span>
        <h2 className="mt-4 text-balance text-3xl font-semibold leading-tight text-foreground sm:text-5xl">
          Pensado para Argentina, no adaptado después.
        </h2>
        <p className="mt-4 text-base leading-relaxed text-muted-foreground sm:text-lg">
          Cinco piezas que cambian cómo ves tu plata cuando vivís entre pesos y dólares.
        </p>
      </div>

      <div className="grid gap-10 lg:grid-cols-[1fr_1.05fr] lg:gap-14">
        <div className="hidden lg:block">
          <div className="sticky top-24">
            <motion.div
              className="pointer-events-none absolute inset-0 rounded-3xl bg-primary/10 blur-3xl"
              style={{ opacity: leftGlow }}
            />
            <div className="relative">
              <FeatureMockup feature={activeItem} />
            </div>
          </div>
        </div>

        <div className="space-y-3">
          {features.map((feature, index) => {
            const Icon = feature.icon;
            const isActive = activeFeature === index;
            return (
              <div
                key={feature.key}
                ref={(node) => {
                  itemRefs.current[index] = node;
                }}
                data-index={index}
                className={`group relative overflow-hidden rounded-2xl border p-5 sm:p-6 transition-all duration-300 ${
                  isActive
                    ? 'border-border bg-surface-soft shadow-[0_20px_60px_-30px_rgba(34,197,94,0.45)]'
                    : 'border-border/60 bg-card hover:border-border hover:bg-surface-soft'
                }`}
              >
                <span
                  aria-hidden
                  className={`absolute left-0 top-5 h-[calc(100%-2.5rem)] w-[3px] rounded-r-full transition-opacity duration-300 ${
                    isActive ? 'bg-primary opacity-100' : 'bg-primary/0 opacity-0'
                  }`}
                />

                <div className="flex items-start gap-4">
                  <div
                    className={`mt-0.5 shrink-0 rounded-xl border p-2.5 transition-colors ${
                      isActive
                        ? 'border-primary/40 bg-primary/15 text-primary'
                        : 'border-border/70 bg-white/[0.03] text-muted-foreground group-hover:text-primary'
                    }`}
                  >
                    <Icon size={18} aria-hidden />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-lg font-semibold leading-snug text-foreground">
                      {feature.title}
                    </h3>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                      {feature.description}
                    </p>

                    <div className="mt-4 flex flex-wrap gap-2 lg:hidden">
                      {feature.preview.map((p) => (
                        <span
                          key={p.label}
                          className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-white/[0.03] px-2.5 py-1 text-[11px]"
                        >
                          <span className="text-muted-foreground">{p.label}</span>
                          <span className="font-semibold text-foreground tabular-nums">{p.value}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
