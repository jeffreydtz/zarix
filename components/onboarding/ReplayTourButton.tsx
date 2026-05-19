'use client';

import { useRouter } from 'next/navigation';
import { TOUR_DONE_KEY } from '@/components/onboarding/FirstStepsTour';

export default function ReplayTourButton() {
  const router = useRouter();

  async function replay() {
    try {
      localStorage.removeItem(TOUR_DONE_KEY);
    } catch {
      /* ignore */
    }
    // Resetea también el flag persistido en la DB, antes de volver al dashboard.
    try {
      await fetch('/api/user/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ done: false }),
      });
    } catch {
      /* ignore */
    }
    router.push('/dashboard');
  }

  return (
    <div className="card flex items-center justify-between gap-4">
      <div>
        <h3 className="text-sm font-semibold text-foreground">Tutorial de primeros pasos</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Volvé a ver la guía rápida del dashboard.
        </p>
      </div>
      <button
        type="button"
        onClick={replay}
        className="shrink-0 px-4 py-2 rounded-control text-sm font-semibold text-white bg-blue-500 hover:bg-blue-600 transition-colors"
      >
        Ver de nuevo
      </button>
    </div>
  );
}
