import Navigation from '@/components/Navigation';
import OfflineReferenceWarmup from '@/components/OfflineReferenceWarmup';

export default function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col h-dvh max-h-dvh min-h-0 overflow-hidden md:h-auto md:max-h-none md:min-h-dvh md:overflow-visible">
      <OfflineReferenceWarmup />
      <Navigation>{children}</Navigation>
    </div>
  );
}
