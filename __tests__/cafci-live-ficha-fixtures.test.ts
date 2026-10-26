import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseCafciHtmlFicha, parseCafciHtmlFichaDetailed } from '@/lib/market-data/cafci-html';

const fixtures = join(dirname(fileURLToPath(import.meta.url)), 'fixtures/cafci');

const LIVE = [
  {
    file: '227-784.html',
    fondoId: '227',
    claseId: '784',
    price: 1241.954039,
    monedaLabel: 'Peso Argentina',
  },
  {
    file: '622-1255.html',
    fondoId: '622',
    claseId: '1255',
    price: 179.598356,
    monedaLabel: 'Peso Argentina',
  },
  {
    file: '1570-5100.html',
    fondoId: '1570',
    claseId: '5100',
    price: 1.097744,
    monedaLabel: 'Dolar Estadounidense',
  },
  {
    file: '750-1645.html',
    fondoId: '750',
    claseId: '1645',
    price: 1.348784,
    monedaLabel: 'Dolar Estadounidense',
  },
] as const;

describe('live CAFCI ficha fixtures (captured 2026-10-26)', () => {
  it.each(LIVE)('$fondoId/$claseId parses por-cada-cuotaparte, 23/10/2026 and currency', (row) => {
    const html = readFileSync(join(fixtures, row.file), 'utf8');
    const result = parseCafciHtmlFichaDetailed(html, { fondoId: row.fondoId, claseId: row.claseId });
    expect(result.parsed).toMatchObject({
      price: row.price,
      fondoId: row.fondoId,
      claseId: row.claseId,
      timestamp: '2026-10-23T03:00:00.000Z',
      monedaLabel: row.monedaLabel,
    });
    expect(parseCafciHtmlFicha(html)?.price).toBeCloseTo(row.price, 8);
  });

  it('skips live HTML whose form or #cuotaparte is wrapped in <template>', () => {
    const html = readFileSync(join(fixtures, '227-784.html'), 'utf8');
    expect(parseCafciHtmlFichaDetailed(`<html><body><template>${html}</template></body></html>`, {
      fondoId: '227', claseId: '784',
    }).parsed).toBeNull();
    expect(parseCafciHtmlFichaDetailed(
      html.replace('<form', '<template><form').replace('</form>', '</form></template>'),
      { fondoId: '227', claseId: '784' },
    ).parsed).toBeNull();
    expect(parseCafciHtmlFichaDetailed(
      html.replace('<div id="cuotaparte"', '<template><div id="cuotaparte"'),
      { fondoId: '227', claseId: '784' },
    ).parsed).toBeNull();
  });

  it('skips a live ficha whose identity form is inside <svg>', () => {
    const html = readFileSync(join(fixtures, '227-784.html'), 'utf8');
    expect(parseCafciHtmlFichaDetailed(
      html.replace('<form method="get"', '<svg><form method="get"').replace('</form>', '</form></svg>'),
      { fondoId: '227', claseId: '784' },
    ).parsed).toBeNull();
  });

  it('skips a live ficha whose identity form is inside <math>', () => {
    const html = readFileSync(join(fixtures, '227-784.html'), 'utf8');
    expect(parseCafciHtmlFichaDetailed(
      html.replace('<form method="get"', '<math><form method="get"').replace('</form>', '</form></math>'),
      { fondoId: '227', claseId: '784' },
    ).parsed).toBeNull();
  });

  it('skips a live ficha whose NAV paragraph is inside <noscript>', () => {
    const html = readFileSync(join(fixtures, '227-784.html'), 'utf8');
    expect(parseCafciHtmlFichaDetailed(
      html.replace(
        '<p>Valor por cada cuotaparte: 1.241,954039</p>',
        '<noscript><p>Valor por cada cuotaparte: 1.241,954039</p></noscript>',
      ),
      { fondoId: '227', claseId: '784' },
    ).parsed).toBeNull();
  });

  it.each(['script', 'style', 'noscript'] as const)(
    'skips a live ficha whose Valores al date is only inside <%s>',
    (tag) => {
      const html = readFileSync(join(fixtures, '227-784.html'), 'utf8');
      expect(parseCafciHtmlFichaDetailed(
        html.replace(
          '<h3>Valores al 23/10/2026</h3>',
          `<h3><${tag}>Valores al 23/10/2026</${tag}></h3>`,
        ),
        { fondoId: '227', claseId: '784' },
      ).parsed).toBeNull();
    },
  );
});
