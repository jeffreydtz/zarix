import { describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const ingestStatementFile = vi.fn();

vi.mock('@/lib/auth/origin', () => ({
  assertSameOrigin: () => undefined,
}));

vi.mock('@/lib/rate-limit', () => ({
  clientIpFromRequest: () => '127.0.0.1',
  rateLimitAllow: () => true,
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'user-1' } }, error: null }) },
  }),
}));

vi.mock('@/lib/services/statement-ingest', () => ({
  ingestStatementFile: (...args: unknown[]) => ingestStatementFile(...args),
}));

vi.mock('@/lib/integrations/audit', () => ({
  recordIntegrationAudit: vi.fn(async () => undefined),
  auditIpFromRequest: () => null,
  auditUserAgent: () => null,
}));

vi.mock('@/lib/services/accounts', () => ({
  accountsService: { list: async () => [] },
}));

describe('POST /api/ingest/statement', () => {
  it('rejects missing Content-Length before reading the body', async () => {
    ingestStatementFile.mockClear();
    const formData = vi.fn();
    const { POST } = await import('@/app/api/ingest/statement/route');
    const req = new NextRequest('http://localhost/api/ingest/statement', { method: 'POST' });
    Object.defineProperty(req, 'formData', { value: formData });
    const res = await POST(req);
    expect(res.status).toBe(411);
    expect(formData).not.toHaveBeenCalled();
    expect(ingestStatementFile).not.toHaveBeenCalled();
  });

  it('rejects an oversized Content-Length before formData', async () => {
    ingestStatementFile.mockClear();
    const formData = vi.fn();
    const { POST } = await import('@/app/api/ingest/statement/route');
    const req = new NextRequest('http://localhost/api/ingest/statement', {
      method: 'POST',
      headers: { 'content-length': String(5 * 1024 * 1024) },
    });
    Object.defineProperty(req, 'formData', { value: formData });
    const res = await POST(req);
    expect(res.status).toBe(413);
    expect(formData).not.toHaveBeenCalled();
    expect(ingestStatementFile).not.toHaveBeenCalled();
  });
});
