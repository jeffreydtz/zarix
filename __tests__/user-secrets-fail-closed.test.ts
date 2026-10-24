import { afterEach, describe, expect, it } from 'vitest';
import {
  decryptSecret,
  encryptSecret,
  secretLooksEncrypted,
  SECRETS_UNAVAILABLE_MESSAGE,
} from '@/lib/secrets/user-secrets';

const KEY = 'test-master-key-not-for-production';

describe('user secrets fail closed', () => {
  const prev = process.env.ZARIX_SECRETS_MASTER_KEY;
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
});
