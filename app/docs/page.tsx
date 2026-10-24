import { findDocsPage } from '@/lib/docs/content';
import { DocsArticle } from '@/components/docs/DocsArticle';

export default function DocsIndexPage() {
  const page = findDocsPage('')!;
  return <DocsArticle page={page} />;
}
