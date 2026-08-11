import { describe, it, expect } from 'vitest';
import { timingSafeStringEqual } from '@/lib/secure-compare';

describe('timingSafeStringEqual', () => {
  it('returns true for equal strings', () => {
    expect(timingSafeStringEqual('s3cr3t-token', 's3cr3t-token')).toBe(true);
  });

  it('returns false for different values of the same length', () => {
    expect(timingSafeStringEqual('aaaaaa', 'aaaaab')).toBe(false);
  });

  it('returns false when lengths differ', () => {
    expect(timingSafeStringEqual('short', 'longer-secret')).toBe(false);
  });

  it('returns false for any null/undefined operand', () => {
    expect(timingSafeStringEqual(null, 'x')).toBe(false);
    expect(timingSafeStringEqual('x', null)).toBe(false);
    expect(timingSafeStringEqual(undefined, 'x')).toBe(false);
    expect(timingSafeStringEqual('x', undefined)).toBe(false);
    expect(timingSafeStringEqual(null, null)).toBe(false);
    expect(timingSafeStringEqual(undefined, undefined)).toBe(false);
  });

  it('treats two empty strings as equal', () => {
    expect(timingSafeStringEqual('', '')).toBe(true);
  });

  it('handles multibyte utf-8 correctly', () => {
    expect(timingSafeStringEqual('café☕', 'café☕')).toBe(true);
    // Same JS string length but different bytes must still be false.
    expect(timingSafeStringEqual('café', 'cafe')).toBe(false);
  });
});
