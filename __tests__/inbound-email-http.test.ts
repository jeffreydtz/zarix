import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/services/inbound-mailbox', () => ({
  inboundEmailConfigured: () => Boolean(process.env.INBOUND_EMAIL_WEBHOOK_SECRET),
  lookupMailboxUserId: vi.fn(async (token: string | null) => (token === 'zrxm_ok' ? 'user-1' : null)),
}));

vi.mock('@/lib/services/statement-ingest', () => ({
  ingestEmailPayload: vi.fn(async () => ({
    parked: 1,
    duplicates: 0,
    installments: 0,
    skipped: 0,
    items: [{ id: 'p1', merchant: 'Café Ejemplo', amount: 10, currency: 'ARS', match: 'none' }],
    parser: 'wallet-text',
  })),
}));

vi.mock('@/lib/integrations/audit', () => ({
  recordIntegrationAudit: vi.fn(async () => undefined),
}));

describe('POST /api/ingest/email', () => {
  beforeEach(() => {
    process.env.INBOUND_EMAIL_WEBHOOK_SECRET = 'inbound-secret-test';
  });

  it('rejects missing secret fail-closed', async () => {
    delete process.env.INBOUND_EMAIL_WEBHOOK_SECRET;
    const { POST } = await import('@/app/api/ingest/email/route');
    const res = await POST(
      new NextRequest('http://localhost/api/ingest/email', {
        method: 'POST',
        body: '{}',
      })
    );
    expect(res.status).toBe(503);
  });

  it('rejects a wrong webhook secret', async () => {
    vi.resetModules();
    process.env.INBOUND_EMAIL_WEBHOOK_SECRET = 'inbound-secret-test';
    const { POST } = await import('@/app/api/ingest/email/route');
    const res = await POST(
      new NextRequest('http://localhost/api/ingest/email', {
        method: 'POST',
        headers: { 'x-inbound-email-secret': 'nope', 'content-type': 'application/json' },
        body: JSON.stringify({ mailboxToken: 'zrxm_ok', text: 'Pagaste $10' }),
      })
    );
    expect(res.status).toBe(401);
  });

  it('parks and never auto-confirms', async () => {
    vi.resetModules();
    process.env.INBOUND_EMAIL_WEBHOOK_SECRET = 'inbound-secret-test';
    const { POST } = await import('@/app/api/ingest/email/route');
    const res = await POST(
      new NextRequest('http://localhost/api/ingest/email', {
        method: 'POST',
        headers: { 'x-inbound-email-secret': 'inbound-secret-test', 'content-type': 'application/json' },
        body: JSON.stringify({ mailboxToken: 'zrxm_ok', messageId: 'm1', text: 'Pagaste $10 en Café Ejemplo' }),
      })
    );
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.autoConfirmed).toBe(false);
    expect(json.parked).toBe(1);
  });
});
