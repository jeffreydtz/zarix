'use client';

import Spline from '@splinetool/react-spline/next';
import { motion, useScroll, useTransform } from 'framer-motion';

export default function BackgroundSpline() {
  const { scrollYProgress } = useScroll();
  const rotate = useTransform(scrollYProgress, [0, 1], [0, 22]);
  const scale = useTransform(scrollYProgress, [0, 1], [1.08, 1.18]);
  const y = useTransform(scrollYProgress, [0, 1], [0, -120]);
  const opacity = useTransform(scrollYProgress, [0, 0.2, 1], [0.9, 0.82, 0.68]);

  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      <motion.div
        style={{ rotate, scale, y, opacity }}
        className="absolute left-1/2 top-1/2 h-[130vh] w-[130vw] -translate-x-1/2 -translate-y-1/2"
      >
        <Spline scene="https://prod.spline.design/NXN3Wy3ZZe6uuzvr/scene.splinecode" className="h-full w-full" />
      </motion.div>

      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_35%,rgba(59,130,246,0.18),transparent_55%)]" />
      <div className="absolute inset-0 bg-[#06070A]/35" />
      <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(6,7,10,0.26),rgba(6,7,10,0.52))]" />
    </div>
  );
}
