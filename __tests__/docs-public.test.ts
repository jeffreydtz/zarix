import { describe, expect, it } from 'vitest';
import { DOCS_PAGES, docsNav, findDocsPage } from '@/lib/docs/content';
import { isPublicAppPath } from '@/lib/auth/public-paths';

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

  it('is public without login while private app pages still require a session', () => {
    expect(isPublicAppPath('/docs')).toBe(true);
    expect(isPublicAppPath('/docs/tokens-api')).toBe(true);
    expect(isPublicAppPath('/login')).toBe(true);
    expect(isPublicAppPath('/dashboard')).toBe(false);
    expect(isPublicAppPath('/settings')).toBe(false);
    expect(isPublicAppPath('/settings/integraciones')).toBe(false);
    expect(isPublicAppPath('/pendientes')).toBe(false);
  });
});
