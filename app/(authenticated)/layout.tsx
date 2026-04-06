import Navigation from '@/components/Navigation';

export default function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-dvh flex flex-col">
      <Navigation />
      <div className="flex-1 w-full min-w-0 pb-mobile-nav">{children}</div>
    </div>
  );
}
