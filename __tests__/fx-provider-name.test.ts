import { describe, expect, it } from 'vitest';
import { formatFxProviderName } from '@/lib/fx-provider-name';

describe('formatFxProviderName', () => {
  it('labels known providers and omits an empty source', () => {
    expect(formatFxProviderName('criptoya')).toBe('CriptoYa');
    expect(formatFxProviderName('dolarapi')).toBe('DolarApi');
    expect(formatFxProviderName('db')).toBe('último valor guardado');
    expect(formatFxProviderName(null)).toBe('');
    expect(formatFxProviderName('  ')).toBe('');
  });
});
