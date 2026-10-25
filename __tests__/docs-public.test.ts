import { readFileSync } from 'node:fs';
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
    expect(blob).toMatch(/\/api\/mcp/);
    expect(blob).toMatch(/\/api\/v1/);
    expect(blob).toMatch(/Idempotency-Key/);
    expect(blob).toMatch(/confirm=true/);
    expect(blob).not.toMatch(/segunda etapa/);
    expect(blob.toLowerCase()).not.toContain('@hotmail.com');
    expect(docsNav().every((n) => n.href.startsWith('/docs'))).toBe(true);
    expect(findDocsPage('nope')).toBeUndefined();
    expect(blob).toMatch(/Idempotency-Key/);
    expect(blob).toMatch(/autoConfirmed/);
  });

  it('is public without login while private app pages still require a session', () => {
    expect(isPublicAppPath('/docs')).toBe(true);
    expect(isPublicAppPath('/docs/tokens-api')).toBe(true);
    expect(isPublicAppPath('/login')).toBe(true);
    expect(isPublicAppPath('/dashboard')).toBe(false);
    expect(isPublicAppPath('/settings')).toBe(false);
    expect(isPublicAppPath('/settings/integraciones')).toBe(false);
    expect(isPublicAppPath('/pendientes')).toBe(false);
    expect(isPublicAppPath('/api/v1/openapi.json')).toBe(true);
  });

  it('documents auto-confirm identity, returned status, and limiter 503', () => {
    const panel = readFileSync('components/settings/IntegrationsPanel.tsx', 'utf8');
    expect(panel).toMatch(/Idempotency-Key/);
    expect(panel).toMatch(/autoConfirmed/);
    const readme = readFileSync('supabase/manual/README.md', 'utf8');
    expect(readme).toMatch(/HTTP 503/);
    expect(readme).not.toMatch(/fail-closed with HTTP 429/);
    const check = readFileSync('supabase/migrations/20261024190000_pat_rls_confirm_quotes.sql', 'utf8');
    expect(check).toMatch(/uncertain/);
  });
});
