import { describe, it, expect } from 'vitest';
import {
  deriveCustomWebhookHeaderSecret,
  verifyConfiguredSecret,
} from '@/lib/telegram/webhook-auth';

describe('verifyConfiguredSecret', () => {
  it('fails closed on missing or empty expected secret', () => {
    expect(verifyConfiguredSecret('abc', undefined)).toBe(false);
    expect(verifyConfiguredSecret('abc', '')).toBe(false);
    expect(verifyConfiguredSecret('', '')).toBe(false);
    expect(verifyConfiguredSecret(null, 'secret')).toBe(false);
  });

  it('accepts the matching non-empty secret', () => {
    expect(verifyConfiguredSecret('topsecret', 'topsecret')).toBe(true);
  });
});

describe('deriveCustomWebhookHeaderSecret', () => {
  it('falls back to the path secret when no pepper is configured', () => {
    const prev = process.env.TELEGRAM_WEBHOOK_SECRET;
    delete process.env.TELEGRAM_WEBHOOK_SECRET;
    expect(deriveCustomWebhookHeaderSecret('abc123')).toBe('abc123');
    if (prev === undefined) delete process.env.TELEGRAM_WEBHOOK_SECRET;
    else process.env.TELEGRAM_WEBHOOK_SECRET = prev;
  });

  it('differs from the path secret when a pepper is set', () => {
    const prev = process.env.TELEGRAM_WEBHOOK_SECRET;
    process.env.TELEGRAM_WEBHOOK_SECRET = 'pepper-value';
    const derived = deriveCustomWebhookHeaderSecret('abc123');
    expect(derived).not.toBe('abc123');
    expect(derived.length).toBe(64);
    if (prev === undefined) delete process.env.TELEGRAM_WEBHOOK_SECRET;
    else process.env.TELEGRAM_WEBHOOK_SECRET = prev;
  });
});
