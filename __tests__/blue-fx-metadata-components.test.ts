import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { BlueFxReference } from '@/lib/blue-fx-reference';
import type { AccountWithBalance } from '@/lib/services/accounts';
import BlueFxReferenceDetails from '@/components/ui/BlueFxReferenceDetails';
import AccountBalanceEquivalents from '@/components/accounts/AccountBalanceEquivalents';
import NetWorthHero from '@/components/dashboard/NetWorthHero';

const reference: BlueFxReference = {
  type: 'blue', side: 'sell', rate: 1300, observedAt: '2026-10-13T11:59:00.000Z',
  provider: 'criptoya', origin: 'provider',
};
const account = {
  id: 'synthetic-account', currency: 'USD', balance: 100, balance_usd: 100,
  balance_ars_blue: 130000, blueReference: reference,
} as AccountWithBalance;

describe('RF02/RF03 rendered blue provenance (SSR, browser acceptance is separate)', () => {
  it('shows the exact type, side, rate, provider and source time', () => {
    const html = renderToStaticMarkup(createElement(BlueFxReferenceDetails, { reference }));
    expect(html).toContain('dólar blue venta');
    expect(html).toContain('1 USD = ARS 1.300,00');
    expect(html).toContain('Fuente: criptoya');
    expect(html).toContain('dateTime="2026-10-13T11:59:00.000Z"');
    expect(html).toContain('UTC');
    expect(html).not.toContain('en vivo');
  });
  it('does not infer an external provider or current date for persisted rows', () => {
    const html = renderToStaticMarkup(createElement(BlueFxReferenceDetails, { reference: {
      ...reference, provider: null, observedAt: null, origin: 'persisted',
    } }));
    expect(html).toContain('Cotización guardada');
    expect(html).toContain('proveedor original no informado');
    expect(html).toContain('Fecha: no informada');
    expect(html).not.toContain('criptoya');
    expect(html).not.toContain('<time');
  });
  it('keeps a legacy missing reference explicit', () => {
    const html = renderToStaticMarkup(createElement(BlueFxReferenceDetails));
    expect(html).toContain('tasa, fuente y fecha no informadas');
    expect(html).not.toContain('1 USD');
  });
  it('renders account USD100 as ARS130000 with the matching detailed conversion reference', () => {
    const html = renderToStaticMarkup(createElement(AccountBalanceEquivalents, { account, variant: 'detail' }));
    expect(html).toContain('130.000 ARS');
    expect(html).toContain('1 USD = ARS 1.300,00');
    expect(html).toContain('Fuente: criptoya');
    expect(html).toContain('dateTime="2026-10-13T11:59:00.000Z"');
    expect(html).not.toContain('MEP');
  });
  it('labels other currencies as an FX leg without attributing metadata to the whole cross', () => {
    const html = renderToStaticMarkup(createElement(AccountBalanceEquivalents, {
      account: { ...account, currency: 'EUR' }, variant: 'detail',
    }));
    expect(html).toContain('Tramo USD/ARS (otros cruces no incluidos)');
  });
  it('keeps account and portfolio references separate when the aggregate uses different samples', () => {
    const html = renderToStaticMarkup(createElement(NetWorthHero, {
      now: {
        liquidUSD: 100, investmentsUSD: 100, totalUSD: 200, totalARSBlue: 270000, blueRate: 1400,
        blueReferences: [
          { component: 'accounts', reference },
          { component: 'portfolio', reference: { ...reference, rate: 1400, provider: null, origin: 'persisted' } },
        ],
      }, history: [], inflacion: [],
    }));
    expect(html).toContain('Cuentas · tramo USD/ARS');
    expect(html).toContain('Posiciones · tramo USD/ARS');
    expect(html).toContain('1 USD = ARS 1.300,00');
    expect(html).toContain('1 USD = ARS 1.400,00');
    expect(html).toContain('Fuente: criptoya');
    expect(html).toContain('Cotización guardada');
    expect(html).toContain('Cada componente conserva su referencia');
    expect(html).toContain('el historial no conserva la fuente ni la fecha de la cotización');
  });
});
