// CP3-18 regression for explicit unsupported-currency exclusions.
// Render the real component, with no React, formatting, privacy, or FX mocks.
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import AccountBalanceEquivalents from '@/components/accounts/AccountBalanceEquivalents';
import type { AccountWithBalance } from '@/lib/services/accounts';

type ExcludedAccount = AccountWithBalance & {
  valuationIssue: { currencies: string[]; reason: 'unsupported_currency' };
};

// Both converted fields are deliberately absent. Ten units of ZZZ are original
// money, not ARS10, USD10, or a zero-valued conversion.
const excluded: ExcludedAccount = {
  id: 'synthetic-zzz-account', user_id: 'synthetic-owner', name: 'Cuenta sin cruce',
  type: 'cash', currency: 'ZZZ', balance: 10, icon: null, color: '#3B82F6',
  is_debt: false, include_in_total: true, include_in_liquid: true,
  min_balance: null, credit_limit: null, closing_day: null, due_day: null,
  last_4_digits: null, is_multicurrency: false, secondary_currency: null,
  sort_order: 0, is_active: true,
  created_at: '2026-10-13T12:00:00.000Z', updated_at: '2026-10-13T12:00:00.000Z',
  valuationIssue: { currencies: ['ZZZ'], reason: 'unsupported_currency' },
};
Object.freeze(excluded.valuationIssue.currencies);
Object.freeze(excluded.valuationIssue);
Object.freeze(excluded);

function readableText(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

describe('CP3-18 excluded account equivalents, actual SSR', () => {
  it.each(['default', 'dark', 'detail'] as const)(
    'explains the ZZZ exclusion without inventing a conversion in the %s variant', variant => {
      const html = renderToStaticMarkup(createElement(AccountBalanceEquivalents, {
        account: excluded, variant,
      }));
      const text = readableText(html);

      expect(html).toMatch(/role="(?:alert|status)"/);
      expect(text).toContain('ZZZ');
      expect(text).toMatch(/excluid[ao]/i);
      expect(text).toMatch(/sin (?:cotización|conversión)|no soportad[ao]/i);
      expect(text).not.toMatch(/(?:≈|equivalente)[^.;]*\b0(?:[,.]0+)?\s*(?:ARS|USD)/i);
      expect(text).not.toMatch(/(?:ARS|USD)\s*\$?\s*0(?:[,.]0+)?\b/);
      expect(text).not.toMatch(/(?:NaN|Infinity|undefined|unsupported_currency)/);
      expect(text).not.toContain('1 USD =');
    },
  );

  it('still renders a real conversion for a valued account', () => {
    const html = renderToStaticMarkup(createElement(AccountBalanceEquivalents, {
      account: {
        ...excluded,
        id: 'synthetic-usd-account', currency: 'USD', balance: 10,
        valuationIssue: undefined, balance_usd: 10, balance_ars_blue: 12000,
      },
    }));
    const text = readableText(html);

    expect(text).toContain('12.000 ARS');
    expect(text).not.toMatch(/excluid[ao]|sin cotización/i);
  });
});
