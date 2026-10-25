import Link from 'next/link';
import { docsNav } from '@/lib/docs/content';

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  const nav = docsNav();
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <Link href="/" className="font-semibold text-primary">
            Zarix
          </Link>
          <nav className="flex gap-4 text-sm text-muted-foreground">
            <Link href="/docs">Docs</Link>
            <Link href="/login">Entrar</Link>
          </nav>
        </div>
      </header>
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-8 lg:grid-cols-[220px_1fr]">
        <aside>
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Documentación</p>
          <ul className="space-y-1 text-sm">
            {nav.map((item) => (
              <li key={item.href}>
                <Link href={item.href} className="block rounded-lg px-2 py-1.5 hover:bg-surface-soft">
                  {item.title}
                </Link>
              </li>
            ))}
          </ul>
        </aside>
        <main className="min-w-0">{children}</main>
      </div>
    </div>
  );
}
