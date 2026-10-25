import type { DocsPage } from '@/lib/docs/content';

export function DocsArticle({ page }: { page: DocsPage }) {
  return (
    <article className="max-w-3xl">
      <h1 className="text-3xl font-bold tracking-tight">{page.title}</h1>
      <p className="mt-2 text-muted-foreground">{page.description}</p>
      {page.sections.map((section) => (
        <section key={section.heading} className="mt-8">
          <h2 className="text-xl font-semibold">{section.heading}</h2>
          {section.body.map((p) => (
            <p key={p.slice(0, 40)} className="mt-3 text-sm leading-relaxed text-muted-foreground">
              {p}
            </p>
          ))}
        </section>
      ))}
    </article>
  );
}
