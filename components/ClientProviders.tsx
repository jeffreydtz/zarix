'use client';

import { ThemeProvider } from '@/components/ThemeProvider';
import { useServiceWorker } from '@/lib/hooks/useServiceWorker';

export default function ClientProviders({ children }: { children: React.ReactNode }) {
  useServiceWorker();
  return <ThemeProvider>{children}</ThemeProvider>;
}
