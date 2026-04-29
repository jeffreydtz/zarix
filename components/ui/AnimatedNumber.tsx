'use client';

import { useEffect, useRef } from 'react';
import { motion, useMotionValue, useReducedMotion, useSpring, useMotionValueEvent } from 'framer-motion';
import { maybeReduceTransition, motionTransition } from '@/lib/motion';

interface AnimatedNumberProps {
  value: number;
  duration?: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  className?: string;
}

export default function AnimatedNumber({
  value,
  duration = 1,
  decimals = 2,
  prefix = '',
  suffix = '',
  className = '',
}: AnimatedNumberProps) {
  const shouldReduceMotion = useReducedMotion() ?? false;
  const spanRef = useRef<HTMLSpanElement>(null);
  const motionValue = useMotionValue(0);
  const spring = useSpring(motionValue, {
    stiffness: 110,
    damping: 28,
  });

  useEffect(() => {
    if (shouldReduceMotion) {
      motionValue.set(value);
      return;
    }
    spring.set(value);
  }, [value, spring, motionValue, shouldReduceMotion]);

  useMotionValueEvent(shouldReduceMotion ? motionValue : spring, 'change', (latest) => {
    if (!spanRef.current) return;
    spanRef.current.textContent = `${prefix}${latest.toLocaleString('es-AR', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    })}${suffix}`;
  });

  const initialValue = `${prefix}${value.toLocaleString('es-AR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}${suffix}`;

  return (
    <motion.span
      ref={spanRef}
      className={`zx-num ${className}`.trim()}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={maybeReduceTransition(shouldReduceMotion, {
        ...motionTransition.smooth,
        duration,
      })}
    >
      {initialValue}
    </motion.span>
  );
}
