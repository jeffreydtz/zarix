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

  it.each(['hidden', 'aria-hidden="true"', 'style="display:none"', 'style="visibility:hidden"'] as const)(
    'skips a live ficha whose form is wrapped with %s',
    (attr) => {
      const html = readFileSync(join(fixtures, '227-784.html'), 'utf8');
      expect(parseCafciHtmlFichaDetailed(
        html.replace('<form method="get"', `<div ${attr}><form method="get"`).replace('</form>', '</form></div>'),
        { fondoId: '227', claseId: '784' },
      ).parsed).toBeNull();
    },
  );

  it.each(['hidden', 'aria-hidden="true"', 'style="display:none"', 'style="visibility:collapse"'] as const)(
    'skips a live ficha whose #cuotaparte is wrapped with %s',
    (attr) => {
      const html = readFileSync(join(fixtures, '227-784.html'), 'utf8');
      expect(parseCafciHtmlFichaDetailed(
        html.replace('<div id="cuotaparte"', `<div ${attr}><div id="cuotaparte"`),
        { fondoId: '227', claseId: '784' },
      ).parsed).toBeNull();
    },
  );

  it('parses a live ficha whose form is wrapped in a visible <article>', () => {
    const html = readFileSync(join(fixtures, '227-784.html'), 'utf8');
    expect(parseCafciHtmlFichaDetailed(
      html.replace('<form method="get"', '<article><form method="get"').replace('</form>', '</form></article>'),
      { fondoId: '227', claseId: '784' },
    ).parsed).toMatchObject({ price: 1241.954039, fondoId: '227', claseId: '784' });
  });

  const CARRIERS = ['template', 'noscript', 'script', 'style', 'iframe', 'comment'] as const;
  const TAILS: Record<string, { token: string; prefix: string; tail: string; truncated: number }> = {
    '227-784.html': { token: '1.241,954039', prefix: '1.241,95', tail: '4039', truncated: 1241.95 },
    '622-1255.html': { token: '179,598356', prefix: '179,598', tail: '356', truncated: 179.598 },
    '1570-5100.html': { token: '1,097744', prefix: '1,097', tail: '744', truncated: 1.097 },
    '750-1645.html': { token: '1,348784', prefix: '1,348', tail: '784', truncated: 1.348 },
  };

  function carrier(kind: typeof CARRIERS[number], inner: string): string {
    return kind === 'comment' ? `<!--${inner}-->` : `<${kind}>${inner}</${kind}>`;
  }

  it('template, noscript, script, style, iframe and comment tails do not truncate the 4 live fichas', () => {
    const failures: string[] = [];
    let cases = 0;
    for (const row of LIVE) {
      const html = readFileSync(join(fixtures, row.file), 'utf8');
      const split = TAILS[row.file];
      const navLine = `<p>Valor por cada cuotaparte: ${split.token}</p>`;
      const monedaLine = `<li><span class="label">Moneda:</span>         ${row.monedaLabel}</li>`;
      expect(html).toContain(navLine);
      expect(html).toContain(monedaLine);
      for (const kind of CARRIERS) {
        const payload = carrier(kind, split.tail);
        const variants = [
          ['after p', html.replace(navLine, `<p>Valor por cada cuotaparte: ${split.prefix}</p>${payload}`)],
          ['inside p', html.replace(navLine, `<p>Valor por cada cuotaparte: ${split.prefix}${payload}</p>`)],
          ['after moneda', html.replace(monedaLine, `<li><span class="label">Moneda:</span>         ${row.monedaLabel}${carrier(kind, ' Extra')}</li>`)],
        ] as const;
        for (const [where, mutated] of variants) {
          cases += 1;
          const result = parseCafciHtmlFichaDetailed(mutated, { fondoId: row.fondoId, claseId: row.claseId });
          if (result.parsed) {
            failures.push(`${row.file} ${kind} ${where} parsed ${result.parsed.price} ${result.parsed.monedaLabel}`);
          }
          if (result.parsed?.price === split.truncated) {
            failures.push(`${row.file} ${kind} ${where} truncated to ${split.truncated}`);
          }
        }
      }
    }
    expect(cases).toBe(72);
    expect(failures).toEqual([]);
  }, 20_000);

  const DATE_WRAPS: Array<[string, (inner: string) => string]> = [
    ['span display:block', (inner) => `<span style="display:block">${inner}</span>`],
    ['strong', (inner) => `<strong>${inner}</strong>`],
    ['small', (inner) => `<small>${inner}</small>`],
    ['div', (inner) => `<div>${inner}</div>`],
    ['p', (inner) => `<p>${inner}</p>`],
  ];

  it('parses the live date inside span display:block, strong, small, div and p', () => {
    const failures: string[] = [];
    let cases = 0;
    for (const row of LIVE) {
      const html = readFileSync(join(fixtures, row.file), 'utf8');
      const heading = '<h3>Valores al 23/10/2026</h3>';
      expect(html).toContain(heading);
      for (const [name, wrap] of DATE_WRAPS) {
        cases += 1;
        const result = parseCafciHtmlFichaDetailed(html.replace(heading, wrap('Valores al 23/10/2026')), {
          fondoId: row.fondoId,
          claseId: row.claseId,
        });
        if (result.parsed?.price !== row.price || result.parsed.timestamp !== '2026-10-23T03:00:00.000Z' || result.parsed.monedaLabel !== row.monedaLabel) {
          failures.push(`${row.file} ${name} ${result.parsed ? `${result.parsed.price} ${result.parsed.timestamp}` : 'skip'}`);
        }
      }
    }
    expect(cases).toBe(20);
    expect(failures).toEqual([]);
  }, 20_000);

  const CONTROL_DATES = [
    ['literal U+0001', 'Valores al 23/10/2026\u00011'],
    ['decimal entity', 'Valores al 23/10/2026&#1;1'],
    ['hex entity', 'Valores al 23/10/2026&#x1;1'],
    ['U+0002', 'Valores al 23/10/2026\u00021'],
  ] as const;

  it('rejects a source control character in the date instead of saving the prefix', () => {
    const failures: string[] = [];
    let cases = 0;
    for (const row of LIVE) {
      const html = readFileSync(join(fixtures, row.file), 'utf8');
      const heading = '<h3>Valores al 23/10/2026</h3>';
      expect(html).toContain(heading);
      for (const [name, inner] of CONTROL_DATES) {
        cases += 1;
        const result = parseCafciHtmlFichaDetailed(html.replace(heading, `<h3>${inner}</h3>`), {
          fondoId: row.fondoId,
          claseId: row.claseId,
        });
        if (result.parsed) {
          failures.push(`${row.file} ${name} parsed ${result.parsed.price} ${result.parsed.timestamp}`);
        }
      }
      cases += 1;
      const controlInSection = html.replace(
        '<p>Patrimonio bajo administración:',
        '<p>Patrimonio bajo administración:\u0002',
      );
      const sectionResult = parseCafciHtmlFichaDetailed(controlInSection, {
        fondoId: row.fondoId,
        claseId: row.claseId,
      });
      if (sectionResult.parsed) failures.push(`${row.file} U+0002 in section parsed`);
    }
    expect(cases).toBe(20);
    expect(failures).toEqual([]);
  }, 20_000);

  const DATE_SPLITS: Array<[string, string]> = [
    ['br', '<h3>Valores al <br>23/10/2026</h3>'],
    ['span display:block', '<h3>Valores al <span style="display:block">23/10/2026</span></h3>'],
    ['span display:flex', '<h3>Valores al <span style="display:flex">23/10/2026</span></h3>'],
    ['adjacent td', '<table><tr><td>Valores al</td><td>23/10/2026</td></tr></table>'],
  ];

  it('parses a date when only a boundary separates the label from the date', () => {
    const failures: string[] = [];
    let cases = 0;
    for (const row of LIVE) {
      const html = readFileSync(join(fixtures, row.file), 'utf8');
      const heading = '<h3>Valores al 23/10/2026</h3>';
      expect(html).toContain(heading);
      for (const [name, replacement] of DATE_SPLITS) {
        cases += 1;
        const result = parseCafciHtmlFichaDetailed(html.replace(heading, replacement), {
          fondoId: row.fondoId,
          claseId: row.claseId,
        });
        if (result.parsed?.price !== row.price || result.parsed.timestamp !== '2026-10-23T03:00:00.000Z') {
          failures.push(`${row.file} ${name} ${result.parsed ? result.parsed.timestamp : result.reason}`);
        }
      }
    }
    expect(cases).toBe(16);
    expect(failures).toEqual([]);
  }, 20_000);

  const BORROWED_DATES: Array<[string, string]> = [
    ['following p', '<h3>Valores al</h3><p>26/10/2026</p>'],
    ['footer', '<h3>Valores al</h3><footer><p>26/10/2026</p><p>Fecha de publicación del sitio</p></footer>'],
    ['later tr', '<table><tr><td>Valores al</td></tr><tr><td>26/10/2026</td></tr></table>'],
    ['empty td', '<table><tr><td>Valores al</td><td></td><td>26/10/2026</td></tr></table>'],
    ['empty tr', '<table><tr><td>Valores al</td></tr><tr></tr><tr><td>26/10/2026</td></tr></table>'],
    ['two cells away', '<table><tr><td>Valores al</td><td>nota</td><td>26/10/2026</td></tr></table>'],
  ];

  it('does not borrow a date from a later block, row, or empty cell', () => {
    const failures: string[] = [];
    let cases = 0;
    for (const row of LIVE) {
      const html = readFileSync(join(fixtures, row.file), 'utf8');
      const heading = '<h3>Valores al 23/10/2026</h3>';
      for (const [name, replacement] of BORROWED_DATES) {
        cases += 1;
        const result = parseCafciHtmlFichaDetailed(html.replace(heading, replacement), {
          fondoId: row.fondoId,
          claseId: row.claseId,
        });
        if (result.parsed) {
          failures.push(`${row.file} ${name} parsed ${result.parsed.timestamp}`);
        }
      }
    }
    expect(cases).toBe(24);
    expect(failures).toEqual([]);
  }, 20_000);

  it('reads a block-displayed Moneda label from the next line in the same parent', () => {
    const failures: string[] = [];
    for (const row of LIVE) {
      const html = readFileSync(join(fixtures, row.file), 'utf8');
      const needle = `<li><span class="label">Moneda:</span>         ${row.monedaLabel}</li>`;
      expect(html).toContain(needle);
      const blocked = html.replace(
        needle,
        `<li><span class="label" style="display:block">Moneda:</span> ${row.monedaLabel}</li>`,
      );
      const result = parseCafciHtmlFichaDetailed(blocked, { fondoId: row.fondoId, claseId: row.claseId });
      if (result.parsed?.monedaLabel !== row.monedaLabel || result.parsed.price !== row.price) {
        failures.push(`${row.file} ${result.parsed ? result.parsed.monedaLabel : 'skip'}`);
      }
      const control = html.replace(
        needle,
        `<li><span class="label">Moneda:</span>         ${row.monedaLabel}\u0002</li>`,
      );
      if (parseCafciHtmlFichaDetailed(control, { fondoId: row.fondoId, claseId: row.claseId }).parsed) {
        failures.push(`${row.file} U+0002 in Moneda parsed`);
      }
    }
    expect(failures).toEqual([]);
  }, 20_000);

  it.each(LIVE)('$fondoId/$claseId still parses with an identical adjacent Moneda li', (row) => {
    const html = readFileSync(join(fixtures, row.file), 'utf8');
    const needle = `<li><span class="label">Moneda:</span>         ${row.monedaLabel}</li>`;
    expect(html).toContain(needle);
    const duplicated = html.replace(
      needle,
      `${needle}\n            <li><span class="label">Moneda:</span> ${row.monedaLabel}</li>`,
    );
    expect(parseCafciHtmlFichaDetailed(duplicated, {
      fondoId: row.fondoId, claseId: row.claseId,
    }).parsed).toMatchObject({
      price: row.price,
      monedaLabel: row.monedaLabel,
      timestamp: '2026-10-23T03:00:00.000Z',
    });
  });
});
