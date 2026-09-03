import { describe, it, expect } from 'vitest';
import {
  accountsService,
  patchChangesLockedCurrencySettings,
} from '@/lib/services/accounts';

function current(overrides: Partial<{
  currency: string;
  is_multicurrency: boolean;
  secondary_currency: string | null;
}> = {}) {
  return {
    currency: 'ARS',
    is_multicurrency: false,
    secondary_currency: null as string | null,
    ...overrides,
  };
}

describe('patchChangesLockedCurrencySettings', () => {
  it('ignores the edit-modal payload when currency settings did not change', () => {
    const row = accountsService.sanitizeAccountPatch({
      name: 'Brubank',
      type: 'bank',
      currency: 'ARS',
      is_multicurrency: false,
      secondary_currency: null,
    });

    expect(patchChangesLockedCurrencySettings(current(), row)).toBe(false);
  });

  it('ignores repeating the same currency in a different case', () => {
    const row = accountsService.sanitizeAccountPatch({ currency: 'ars' });
    expect(patchChangesLockedCurrencySettings(current({ currency: 'ARS' }), row)).toBe(false);
  });

  it('detects a real currency change', () => {
    const row = accountsService.sanitizeAccountPatch({ currency: 'USD' });
    expect(patchChangesLockedCurrencySettings(current({ currency: 'ARS' }), row)).toBe(true);
  });

  it('detects enabling or disabling multicurrency', () => {
    const enable = accountsService.sanitizeAccountPatch({ is_multicurrency: true });
    expect(patchChangesLockedCurrencySettings(current(), enable)).toBe(true);

    const disable = accountsService.sanitizeAccountPatch({ is_multicurrency: false });
    expect(
      patchChangesLockedCurrencySettings(current({ is_multicurrency: true }), disable)
    ).toBe(true);
  });

  it('detects a secondary currency change on a bimoneda card', () => {
    const row = accountsService.sanitizeAccountPatch({ secondary_currency: 'EUR' });
    expect(
      patchChangesLockedCurrencySettings(
        current({ is_multicurrency: true, secondary_currency: 'USD' }),
        row
      )
    ).toBe(true);
  });

  it('treats empty secondary currency as unchanged null', () => {
    const row = accountsService.sanitizeAccountPatch({ secondary_currency: '' });
    expect(patchChangesLockedCurrencySettings(current(), row)).toBe(false);
  });
});
