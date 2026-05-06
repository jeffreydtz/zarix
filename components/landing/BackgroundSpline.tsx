'use client';

import { Application } from '@splinetool/runtime';
import type { SPEObject } from '@splinetool/runtime';
import {
  motion,
  useMotionValueEvent,
  useScroll,
  useSpring,
  useTransform,
} from 'framer-motion';
import { useEffect, useRef } from 'react';

const SCENE_URL = 'https://prod.spline.design/NXN3Wy3ZZe6uuzvr/scene.splinecode';
const SKIP = /(camera|light|ambient|directional|spot|point|area|shadow|helper|control)/i;
const SPIN_RANGE = Math.PI * 4;

type Snapshot = {
  object: SPEObject;
  rotation: { x: number; y: number; z: number };
};

function getRotationTargets(objects: SPEObject[]) {
  const rotatable = objects.filter(
    (object) =>
      object.visible &&
      object.rotation !== undefined &&
      !SKIP.test(object.name)
  );

  const rootLike = rotatable.filter((object) => {
    const parentName = object.parent?.name ?? '';
    return !object.parent || SKIP.test(parentName);
  });

  // Prefer rotating only high-level groups so each "objetito"
  // keeps all its internal pieces moving together.
  if (rootLike.length >= 2) {
    return rootLike.slice(0, 6);
  }

  return rotatable;
}

export default function BackgroundSpline() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const appRef = useRef<Application | null>(null);
  const snapshotsRef = useRef<Snapshot[]>([]);

  const { scrollYProgress } = useScroll();
  const smooth = useSpring(scrollYProgress, {
    stiffness: 65,
    damping: 22,
    mass: 0.5,
  });

  const parallaxY = useTransform(smooth, [0, 1], [0, -90]);
  const parallaxScale = useTransform(smooth, [0, 1], [1, 1.1]);
  const parallaxOpacity = useTransform(smooth, [0, 0.2, 1], [1, 0.94, 0.82]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let cancelled = false;
    const app = new Application(canvas);
    appRef.current = app;

    app
      .load(SCENE_URL)
      .then(() => {
        if (cancelled) return;

        try {
          app.setBackgroundColor('transparent');
        } catch {
          // ignore
        }

        const objects = app.getAllObjects();
        const rotatable = getRotationTargets(objects);

        snapshotsRef.current = rotatable.map((object) => ({
          object,
          rotation: {
            x: object.rotation.x,
            y: object.rotation.y,
            z: object.rotation.z,
          },
        }));

        console.info(
          `[BackgroundSpline] Scene loaded. Total: ${objects.length}. Rotatable: ${rotatable.length}.`,
          rotatable.map((object) => object.name)
        );
      })
      .catch((error) => {
        console.error('[BackgroundSpline] Failed to load scene:', error);
      });

    return () => {
      cancelled = true;
      try {
        app.dispose();
      } catch {
        // ignore
      }
      appRef.current = null;
      snapshotsRef.current = [];
    };
  }, []);

  useMotionValueEvent(smooth, 'change', (progress) => {
    const snapshots = snapshotsRef.current;
    if (snapshots.length === 0) return;

    const spin = -progress * SPIN_RANGE;

    for (const { object, rotation } of snapshots) {
      object.rotation.y = rotation.y + spin;
    }
  });

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-0 overflow-hidden bg-[#06070A]"
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_25%,rgba(59,130,246,0.22),transparent_45%),radial-gradient(circle_at_20%_75%,rgba(16,185,129,0.12),transparent_40%)]" />

      <motion.div
        style={{
          y: parallaxY,
          scale: parallaxScale,
          opacity: parallaxOpacity,
        }}
        className="absolute inset-0 will-change-transform"
      >
        <canvas
          ref={canvasRef}
          className="block h-full w-full"
        />
      </motion.div>

      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(6,7,10,0)_0%,rgba(6,7,10,0)_45%,rgba(6,7,10,0.55)_100%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_40%,rgba(6,7,10,0.55)_100%)]" />
    </div>
  );
}
