import type { ReactNode } from 'react';

interface PageScaffoldProps {
  children: ReactNode;
  hero?: ReactNode;
}

export function PageScaffold({ children, hero }: PageScaffoldProps) {
  return (
    <div className="page-shell">
      <div className="page-container">
        {hero}
        {children}
      </div>
    </div>
  );
}

interface PageHeroProps {
  title: string;
  subtitle: string;
  rightSlot?: ReactNode;
  eyebrow?: string;
}

export function PageHero({ title, subtitle, rightSlot, eyebrow }: PageHeroProps) {
  return (
    <header className="page-hero">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-2">
          {eyebrow ? (
            <p className="text-[11px] uppercase tracking-[0.16em] text-primary/80 font-semibold">{eyebrow}</p>
          ) : null}
          <h1 className="page-title text-foreground">{title}</h1>
          <p className="page-subtitle">{subtitle}</p>
        </div>
        {rightSlot ? <div className="shrink-0 lg:pl-6">{rightSlot}</div> : null}
      </div>
    </header>
  );
}
