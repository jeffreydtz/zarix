'use client';

import type { ReactNode } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { maybeReduceTransition, motionTransition } from '@/lib/motion';

interface MotionSectionProps {
  children: ReactNode;
  delay?: number;
  className?: string;
  intensity?: 'hero' | 'normal' | 'subtle';
}

export default function MotionSection({
  children,
  delay = 0,
  className,
  intensity = 'normal',
}: MotionSectionProps) {
  const shouldReduceMotion = useReducedMotion() ?? false;
  const initialY = intensity === 'hero' ? 22 : intensity === 'subtle' ? 10 : 16;
  const duration = intensity === 'hero' ? 0.5 : intensity === 'subtle' ? 0.28 : 0.4;

  return (
    <motion.section
      className={className}
      initial={{ opacity: 0, y: shouldReduceMotion ? 0 : initialY }}
      animate={{ opacity: 1, y: 0 }}
      transition={maybeReduceTransition(shouldReduceMotion, {
        ...motionTransition.smooth,
        delay,
        duration,
      })}
    >
      {children}
    </motion.section>
  );
}
