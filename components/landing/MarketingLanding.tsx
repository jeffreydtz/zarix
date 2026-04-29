'use client';

import Link from 'next/link';
import { motion, MotionValue, useScroll, useSpring, useTransform } from 'framer-motion';
import { useRef } from 'react';

interface FlowStep {
  title: string;
  description: string;
  metric: string;
  detail: string;
}

const flowSteps: FlowStep[] = [
  {
    title: 'Conecta tus cuentas',
    description:
      'Unifica gastos, ingresos e inversiones en un mismo panel para ver tu foto financiera real.',
    metric: '+8 fuentes conectadas',
    detail: 'Bancos, billeteras y movimientos en una misma vista.',
  },
  {
    title: 'Entiende que esta pasando',
    description:
      'Detecta patrones, alertas y desbalances con visuales claras y explicaciones simples.',
    metric: 'Alertas en tiempo real',
    detail: 'Detecta desviaciones antes de fin de mes.',
  },
  {
    title: 'Acciona con confianza',
    description:
      'Recibe recomendaciones y seguimiento para tomar decisiones mejores todos los meses.',
    metric: 'Objetivos con seguimiento',
    detail: 'Planifica, ejecuta y valida resultados cada semana.',
  },
];

const plans = [
  {
    name: 'Plan Normal',
    price: 'Gratis',
    description: 'Ideal para ordenar tus finanzas personales y empezar hoy.',
    bullets: ['Dashboard completo', 'Categorias y presupuestos', 'Analisis base mensual'],
    cta: 'Comenzar gratis',
    href: '/register?plan=normal',
    highlighted: false,
  },
  {
    name: 'Plan Premium',
    price: 'Pro',
    description: 'Pensado para usuarios que quieren automatizacion y control avanzado.',
    bullets: ['Orquestador IA', 'Alertas inteligentes', 'Proyecciones y seguimiento pro'],
    cta: 'Quiero Premium',
    href: '/register?plan=premium',
    highlighted: true,
  },
];

interface StoryChapter {
  title: string;
  text: string;
}

const chapters: StoryChapter[] = [
  {
    title: 'Todo comienza en una sola pantalla',
    text: 'Conecta tus cuentas y obten una lectura completa de tu dinero en segundos.',
  },
  {
    title: 'Zarix traduce datos en decisiones',
    text: 'Cada escena te explica que pasa, por que pasa y que accion conviene tomar.',
  },
  {
    title: 'Del insight al resultado',
    text: 'Con objetivos y seguimiento, pasas de mirar numeros a cambiar habitos.',
  },
];

function StoryStepCard({
  step,
  index,
  total,
  progress,
}: {
  step: FlowStep;
  index: number;
  total: number;
  progress: MotionValue<number>;
}) {
  const start = index / total;
  const mid = (index + 0.5) / total;
  const end = (index + 1) / total;

  const opacity = useTransform(progress, [start, mid, end], [0.35, 1, 0.35]);
  const y = useTransform(progress, [start, mid, end], [26, 0, -22]);
  const scale = useTransform(progress, [start, mid, end], [0.97, 1, 0.98]);
  const borderOpacity = useTransform(progress, [start, mid, end], [0.18, 0.8, 0.2]);

  return (
    <motion.article
      style={{
        opacity,
        y,
        scale,
        borderColor: useTransform(borderOpacity, (value) => `rgba(129, 140, 248, ${value})`),
      }}
      className="rounded-2xl border bg-slate-900/70 p-5"
    >
      <p className="text-xs font-medium uppercase tracking-widest text-indigo-300">Paso {index + 1}</p>
      <h3 className="mt-3 text-xl font-semibold">{step.title}</h3>
      <p className="mt-2 text-sm text-slate-300">{step.description}</p>
      <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950/70 p-3">
        <p className="text-sm font-medium text-indigo-200">{step.metric}</p>
        <p className="mt-1 text-xs text-slate-400">{step.detail}</p>
      </div>
    </motion.article>
  );
}

function AnimatedWord({
  word,
  index,
  total,
  progress,
}: {
  word: string;
  index: number;
  total: number;
  progress: MotionValue<number>;
}) {
  const start = index / (total + 1);
  const end = start + 0.32;
  const opacity = useTransform(progress, [start, end], [0.2, 1]);
  const y = useTransform(progress, [start, end], [14, 0]);
  const blur = useTransform(progress, [start, end], [8, 0]);

  return (
    <motion.span
      style={{ opacity, y, filter: useTransform(blur, (v) => `blur(${v}px)`) }}
      className="mr-2 inline-block"
    >
      {word}
    </motion.span>
  );
}

function ScrollWords({ text, progress }: { text: string; progress: MotionValue<number> }) {
  const words = text.split(' ').filter(Boolean);

  return (
    <span>
      {words.map((word, index) => (
        <AnimatedWord
          key={`${word}-${index}`}
          word={word}
          index={index}
          total={words.length}
          progress={progress}
        />
      ))}
    </span>
  );
}

function StoryChapterScene({
  chapter,
  index,
  total,
  progress,
}: {
  chapter: StoryChapter;
  index: number;
  total: number;
  progress: MotionValue<number>;
}) {
  const start = index / total;
  const mid = (index + 0.5) / total;
  const end = (index + 1) / total;
  const chapterProgress = useTransform(progress, [start, end], [0, 1]);

  return (
    <motion.article
      style={{
        opacity: useTransform(progress, [start, mid, end], [0, 1, 0]),
        y: useTransform(progress, [start, mid, end], [28, 0, -26]),
        scale: useTransform(progress, [start, mid, end], [0.97, 1, 1.02]),
      }}
      className="absolute inset-0 rounded-[2rem] border border-slate-800 bg-slate-900/90 p-7 backdrop-blur"
    >
      <p className="text-xs uppercase tracking-widest text-indigo-300">Capitulo {index + 1}</p>
      <h3 className="mt-5 text-3xl font-semibold leading-tight text-slate-100 sm:text-4xl">
        <ScrollWords text={chapter.title} progress={chapterProgress} />
      </h3>
      <p className="mt-6 max-w-lg text-sm text-slate-300 sm:text-base">{chapter.text}</p>
    </motion.article>
  );
}

function StoryWaveBar({ index, progress }: { index: number; progress: MotionValue<number> }) {
  const scaleY = useTransform(progress, (value) => {
    const wave = Math.sin((index / 2) * 0.7 + value * 8);
    return 0.45 + Math.max(wave, 0) * 0.9;
  });

  return (
    <motion.div
      className="h-16 rounded-full bg-indigo-400/30"
      style={{ scaleY, transformOrigin: 'bottom' }}
    />
  );
}

export default function MarketingLanding() {
  const storytellingRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: storytellingRef,
    offset: ['start start', 'end end'],
  });
  const smoothProgress = useSpring(scrollYProgress, {
    stiffness: 110,
    damping: 24,
    mass: 0.18,
  });
  const panelY = useTransform(smoothProgress, [0, 1], [24, -24]);
  const panelRotate = useTransform(smoothProgress, [0, 1], [-2, 2]);
  const panelScale = useTransform(smoothProgress, [0, 1], [0.98, 1.02]);
  const glowOpacity = useTransform(smoothProgress, [0, 0.5, 1], [0.25, 0.6, 0.32]);

  return (
    <div className="snap-y snap-mandatory bg-slate-950 text-slate-100">
      <motion.div className="fixed left-0 right-0 top-0 z-50 h-0.5 origin-left bg-indigo-400" style={{ scaleX: smoothProgress }} />

      <section className="relative min-h-screen snap-start overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(99,102,241,0.35),transparent_60%)]" />
        <div className="mx-auto max-w-6xl px-6 pb-24 pt-8 sm:pt-14">
          <div className="mb-12 flex items-center justify-between">
            <div className="text-xl font-semibold tracking-tight">Zarix</div>
            <Link
              href="/login"
              className="rounded-full border border-slate-700 px-5 py-2 text-sm font-medium text-slate-200 transition hover:border-slate-500 hover:bg-slate-900"
            >
              Iniciar sesion
            </Link>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.65 }}
            className="grid gap-10 lg:grid-cols-[1.1fr_0.9fr]"
          >
            <div>
              <p className="mb-5 inline-flex rounded-full border border-indigo-500/40 bg-indigo-500/10 px-4 py-1.5 text-xs font-medium text-indigo-200">
                Gestion financiera con narrativa visual
              </p>
              <h1 className="text-4xl font-semibold leading-tight sm:text-5xl lg:text-6xl">
                La forma mas didactica de entender y mejorar tus finanzas.
              </h1>
              <p className="mt-6 max-w-xl text-base text-slate-300 sm:text-lg">
                Experiencia cinematica con scroll storytelling: mientras bajas, descubris como Zarix
                transforma datos sueltos en decisiones concretas.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link href="/login" className="btn btn-primary rounded-full px-6 py-3 text-base">
                  Ir al login
                </Link>
                <Link
                  href="#storytelling"
                  className="rounded-full border border-slate-700 px-6 py-3 text-base font-medium text-slate-100 transition hover:border-slate-500 hover:bg-slate-900"
                >
                  Ver experiencia
                </Link>
              </div>
            </div>

            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.65, delay: 0.15 }}
              className="rounded-3xl border border-slate-800 bg-slate-900/80 p-6 shadow-2xl shadow-indigo-500/10 backdrop-blur"
            >
              <p className="text-sm uppercase tracking-widest text-slate-400">Vista de producto</p>
              <div className="mt-4 space-y-4">
                <div className="rounded-2xl border border-slate-800 bg-slate-950/80 p-4">
                  <p className="text-sm text-slate-400">Saldo total</p>
                  <p className="mt-1 text-3xl font-semibold">$ 2.450.000</p>
                  <p className="mt-1 text-sm text-emerald-400">+12.8% este mes</p>
                </div>
                <div className="rounded-2xl border border-slate-800 bg-slate-950/80 p-4">
                  <p className="text-sm text-slate-400">Distribucion inteligente</p>
                  <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-slate-800">
                    <div className="h-full w-2/5 bg-indigo-400" />
                  </div>
                  <div className="mt-3 flex justify-between text-xs text-slate-400">
                    <span>Gastos 40%</span>
                    <span>Ahorro 32%</span>
                    <span>Inversion 28%</span>
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        </div>
      </section>

      <section id="storytelling" className="mx-auto min-h-screen max-w-6xl snap-start px-6 pb-14">
        <div className="mb-8 pt-10 sm:pt-16">
          <h2 className="text-3xl font-semibold sm:text-4xl">Scroll storytelling</h2>
          <p className="mt-3 max-w-2xl text-slate-300">
            Capitulo por capitulo, con transiciones full-screen y texto que cobra vida mientras
            avanzas.
          </p>
        </div>

        <div ref={storytellingRef} className="relative h-[320vh] snap-y snap-mandatory">
          <div className="sticky top-0 flex min-h-screen items-center">
            <div className="grid w-full gap-8 lg:grid-cols-[1fr_1fr]">
              <div className="relative">
                <motion.div className="pointer-events-none absolute inset-0 rounded-[2rem] bg-indigo-500/20 blur-3xl" style={{ opacity: glowOpacity }} />
                <motion.div
                  style={{ y: panelY, rotateZ: panelRotate, scale: panelScale }}
                  className="relative min-h-[460px]"
                >
                  {chapters.map((chapter, index) => (
                    <StoryChapterScene
                      key={chapter.title}
                      chapter={chapter}
                      index={index}
                      total={chapters.length}
                      progress={smoothProgress}
                    />
                  ))}
                </motion.div>
                <motion.div
                  style={{ y: panelY }}
                  className="relative mt-5 rounded-[2rem] border border-slate-800 bg-slate-900/85 p-6 shadow-2xl shadow-indigo-500/20 backdrop-blur"
                >
                  <p className="text-sm uppercase tracking-widest text-slate-400">Escena de producto</p>
                  <div className="mt-6 rounded-2xl border border-slate-800 bg-slate-950/70 p-5">
                    <p className="text-sm text-slate-400">Ritmo financiero mensual</p>
                    <div className="mt-4 grid grid-cols-12 gap-1.5">
                      {Array.from({ length: 24 }).map((_, i) => (
                        <StoryWaveBar key={`bar-${i}`} index={i} progress={smoothProgress} />
                      ))}
                    </div>
                  </div>
                </motion.div>
              </div>

              <div className="space-y-4">
                {flowSteps.map((step, index) => (
                  <StoryStepCard
                    key={step.title}
                    step={step}
                    index={index}
                    total={flowSteps.length}
                    progress={smoothProgress}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="planes" className="mx-auto min-h-screen max-w-6xl snap-start px-6 pb-24 pt-10 sm:pt-16">
        <h2 className="text-3xl font-semibold sm:text-4xl">Elegi tu plan</h2>
        <p className="mt-3 max-w-2xl text-slate-300">
          Todo empieza en esta pagina: elegis plan, vas a login y arrancas con tu panel personalizado.
        </p>
        <div className="mt-10 grid gap-5 lg:grid-cols-2">
          {plans.map((plan) => (
            <article
              key={plan.name}
              className={`rounded-3xl border p-7 ${
                plan.highlighted
                  ? 'border-indigo-400/70 bg-gradient-to-br from-indigo-500/20 to-fuchsia-500/10'
                  : 'border-slate-800 bg-slate-900/70'
              }`}
            >
              <p className="text-sm uppercase tracking-widest text-slate-400">{plan.name}</p>
              <p className="mt-2 text-4xl font-semibold">{plan.price}</p>
              <p className="mt-3 text-sm text-slate-300">{plan.description}</p>
              <ul className="mt-5 space-y-2 text-sm text-slate-200">
                {plan.bullets.map((bullet) => (
                  <li key={bullet}>• {bullet}</li>
                ))}
              </ul>
              <Link
                href={plan.href}
                className={`mt-7 inline-flex rounded-full px-6 py-3 text-sm font-semibold transition ${
                  plan.highlighted
                    ? 'bg-indigo-500 text-white hover:bg-indigo-400'
                    : 'bg-slate-100 text-slate-900 hover:bg-white'
                }`}
              >
                {plan.cta}
              </Link>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
