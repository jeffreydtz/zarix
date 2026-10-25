import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const captured = vi.hoisted(() => ({
  update: null as Record<string, unknown> | null,
  select: '' as string,
  rpc: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createServiceClientSync: () => ({
    rpc: captured.rpc,
    from: () => ({
      select: (cols: string) => {
        captured.select = cols;
        return {
          eq: () => ({
            maybeSingle: async () => ({
              data: {
                gemini_api_key_enc: captured.update?.gemini_api_key_enc ?? null,
              },
            }),
            single: async () => ({
              data: {
                gemini_api_key_enc: captured.update?.gemini_api_key_enc ?? null,
              },
            }),
          }),
        };
      },
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
  getUserSecret,
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
    captured.select = '';
    captured.rpc.mockReset();
    captured.rpc.mockResolvedValue({ data: null, error: { message: 'zarix_vault_unavailable' } });
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

  it('reads only the encrypted column, never the plaintext secret', async () => {
    process.env.ZARIX_SECRETS_MASTER_KEY = KEY;
    await getUserSecret(FIXTURE_A, 'gemini_api_key');
    expect(captured.select).toBe('gemini_api_key_enc');
    expect(captured.select).not.toMatch(/(^|,\s*)gemini_api_key(\s|,|$)/);
    expect(captured.select).not.toContain('telegram_bot_token,');
  });

  it('does not fall back to plaintext when a vault pointer is present', async () => {
    captured.update = { gemini_api_key_enc: 'vault:v1:00000000-0000-4000-8000-000000000001' };
    captured.rpc.mockResolvedValue({ data: null, error: { message: 'zarix_vault_unavailable' } });
    await expect(getUserSecret(FIXTURE_A, 'gemini_api_key')).resolves.toBeNull();
    expect(captured.select).toBe('gemini_api_key_enc');
  });
});
