'use client';

import { useServiceWorker } from '@/lib/hooks/useServiceWorker';

export default function ClientProviders({ children }: { children: React.ReactNode }) {
  useServiceWorker();
  return <>{children}</>;
}
