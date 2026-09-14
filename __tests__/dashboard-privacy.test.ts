import { createElement } from 'react';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import Amount from '@/components/ui/Amount';
import PrivateDetails from '@/components/dashboard/PrivateDetails';

describe('Privacidad antes de hidratación', () => {
  it('no expone monto en texto ni atributo data durante SSR', () => {
    const html = renderToStaticMarkup(createElement(Amount, { value: 987654.32, currency: 'USD', decimals: 2 }));
    expect(html).not.toContain('987');
    expect(html).toContain('••••');
    expect(html).toContain('value=""');
  });
  it('no renderiza detalles financieros legacy ocultos', () => {
    const html = renderToStaticMarkup(createElement(PrivateDetails, { label: 'Cuentas', children: createElement('p', null, 'Saldo privado 123456') }));
    expect(html).not.toContain('123456');
    expect(html).toContain('Mostrar montos');
  });
  it('distingue EUR y cripto de ARS al mostrar cotizaciones públicas', () => {
    expect(renderToStaticMarkup(createElement(Amount, { value: 10, currency: 'EUR', ignorePrivacy: true }))).toContain('€');
    const crypto = renderToStaticMarkup(createElement(Amount, { value: 0.00042, currency: 'BTC', decimals: 8, ignorePrivacy: true }));
    expect(crypto).toContain('BTC');
    expect(crypto).not.toContain('$');
    expect(crypto).toContain('0,00042000');
  });
});
