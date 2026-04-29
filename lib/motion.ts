'use client';

import type { Transition, Variants } from 'framer-motion';

export const motionTransition = {
  instant: { duration: 0.01 } satisfies Transition,
  smooth: {
    duration: 0.42,
    ease: [0.22, 1, 0.36, 1],
  } satisfies Transition,
  emphasized: {
    type: 'spring',
    stiffness: 220,
    damping: 24,
    mass: 0.8,
  } satisfies Transition,
  modal: {
    type: 'spring',
    stiffness: 340,
    damping: 30,
    mass: 0.82,
  } satisfies Transition,
};

export const motionVariants = {
  pageEnter: {
    hidden: { opacity: 0, y: 20, filter: 'blur(8px)' },
    visible: {
      opacity: 1,
      y: 0,
      filter: 'blur(0px)',
      transition: motionTransition.smooth,
    },
  } satisfies Variants,
  sectionEnter: {
    hidden: { opacity: 0, y: 14 },
    visible: {
      opacity: 1,
      y: 0,
      transition: motionTransition.smooth,
    },
  } satisfies Variants,
  listContainer: {
    hidden: { opacity: 0 },
    visible: (stagger = 0.06) => ({
      opacity: 1,
      transition: {
        staggerChildren: stagger,
        delayChildren: 0.02,
      },
    }),
  } satisfies Variants,
  listItem: {
    hidden: { opacity: 0, y: 14 },
    visible: {
      opacity: 1,
      y: 0,
      transition: motionTransition.smooth,
    },
    exit: {
      opacity: 0,
      y: -10,
      transition: {
        duration: 0.2,
      },
    },
  } satisfies Variants,
} as const;

export function maybeReduceTransition(shouldReduceMotion: boolean, transition: Transition): Transition {
  return shouldReduceMotion ? motionTransition.instant : transition;
}

export function maybeReduceVariantY(shouldReduceMotion: boolean, y = 16): number {
  return shouldReduceMotion ? 0 : y;
}
