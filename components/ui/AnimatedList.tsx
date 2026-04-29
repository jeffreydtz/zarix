'use client';

import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { Children, ReactNode, isValidElement } from 'react';
import { motionVariants, maybeReduceTransition } from '@/lib/motion';

interface AnimatedListProps {
  children: ReactNode;
  className?: string;
  staggerDelay?: number;
}

export default function AnimatedList({ 
  children, 
  className = '',
  staggerDelay = 0.08,
}: AnimatedListProps) {
  const shouldReduceMotion = useReducedMotion() ?? false;
  const childNodes = Children.toArray(children);

  return (
    <motion.div
      variants={motionVariants.listContainer}
      custom={shouldReduceMotion ? 0 : staggerDelay}
      initial="hidden"
      animate="visible"
      className={className}
    >
      <AnimatePresence mode={shouldReduceMotion ? 'sync' : 'popLayout'}>
        {childNodes.map((child, index) => (
          <motion.div
            key={isValidElement(child) && child.key ? child.key : `animated-item-${index}`}
            variants={motionVariants.listItem}
            layout={!shouldReduceMotion}
            transition={maybeReduceTransition(shouldReduceMotion, motionVariants.listItem.visible?.transition ?? {})}
          >
            {child}
          </motion.div>
        ))}
      </AnimatePresence>
    </motion.div>
  );
}
