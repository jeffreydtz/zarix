import { Suspense } from 'react';
import Navigation from '@/components/Navigation';
import OfflineReferenceWarmup from '@/components/OfflineReferenceWarmup';
import FirstStepsTour from '@/components/onboarding/FirstStepsTour';
import GracePeriodBanner from '@/components/GracePeriodBanner';

/**
 * Layout síncrono a propósito: cualquier await acá retrasa el primer paint
 * de TODAS las rutas autenticadas (el shell no se emite hasta que el layout
 * resuelve). Lo que necesita datos va detrás de Suspense (GracePeriodBanner).
 */
export default function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col h-dvh max-h-dvh min-h-0 overflow-hidden md:h-auto md:max-h-none md:min-h-dvh md:overflow-visible bg-background">
      <OfflineReferenceWarmup />
      <Suspense fallback={null}>
        <GracePeriodBanner />
      </Suspense>
      <Navigation>{children}</Navigation>
      <FirstStepsTour />
    </div>
  );
}
