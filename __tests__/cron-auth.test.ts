import { describe, it, expect } from 'vitest';
import { verifyCronBearer } from '@/lib/cron-auth';

describe('verifyCronBearer', () => {
  it('fails closed when no secret is configured', () => {
    expect(verifyCronBearer('Bearer whatever', undefined)).toBe(false);
    expect(verifyCronBearer('Bearer whatever', '')).toBe(false);
  });

  it('rejects a missing or malformed Authorization header', () => {
    expect(verifyCronBearer(null, 'topsecret')).toBe(false);
    expect(verifyCronBearer('Basic topsecret', 'topsecret')).toBe(false);
    expect(verifyCronBearer('topsecret', 'topsecret')).toBe(false);
  });

  it('rejects a wrong token of different length', () => {
    expect(verifyCronBearer('Bearer nope', 'topsecret')).toBe(false);
  });

  it('rejects a wrong token of equal length', () => {
    // both length 9, same length as the secret but different bytes
    expect(verifyCronBearer('Bearer topSECRET', 'topsecret')).toBe(false);
    expect(verifyCronBearer('Bearer aaaaaaaaa', 'bbbbbbbbb')).toBe(false);
  });

  it('accepts the correct bearer token', () => {
    expect(verifyCronBearer('Bearer topsecret', 'topsecret')).toBe(true);
  });

  it('does not treat the "Bearer " prefix as part of the secret', () => {
    // token after the prefix is empty; secret non-empty -> length mismatch -> false
    expect(verifyCronBearer('Bearer ', 'x')).toBe(false);
  });
});
