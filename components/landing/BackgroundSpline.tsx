'use client';

import Spline from '@splinetool/react-spline';
import type { Application } from '@splinetool/runtime';
import { motion, useScroll, useTransform } from 'framer-motion';
import { useCallback } from 'react';

export default function BackgroundSpline() {
  const { scrollYProgress } = useScroll();
  const rotate = useTransform(scrollYProgress, [0, 1], [0, 36]);
  const scale = useTransform(scrollYProgress, [0, 1], [1.02, 1.14]);
  const y = useTransform(scrollYProgress, [0, 1], [0, -90]);
  const opacity = useTransform(scrollYProgress, [0, 0.2, 1], [0.95, 0.9, 0.78]);

  const handleLoad = useCallback((app: Application) => {
    app.setBackgroundColor('transparent');
  }, []);

  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-0 overflow-hidden bg-[#06070A]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_66%_28%,rgba(59,130,246,0.18),transparent_34%),radial-gradient(circle_at_24%_68%,rgba(16,185,129,0.1),transparent_32%)]" />

      <div className="absolute left-1/2 top-1/2 h-[132vh] min-h-[760px] w-[132vw] min-w-[760px] -translate-x-1/2 -translate-y-1/2">
        <motion.div
          style={{ rotate, scale, y, opacity }}
          className="h-full w-full transform-gpu will-change-transform"
        >
          <Spline
            scene="https://prod.spline.design/NXN3Wy3ZZe6uuzvr/scene.splinecode"
            renderOnDemand={false}
            onLoad={handleLoad}
            className="h-full w-full [filter:saturate(1.28)_brightness(1.08)_contrast(1.14)]"
          />
        </motion.div>
      </div>

      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(6,7,10,0.86)_0%,rgba(6,7,10,0.48)_24%,rgba(6,7,10,0.2)_54%,rgba(6,7,10,0.62)_100%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_0%,rgba(6,7,10,0.16)_52%,rgba(6,7,10,0.82)_100%)]" />
      <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(6,7,10,0.18),rgba(6,7,10,0.12)_42%,rgba(6,7,10,0.72)_100%)]" />
    </div>
  );
}
