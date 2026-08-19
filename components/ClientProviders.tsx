'use client';

import { ThemeProvider } from '@/components/ThemeProvider';
import { ConfirmProvider } from '@/components/ui/ConfirmDialog';
import { useServiceWorker } from '@/lib/hooks/useServiceWorker';

export default function ClientProviders({ children }: { children: React.ReactNode }) {
  useServiceWorker();

  return (
    <ThemeProvider>
      <ConfirmProvider>{children}</ConfirmProvider>
    </ThemeProvider>
  );
}
