import { describe, expect, it } from 'vitest';
import { DOCS_PAGES, docsNav, findDocsPage } from '@/lib/docs/content';

describe('public docs', () => {
  it('covers the required Spanish pages without real amounts', () => {
    const slugs = DOCS_PAGES.map((p) => p.slug);
    expect(slugs).toEqual(expect.arrayContaining([
      '', 'funciones', 'telegram', 'apple-wallet', 'android', 'tokens-api', 'mcp', 'gemini', 'privacidad', 'faq',
    ]));
    const blob = JSON.stringify(DOCS_PAGES);
    expect(blob).toMatch(/ejemplo/i);
    expect(blob.toLowerCase()).not.toContain('@hotmail.com');
    expect(docsNav().every((n) => n.href.startsWith('/docs'))).toBe(true);
    expect(findDocsPage('nope')).toBeUndefined();
  });
});
