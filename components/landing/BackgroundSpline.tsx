'use client';

import Spline from '@splinetool/react-spline/next';
import { motion, useScroll, useSpring, useTransform } from 'framer-motion';

export default function BackgroundSpline() {
  const { scrollYProgress } = useScroll();

  const smooth = useSpring(scrollYProgress, {
    stiffness: 90,
    damping: 26,
    mass: 0.4,
  });

  const rotateZ = useTransform(smooth, [0, 1], [-8, 28]);
  const rotateY = useTransform(smooth, [0, 1], [-6, 14]);
  const scale = useTransform(smooth, [0, 1], [1.05, 1.18]);
  const y = useTransform(smooth, [0, 1], [0, -120]);
  const opacity = useTransform(smooth, [0, 0.15, 1], [0.95, 0.88, 0.72]);

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-0 overflow-hidden bg-[#06070A]"
      style={{ perspective: '1400px' }}
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_25%,rgba(59,130,246,0.22),transparent_45%),radial-gradient(circle_at_20%_75%,rgba(16,185,129,0.12),transparent_40%)]" />

      <motion.div
        style={{
          rotateZ,
          rotateY,
          scale,
          y,
          opacity,
          transformStyle: 'preserve-3d',
          transformOrigin: '50% 50%',
        }}
        className="absolute left-1/2 top-1/2 h-[140vh] w-[140vw] -translate-x-1/2 -translate-y-1/2 will-change-transform"
      >
        <Spline
          scene="https://prod.spline.design/NXN3Wy3ZZe6uuzvr/scene.splinecode"
          className="h-full w-full [filter:saturate(1.25)_brightness(1.1)_contrast(1.08)]"
        />
      </motion.div>

      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(6,7,10,0.05)_0%,rgba(6,7,10,0.0)_30%,rgba(6,7,10,0.55)_100%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_30%,rgba(6,7,10,0.6)_100%)]" />
    </div>
  );
}
