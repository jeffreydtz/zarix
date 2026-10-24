import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const captured = vi.hoisted(() => ({ update: null as Record<string, unknown> | null }));

vi.mock('@/lib/supabase/server', () => ({
  createServiceClientSync: () => ({
    rpc: vi.fn().mockResolvedValue({ data: null, error: { message: 'zarix_vault_unavailable' } }),
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: {
              gemini_api_key: null,
              gemini_api_key_enc: captured.update?.gemini_api_key_enc ?? null,
            },
          }),
          single: async () => ({
            data: {
              gemini_api_key: null,
              gemini_api_key_enc: captured.update?.gemini_api_key_enc ?? null,
            },
          }),
        }),
      }),
      update: (payload: Record<string, unknown>) => {
        captured.update = payload;
        return { eq: async () => ({ error: null }) };
      },
    }),
  }),
}));

import {
  decryptSecret,
  encryptSecret,
  secretLooksEncrypted,
  setUserSecret,
  SECRETS_UNAVAILABLE_MESSAGE,
} from '@/lib/secrets/user-secrets';

const KEY = 'test-master-key-not-for-production';
const FIXTURE_A = '11111111-1111-4111-8111-111111111111';

describe('user secrets fail closed', () => {
  const prev = process.env.ZARIX_SECRETS_MASTER_KEY;
  beforeEach(() => {
    captured.update = null;
  });
  afterEach(() => {
    if (prev === undefined) delete process.env.ZARIX_SECRETS_MASTER_KEY;
    else process.env.ZARIX_SECRETS_MASTER_KEY = prev;
  });

  it('refuses envelope:v0 and pgp:v1 as ciphertext', () => {
    process.env.ZARIX_SECRETS_MASTER_KEY = KEY;
    const plain = 'synthetic-gemini-key-not-real';
    expect(decryptSecret(`envelope:v0:${Buffer.from(plain).toString('base64')}`)).toBeNull();
    expect(decryptSecret(`pgp:v1:${Buffer.from(plain).toString('base64')}`)).toBeNull();
    expect(secretLooksEncrypted(`envelope:v0:${Buffer.from(plain).toString('base64')}`)).toBe(false);
  });

  it('round-trips AES-GCM only when the master key is set', () => {
    process.env.ZARIX_SECRETS_MASTER_KEY = KEY;
    const plain = 'synthetic-gemini-key-not-real';
    const enc = encryptSecret(plain)!;
    expect(enc.startsWith('aesgcm:v1:')).toBe(true);
    expect(decryptSecret(enc)).toBe(plain);
  });

  it('throws without Vault and without ZARIX_SECRETS_MASTER_KEY', () => {
    delete process.env.ZARIX_SECRETS_MASTER_KEY;
    expect(() => encryptSecret('synthetic-gemini-key-not-real')).toThrow(SECRETS_UNAVAILABLE_MESSAGE);
  });

  it('saves encrypted only and leaves the legacy plaintext column null', async () => {
    process.env.ZARIX_SECRETS_MASTER_KEY = KEY;
    await setUserSecret(FIXTURE_A, 'gemini_api_key', 'synthetic-gemini-key-not-real');
    expect(captured.update).toBeTruthy();
    expect(captured.update?.gemini_api_key).toBeNull();
    expect(String(captured.update?.gemini_api_key_enc || '')).toMatch(/^aesgcm:v1:/);
    expect(JSON.stringify(captured.update)).not.toContain('synthetic-gemini-key-not-real');
  });
});
