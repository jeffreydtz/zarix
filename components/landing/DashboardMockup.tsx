'use client';

import Spline from '@splinetool/react-spline/next';

export default function DashboardMockup() {
  return (
    <div className="relative h-[500px] w-full max-w-xl overflow-hidden rounded-3xl border border-border/60 bg-card shadow-[0_32px_90px_rgba(0,0,0,0.65)]">
      <div className="pointer-events-none absolute inset-0 z-10 rounded-3xl bg-primary/5 blur-3xl" />
      <Spline
        scene="https://prod.spline.design/NXN3Wy3ZZe6uuzvr/scene.splinecode"
        className="relative z-20 h-full w-full"
      />
    </div>
  );
}
