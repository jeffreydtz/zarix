import { describe, it, expect } from 'vitest';
import { rateLimitAllow } from '@/lib/rate-limit';

describe('rateLimitAllow', () => {
  it('allows up to max then denies inside the window', () => {
    const key = `test-${Date.now()}-${Math.random()}`;
    expect(rateLimitAllow(key, 2, 60_000)).toBe(true);
    expect(rateLimitAllow(key, 2, 60_000)).toBe(true);
    expect(rateLimitAllow(key, 2, 60_000)).toBe(false);
  });
});
