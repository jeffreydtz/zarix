import { describe, expect, it } from 'vitest';
import { parseWalletPayload, parseWalletText } from '@/lib/integrations/wallet-parse';
import { redactAuditMetadata } from '@/lib/integrations/audit';
import { encryptSecret, decryptSecret, secretLooksEncrypted } from '@/lib/secrets/user-secrets';
import { assertSameOrigin } from '@/lib/auth/origin';
import { ApiError } from '@/lib/api-handler';

describe('wallet parser', () => {
  it('reads structured Apple JSON and tolerates empty amount/merchant', () => {
    const parsed = parseWalletPayload({
      json: { amount: '', merchant: '', cardName: 'Visa Ejemplo', currency: 'ARS', timestamp: '2026-10-24T18:00:00-03:00' },
    });
    expect(parsed.amount).toBeNull();
    expect(parsed.merchant).toBeNull();
    expect(parsed.cardName).toBe('Visa Ejemplo');
    expect(parsed.currency).toBe('ARS');
  });

  it('parses Android notification text without calling a model', () => {
    const parsed = parseWalletText('Compra de $1.250,50 en Ejemplo Café con Visa Galicia');
    expect(parsed.amount).toBe(1250.5);
    expect(parsed.merchant?.toLowerCase()).toContain('ejemplo');
    expect(parsed.currency).toBe('ARS');
  });
});

describe('secrets and audit redaction', () => {
  it('round-trips AES-GCM and never treats envelope:v0 as ciphertext', () => {
    const prev = process.env.ZARIX_SECRETS_MASTER_KEY;
    process.env.ZARIX_SECRETS_MASTER_KEY = 'test-master-key-not-for-production';
    try {
      const plain = 'synthetic-gemini-key-not-real';
      const enc = encryptSecret(plain)!;
      expect(secretLooksEncrypted(enc)).toBe(true);
      expect(decryptSecret(enc)).toBe(plain);
      expect(decryptSecret('envelope:v0:' + Buffer.from(plain, 'utf8').toString('base64'))).toBeNull();
    } finally {
      if (prev === undefined) delete process.env.ZARIX_SECRETS_MASTER_KEY;
      else process.env.ZARIX_SECRETS_MASTER_KEY = prev;
    }
  });

  it('redacts token-like audit metadata', () => {
    const redacted = redactAuditMetadata({ token: 'zrxp_secret', tokenId: 'pat-1', amount: 10, nested: { api_key: 'abc' } });
    expect(redacted.token).toBe('[redacted]');
    expect(redacted.tokenId).toBe('pat-1');
    expect(redacted.amount).toBe(10);
    expect((redacted.nested as { api_key: string }).api_key).toBe('[redacted]');
  });
});

describe('CSRF origin check', () => {
  it('rejects a foreign Origin on cookie mutating routes', () => {
    const req = new Request('http://localhost:3000/api/user/tokens', {
      headers: { host: 'localhost:3000', origin: 'https://evil.example' },
    });
    expect(() => assertSameOrigin(req)).toThrow(ApiError);
  });

  it('allows same-host Origin', () => {
    const req = new Request('http://localhost:3000/api/user/tokens', {
      headers: { host: 'localhost:3000', origin: 'http://localhost:3000' },
    });
    expect(() => assertSameOrigin(req)).not.toThrow();
  });
});
