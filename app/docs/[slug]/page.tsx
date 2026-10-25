import { notFound } from 'next/navigation';
import { DOCS_PAGES, findDocsPage } from '@/lib/docs/content';
import { DocsArticle } from '@/components/docs/DocsArticle';

export function generateStaticParams() {
  return DOCS_PAGES.filter((p) => p.slug).map((p) => ({ slug: p.slug }));
}

export default async function DocsSlugPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = findDocsPage(slug);
  if (!page) notFound();
  return <DocsArticle page={page} />;
}
