'use client';

import Spline from '@splinetool/react-spline/next';
import { motion, useScroll, useTransform } from 'framer-motion';

export default function BackgroundSpline() {
  const { scrollYProgress } = useScroll();
  const rotate = useTransform(scrollYProgress, [0, 1], [0, 36]);
  const scale = useTransform(scrollYProgress, [0, 1], [1.02, 1.14]);
  const y = useTransform(scrollYProgress, [0, 1], [0, -90]);
  const opacity = useTransform(scrollYProgress, [0, 0.2, 1], [0.92, 0.82, 0.7]);

  return (
    <div className="pointer-events-none fixed inset-0 z-[1] overflow-hidden">
      <motion.div
        style={{ rotate, scale, y, opacity }}
        className="absolute left-1/2 top-1/2 h-[125vh] w-[125vw] -translate-x-1/2 -translate-y-1/2"
      >
        <Spline
          scene="https://prod.spline.design/NXN3Wy3ZZe6uuzvr/scene.splinecode"
          className="h-full w-full [filter:saturate(1.22)_brightness(1.14)_contrast(1.08)]"
        />
      </motion.div>

      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_35%,rgba(59,130,246,0.12),transparent_62%)]" />
      <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(6,7,10,0.04),rgba(6,7,10,0.24))]" />
    </div>
  );
}
