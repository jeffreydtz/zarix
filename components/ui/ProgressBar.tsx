'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { maybeReduceTransition, motionTransition } from '@/lib/motion';

interface ProgressBarProps {
  value: number;
  max?: number;
  colorClass?: string;
  height?: string;
  showLabel?: boolean;
  animated?: boolean;
}

export default function ProgressBar({
  value,
  max = 100,
  colorClass = 'bg-primary',
  height = 'h-2',
  showLabel = false,
  animated = true,
}: ProgressBarProps) {
  const shouldReduceMotion = useReducedMotion() ?? false;
  const percentage = Math.min((value / max) * 100, 100);

  const getColorClass = () => {
    if (colorClass !== 'bg-primary') return colorClass;
    // Auto-color sobre tokens semánticos (ver DESIGN.md): success → warning → destructive.
    if (percentage > 80) return 'bg-destructive';
    if (percentage > 50) return 'bg-warning';
    return 'bg-success';
  };

  return (
    <div className="w-full">
      {showLabel && (
        <div className="flex justify-between text-xs text-muted-foreground mb-1">
          <span>{value.toLocaleString('es-AR')}</span>
          <span>{percentage.toFixed(0)}%</span>
        </div>
      )}
      <div className={`w-full bg-secondary rounded-full ${height} overflow-hidden`}>
        <motion.div
          className={`${height} rounded-full ${getColorClass()}`}
          style={{ transformOrigin: '0% 50%' }}
          initial={animated && !shouldReduceMotion ? { scaleX: 0 } : { scaleX: percentage / 100 }}
          animate={{ scaleX: percentage / 100 }}
          transition={maybeReduceTransition(shouldReduceMotion, animated ? {
            ...motionTransition.smooth,
            duration: 0.75,
            delay: 0.08,
          } : motionTransition.instant)}
        />
      </div>
    </div>
  );
}
