import { describe, expect, it } from 'vitest';
import { parseCafciHtmlFichaDetailed, parseInlineStyleDeclarations } from '@/lib/market-data/cafci-html';
import { parseIolFondosPanel } from '@/lib/market-data/iol-fci-panel';

const DATE = '23/10/2026';
const EXPECTED = { fondoId: '227', claseId: '784' };

function shell(opts: {
  identity?: string;
  nav?: string;
  date?: string;
  moneda?: string;
  extra?: string;
}): string {
  const identity = opts.identity ?? `<form method="get" action="/fondos/227">
    <select name="clase">
      <option value="227">A</option>
      <option value="784" selected>B</option>
    </select>
  </form>`;
  const date = opts.date ?? `<h3>Valores al ${DATE}</h3>`;
  const nav = opts.nav ?? '<p>Valor por cada cuotaparte: 1.241,954039</p>';
  const moneda = opts.moneda ?? '<div id="fichaRight"><span class="label">Moneda:</span> Peso Argentina</div>';
  return `<html><body>
    ${identity}
    <div id="cuotaparte">${date}${nav}</div>
    ${moneda}
    ${opts.extra ?? ''}
  </body></html>`;
}

function parsed(html: string) {
  return parseCafciHtmlFichaDetailed(html, EXPECTED);
}

describe('Codex r3 HTML parser probes — fail closed', () => {
  it('1. spaced value = "227" selected is a second selected option', () => {
    const html = shell({
      identity: `<form method="get" action="/fondos/227">
        <select name="clase">
          <option value="784" selected>B</option>
          <option value = "227" selected>A</option>
        </select>
      </form>`,
    });
    expect(parsed(html).parsed).toBeNull();
  });

  it('2. unquoted value=227 selected is a second selected option', () => {
    const html = shell({
      identity: `<form method="get" action="/fondos/227">
        <select name="clase">
          <option value="784" selected>B</option>
          <option value=227 selected>A</option>
        </select>
      </form>`,
    });
    expect(parsed(html).parsed).toBeNull();
  });

  it('3. conflicting name = "clase" selectors', () => {
    const html = shell({
      extra: `<select name = "clase"><option value="999" selected>X</option></select>`,
    });
    expect(parsed(html).parsed).toBeNull();
  });

  it('4. conflicting action = "/fondos/999" form', () => {
    const html = shell({
      extra: `<form method="get" action = "/fondos/999">
        <select name="clase"><option value="1" selected>Z</option></select>
      </form>`,
    });
    expect(parsed(html).parsed).toBeNull();
  });

  it('5. requested identity only inside <script>…</script >', () => {
    const html = shell({
      identity: `<script>
        document.write('<form action="/fondos/227"><select name="clase"><option value="784" selected>B</option></select></form>');
      </script >`,
    });
    expect(parsed(html).parsed).toBeNull();
  });

  it('6. requested identity only inside <style>…</style >', () => {
    const html = shell({
      identity: `<style>
        form[action="/fondos/227"] select[name="clase"] option[value="784"] { color: red; }
      </style >`,
    });
    expect(parsed(html).parsed).toBeNull();
  });

  it('7. nested markup after a NAV prefix is not a truncated write', () => {
    const html = shell({ nav: '<p>Valor por cada cuotaparte: 1,09<span>x7744</span></p>' });
    expect(parsed(html).parsed).toBeNull();
  });

  it('8. entity-decoded junk is not a truncated write', () => {
    const html = shell({ nav: '<p>Valor por cada cuotaparte: 1,09&lt;x7744&gt;</p>' });
    expect(parsed(html).parsed).toBeNull();
  });

  it('9. conflicting Valores al labels', () => {
    const html = shell({ date: `<h3>Valores al ${DATE}</h3><h3>Valores al 01/01/2020</h3>` });
    expect(parsed(html).parsed).toBeNull();
  });

  it('10. Valores al date with trailing junk', () => {
    const html = shell({ date: `<h3>Valores al ${DATE}x</h3>` });
    expect(parsed(html).parsed).toBeNull();
  });

  it('11. ARS currency label followed by USD', () => {
    const html = shell({
      moneda: '<div id="fichaRight"><span class="label">Moneda:</span> Peso Argentina<span class="label">Moneda:</span> Dolar Estadounidense</div>',
    });
    expect(parsed(html).parsed).toBeNull();
  });

  it('12. unpadded 3/4/2026 is not a strict dd/mm/yyyy', () => {
    const html = shell({ date: '<h3>Valores al 3/4/2026</h3>' });
    expect(parsed(html).parsed).toBeNull();
  });

  it('13. identity only in an HTML comment', () => {
    const html = shell({
      identity: `<!-- <form action="/fondos/227"><select name="clase"><option value="784" selected>B</option></select></form> -->`,
    });
    expect(parsed(html).parsed).toBeNull();
  });

  it('14. duplicate cuotaparte values even when they agree', () => {
    const html = shell({
      nav: '<p>Valor por cada cuotaparte: 1.241,954039</p><p>Valor por cada cuotaparte: 1.241,954039</p>',
    });
    expect(parsed(html).parsed).toBeNull();
  });
});

describe('Codex r3 HTML parser probes — working controls', () => {
  it('15. official-shaped ficha with one form, class, NAV, date and currency', () => {
    expect(parsed(shell({})).parsed).toMatchObject({
      price: 1241.954039,
      fondoId: '227',
      claseId: '784',
      timestamp: '2026-10-23T03:00:00.000Z',
    });
  });

  it('16. nested span that completes the NAV is markup inside the number', () => {
    const html = shell({ nav: '<p>Valor por cada cuotaparte: 1<span>,097744</span></p>' });
    expect(parsed(html).parsed).toBeNull();
  });

  it('17. IOL US$ 1<span>,097744</span> is the complete cell value', () => {
    const html = `<table><tr>
      <td><a data-symbol="IOLDOLD">IOLDOLD</a></td>
      <td class="text-right">US$ 1<span>,097744</span></td>
    </tr></table>`;
    expect(parseIolFondosPanel(html).get('IOLDOLD')).toMatchObject({
      price: 1.097744,
      currency: 'USD',
    });
  });
});

describe('Codex r4 HTML parser — #cuotaparte scope and fail-closed NAV', () => {
  it('ignores a #cartera Valores al date when #cuotaparte has one', () => {
    const html = shell({
      extra: `<div id="cartera"><div class="valores">Valores al 02/10/2026</div></div>`,
    });
    expect(parsed(html).parsed).toMatchObject({
      price: 1241.954039,
      timestamp: '2026-10-23T03:00:00.000Z',
    });
  });

  it('skips a comment that completes the NAV token', () => {
    expect(parsed(shell({ nav: '<p>Valor por cada cuotaparte: 1.241<!--,954039--></p>' })).parsed).toBeNull();
    expect(parsed(shell({ nav: '<p>Valor por cada cuotaparte: 1<!--,097744--></p>' })).parsed).toBeNull();
  });

  it('counts a trailing-slash /fondos/999/ action as a second fund form', () => {
    const html = shell({
      extra: `<form method="get" action="/fondos/999/">
        <select name="other"><option value="1" selected>Z</option></select>
      </form>`,
    });
    expect(parsed(html).parsed).toBeNull();
  });

  it('rejects a selected option inside a disabled optgroup', () => {
    const html = shell({
      identity: `<form method="get" action="/fondos/227">
        <select name="clase">
          <optgroup disabled>
            <option value="784" selected>B</option>
          </optgroup>
          <option value="227">A</option>
        </select>
      </form>`,
    });
    expect(parsed(html).parsed).toBeNull();
  });

  it('rejects duplicated option value attributes', () => {
    const html = shell({
      identity: `<form method="get" action="/fondos/227">
        <select name="clase">
          <option value="784" selected>B</option>
          <option value="784">Also B</option>
        </select>
      </form>`,
    });
    expect(parsed(html).parsed).toBeNull();
  });
});

describe('Codex r5 HTML parser — parse5 fail-closed identity and cross-checks', () => {
  it('skips identity that exists only inside an iframe', () => {
    const html = shell({
      identity: `<iframe>
        <form method="get" action="/fondos/227">
          <select name="clase">
            <option value="227">A</option>
            <option value="784" selected>B</option>
          </select>
        </form>
      </iframe>`,
    });
    expect(parsed(html).parsed).toBeNull();
  });

  it('skips a NAV whose whole-block text concatenates a split span', () => {
    const html = shell({
      nav: '<span>Valor por cada cuotaparte: 1,09</span><span>7744</span>',
    });
    expect(parsed(html).parsed).toBeNull();
  });

  it('skips an ancestor NAV 1,20 over a child 1,09', () => {
    const html = shell({
      nav: '<div>Valor por cada cuotaparte: 1,20<p>Valor por cada cuotaparte: 1,09</p></div>',
    });
    expect(parsed(html).parsed).toBeNull();
  });

  it('skips a conflicting 01/01/2020 date anywhere in #cuotaparte', () => {
    const html = shell({
      date: `<h3>Valores al ${DATE}</h3><p>al 01/01/2020</p>`,
    });
    expect(parsed(html).parsed).toBeNull();
  });

  it('skips when an ancestor Moneda: USD disagrees with chosen ARS', () => {
    const html = shell({
      moneda: `<div id="fichaRight"><div>Moneda: Dolar Estadounidense
        <span class="label">Moneda:</span> Peso Argentina
      </div></div>`,
    });
    expect(parsed(html).parsed).toBeNull();
  });

  it('skips a script node that completes the NAV token', () => {
    expect(parsed(shell({
      nav: '<p>Valor por cada cuotaparte: 1<script>,097744</script></p>',
    })).parsed).toBeNull();
  });

  it('rejects a disabled selected option', () => {
    const html = shell({
      identity: `<form method="get" action="/fondos/227">
        <select name="clase">
          <option value="227">A</option>
          <option value="784" selected disabled>B</option>
        </select>
      </form>`,
    });
    expect(parsed(html).parsed).toBeNull();
  });

  it('rejects a disabled class select', () => {
    const html = shell({
      identity: `<form method="get" action="/fondos/227">
        <select name="clase" disabled>
          <option value="227">A</option>
          <option value="784" selected>B</option>
        </select>
      </form>`,
    });
    expect(parsed(html).parsed).toBeNull();
  });

  it('rejects a disabled fieldset around the identity form', () => {
    const html = shell({
      identity: `<fieldset disabled>
        <form method="get" action="/fondos/227">
          <select name="clase">
            <option value="227">A</option>
            <option value="784" selected>B</option>
          </select>
        </form>
      </fieldset>`,
    });
    expect(parsed(html).parsed).toBeNull();
  });
});

describe('Codex r6 / Kael HTML parser — template, NAV boundary, #fichaRight, legend', () => {
  it('skips identity that exists only inside <template>', () => {
    const html = shell({
      identity: `<template>
        <form method="get" action="/fondos/227">
          <select name="clase">
            <option value="227">A</option>
            <option value="784" selected>B</option>
          </select>
        </form>
      </template>`,
    });
    expect(parsed(html).parsed).toBeNull();
  });

  it('skips #cuotaparte that exists only inside <template>', () => {
    const html = `<html><body>
      <form method="get" action="/fondos/227">
        <select name="clase">
          <option value="227">A</option>
          <option value="784" selected>B</option>
        </select>
      </form>
      <template>
        <div id="cuotaparte"><h3>Valores al ${DATE}</h3><p>Valor por cada cuotaparte: 1.241,954039</p></div>
      </template>
      <div id="fichaRight"><span class="label">Moneda:</span> Peso Argentina</div>
    </body></html>`;
    expect(parsed(html).parsed).toBeNull();
  });

  it('skips when form and #cuotaparte are inside <template>', () => {
    const html = `<html><body>
      <template>
        <form method="get" action="/fondos/227">
          <select name="clase">
            <option value="227">A</option>
            <option value="784" selected>B</option>
          </select>
        </form>
        <div id="cuotaparte"><h3>Valores al ${DATE}</h3><p>Valor por cada cuotaparte: 1.241,954039</p></div>
      </template>
      <div id="fichaRight"><span class="label">Moneda:</span> Peso Argentina</div>
    </body></html>`;
    expect(parsed(html).parsed).toBeNull();
  });

  it('skips a live-shaped ficha wrapped in <template>', () => {
    const html = `<html><body><template>${shell({})}</template></body></html>`;
    expect(parsed(html).parsed).toBeNull();
  });

  it('skips a split NAV whose next whole-block character is alphanumeric', () => {
    const html = shell({
      nav: '<span>Valor por cada cuotaparte: 1,09</span><span>x7744</span>',
    });
    expect(parsed(html).parsed).toBeNull();
  });

  it('skips when Moneda is only outside #fichaRight', () => {
    const html = shell({
      moneda: '<span class="label">Moneda:</span> Peso Argentina',
    });
    expect(parsed(html).parsed).toBeNull();
  });

  it('skips a disabled fieldset first-legend identity because fieldset/legend are not allowlisted', () => {
    const html = shell({
      identity: `<fieldset disabled>
        <legend>
          <form method="get" action="/fondos/227">
            <select name="clase">
              <option value="227">A</option>
              <option value="784" selected>B</option>
            </select>
          </form>
        </legend>
      </fieldset>`,
    });
    expect(parsed(html).parsed).toBeNull();
  });
});

describe('Codex r7 HTML parser — HTML-namespace allowlist by construction', () => {
  it('skips identity that exists only inside <svg>', () => {
    const html = shell({
      identity: `<svg>
        <form method="get" action="/fondos/227">
          <select name="clase">
            <option value="227">A</option>
            <option value="784" selected>B</option>
          </select>
        </form>
      </svg>`,
    });
    expect(parsed(html).parsed).toBeNull();
  });

  it('skips identity that exists only inside <math>', () => {
    const html = shell({
      identity: `<math>
        <form method="get" action="/fondos/227">
          <select name="clase">
            <option value="227">A</option>
            <option value="784" selected>B</option>
          </select>
        </form>
      </math>`,
    });
    expect(parsed(html).parsed).toBeNull();
  });

  it('skips identity inside svg foreignObject (HTML-ns form with svg ancestors)', () => {
    const html = shell({
      identity: `<svg><foreignObject>
        <form method="get" action="/fondos/227">
          <select name="clase">
            <option value="227">A</option>
            <option value="784" selected>B</option>
          </select>
        </form>
      </foreignObject></svg>`,
    });
    expect(parsed(html).parsed).toBeNull();
  });

  it('skips a NAV that exists only inside <noscript>', () => {
    const html = shell({
      nav: '<noscript><p>Valor por cada cuotaparte: 1.241,954039</p></noscript>',
    });
    expect(parsed(html).parsed).toBeNull();
  });

  it.each(['script', 'style', 'noscript'] as const)(
    'skips a Valores al date that exists only inside <%s> in the h3',
    (tag) => {
      const html = shell({
        date: `<h3><${tag}>Valores al ${DATE}</${tag}></h3>`,
      });
      expect(parsed(html).parsed).toBeNull();
    },
  );

  it('skips a NAV whose next character is a Unicode letter or digit', () => {
    expect(parsed(shell({ nav: '<p>Valor por cada cuotaparte: 1,09٤</p>' })).parsed).toBeNull();
    expect(parsed(shell({ nav: '<p>Valor por cada cuotaparte: 1,09β</p>' })).parsed).toBeNull();
    expect(parsed(shell({ nav: '<p>Valor por cada cuotaparte: 1,09²</p>' })).parsed).toBeNull();
  });

  it('skips when #fichaRight has a Moneda substring instead of an exact Moneda: text node', () => {
    const html = shell({
      moneda: '<div id="fichaRight"><span>La Moneda: Peso Argentina</span></div>',
    });
    expect(parsed(html).parsed).toBeNull();
  });

  it('counts identical duplicate Moneda: labels with the same value as one', () => {
    const html = shell({
      moneda: `<div id="fichaRight">
        <span class="label">Moneda:</span> Peso Argentina
        <span class="label">Moneda:</span> Peso Argentina
      </div>`,
    });
    expect(parsed(html).parsed).toMatchObject({
      price: 1241.954039,
      monedaLabel: 'Peso Argentina',
    });
  });

  it('still skips conflicting duplicate Moneda: labels', () => {
    const html = shell({
      moneda: `<div id="fichaRight">
        <span class="label">Moneda:</span> Peso Argentina
        <span class="label">Moneda:</span> Dolar Estadounidense
      </div>`,
    });
    expect(parsed(html).parsed).toBeNull();
  });
});

const WRAPPERS = [
  'article', 'aside', 'nav', 'footer', 'h2', 'em', 'small', 'a', 'section', 'header',
] as const;

function wrapTag(tag: string, inner: string): string {
  return tag === 'a' ? `<a>${inner}</a>` : `<${tag}>${inner}</${tag}>`;
}

const IDENTITY = `<form method="get" action="/fondos/227">
  <select name="clase">
    <option value="227">A</option>
    <option value="784" selected>B</option>
  </select>
</form>`;

describe('Codex r8 HTML parser — uniqueness, visibility, wrappers, zero-width', () => {
  it.each([
    ['hidden attribute', 'hidden'],
    ['aria-hidden=true', 'aria-hidden="true"'],
    ['inert', 'inert'],
    ['inline display:none', 'style="display:none"'],
    ['inline DISPLAY:None !important', 'style="DISPLAY: None !IMPORTANT"'],
    ['inline visibility:hidden', 'style="visibility: hidden"'],
    ['inline visibility:collapse', 'style="visibility:collapse"'],
    ['last style declaration display:none', 'style="display: block; display: none"'],
  ])('skips identity wrapped with %s', (_name, attr) => {
    const html = shell({ identity: `<div ${attr}>${IDENTITY}</div>` });
    expect(parsed(html).parsed).toBeNull();
  });

  it('skips identity inside a closed details element', () => {
    expect(parsed(shell({ identity: `<details>${IDENTITY}</details>` })).parsed).toBeNull();
  });

  it('skips identity inside a closed dialog element', () => {
    expect(parsed(shell({ identity: `<dialog>${IDENTITY}</dialog>` })).parsed).toBeNull();
  });

  it('skips a hidden NAV plus a visible NAV', () => {
    const html = shell({
      nav: '<p hidden>Valor por cada cuotaparte: 1.300,00</p><p>Valor por cada cuotaparte: 1.241,954039</p>',
    });
    expect(parsed(html).parsed).toBeNull();
  });

  it('skips a hidden date plus a visible date', () => {
    const html = shell({
      date: `<h3 hidden>Valores al 01/01/2020</h3><h3>Valores al ${DATE}</h3>`,
    });
    expect(parsed(html).parsed).toBeNull();
  });

  it('skips a hidden Moneda plus a visible Moneda', () => {
    const html = shell({
      moneda: `<div hidden><span>Moneda:</span> Dolar Estadounidense</div>
        <div id="fichaRight"><span class="label">Moneda:</span> Peso Argentina</div>`,
    });
    expect(parsed(html).parsed).toBeNull();
  });

  it('skips a hidden 227/784 plus a visible 227/227 inside <article>', () => {
    const html = shell({
      identity: `<div hidden>${IDENTITY}</div>
        <article>
          <form method="get" action="/fondos/227">
            <select name="clase">
              <option value="227" selected>A</option>
              <option value="784">B</option>
            </select>
          </form>
        </article>`,
    });
    expect(parsed(html).parsed).toBeNull();
  });

  it.each(WRAPPERS.flatMap((tag) => (['form', 'cuota'] as const).map((place) => ({ tag, place }))))(
    'parses when the $place is wrapped in a visible <$tag>',
    ({ tag, place }) => {
      const html = place === 'form'
        ? shell({ identity: wrapTag(tag, IDENTITY) })
        : `<html><body>
            ${IDENTITY}
            ${wrapTag(tag, `<div id="cuotaparte"><h3>Valores al ${DATE}</h3><p>Valor por cada cuotaparte: 1.241,954039</p></div>`)}
            <div id="fichaRight"><span class="label">Moneda:</span> Peso Argentina</div>
          </body></html>`;
      expect(parsed(html).parsed).toMatchObject({ price: 1241.954039, fondoId: '227', claseId: '784' });
    },
  );

  it.each(WRAPPERS.flatMap((tag) => (['form', 'cuota'] as const).map((place) => ({ tag, place }))))(
    'skips NAV/date/currency conflicts when the $place is wrapped in <$tag>',
    ({ tag, place }) => {
      const form = place === 'form' ? wrapTag(tag, IDENTITY) : IDENTITY;
      const cuotaInner = `<h3>Valores al ${DATE}</h3><p>Valor por cada cuotaparte: 1.241,954039</p>`;
      const cuota = place === 'cuota' ? wrapTag(tag, `<div id="cuotaparte">${cuotaInner}</div>`) : `<div id="cuotaparte">${cuotaInner}</div>`;
      expect(parsed(`<html><body>${form}${cuota}<p hidden>Valor por cada cuotaparte: 1.300,00</p><div id="fichaRight"><span class="label">Moneda:</span> Peso Argentina</div></body></html>`).parsed).toBeNull();
      expect(parsed(`<html><body>${form}${cuota}<h3 hidden>Valores al 01/01/2020</h3><div id="fichaRight"><span class="label">Moneda:</span> Peso Argentina</div></body></html>`).parsed).toBeNull();
      expect(parsed(`<html><body>${form}${cuota}<div hidden><span>Moneda:</span> Dolar Estadounidense</div><div id="fichaRight"><span class="label">Moneda:</span> Peso Argentina</div></body></html>`).parsed).toBeNull();
    },
  );

  it('skips a zero-width format character that joins a truncated NAV in the whole block', () => {
    const html = shell({
      nav: '<p>Valor por cada cuotaparte: 1.241,95<span>\u200B4039</span></p>',
    });
    expect(parsed(html).parsed).toBeNull();
  });

  it('skips a NAV whose next code point is a combining mark or astral digit', () => {
    expect(parsed(shell({ nav: '<p>Valor por cada cuotaparte: 1,09\u0301</p>' })).parsed).toBeNull();
    expect(parsed(shell({ nav: '<p>Valor por cada cuotaparte: 1,09\u{1D7D8}</p>' })).parsed).toBeNull();
  });

  it('skips case-only duplicate cuotaparte ids', () => {
    const html = shell({ extra: '<div id="CuotaParte"><p>Valor por cada cuotaparte: 9,99</p></div>' });
    expect(parsed(html).parsed).toBeNull();
  });

  it('skips content after </html>', () => {
    const html = `${shell({})}\n<div id="cuotaparte"><h3>Valores al 01/01/2020</h3></div>`;
    expect(parsed(html).parsed).toBeNull();
  });

  it('skips a <base href> and a meta refresh', () => {
    expect(parsed(`<html><head><base href="https://evil.example/"></head><body>${shell({}).replace('<html><body>', '').replace('</body></html>', '')}</body></html>`).parsed).toBeNull();
    expect(parsed(`<html><head><meta http-equiv="refresh" content="0;url=https://evil.example/"></head><body>${shell({}).replace('<html><body>', '').replace('</body></html>', '')}</body></html>`).parsed).toBeNull();
  });

  it('does not treat a content:"display:none" substring as hiding', () => {
    const html = shell({ identity: `<div style="content: 'display:none'; color: none">${IDENTITY}</div>` });
    expect(parsed(html).parsed).toMatchObject({ price: 1241.954039 });
  });

  it('treats the last display declaration as winning when it is block', () => {
    const html = shell({ identity: `<div style="display: none; display: block">${IDENTITY}</div>` });
    expect(parsed(html).parsed).toMatchObject({ price: 1241.954039 });
  });
});

describe('Codex r9 HTML parser — unfiltered NAV tail, style comments, !important', () => {
  it('skips a truncated NAV whose tail is in an aria-hidden descendant', () => {
    const html = shell({
      nav: '<p>Valor por cada cuotaparte: 1.241,95<span aria-hidden="true">4039</span></p>',
    });
    expect(parsed(html).parsed).toBeNull();
  });

  it('skips a truncated NAV whose tail is in an inert descendant', () => {
    const html = shell({
      nav: '<p>Valor por cada cuotaparte: 1.241,95<span inert>4039</span></p>',
    });
    expect(parsed(html).parsed).toBeNull();
  });

  it('skips a truncated NAV whose tail is visibility-restored on a descendant', () => {
    const html = shell({
      nav: '<p>Valor por cada cuotaparte: 1.241,95<span style="visibility:hidden"><span style="visibility:visible">4039</span></span></p>',
    });
    expect(parsed(html).parsed).toBeNull();
  });

  it('skips a truncated NAV whose tail is joined by a BOM entity', () => {
    const html = shell({
      nav: '<p>Valor por cada cuotaparte: 1.241,95<span>&#xfeff;4039</span></p>',
    });
    expect(parsed(html).parsed).toBeNull();
  });

  it('skips a BOM sibling suffix so 1300.01 is not saved as 1300', () => {
    const html = shell({
      nav: '<p>Valor por cada cuotaparte: 1300</p><span>\uFEFF.01</span>',
    });
    expect(parsed(html).parsed).toBeNull();
    expect(parsed(html).parsed?.price).not.toBe(1300);
  });

  it.each([
    ['display:/*x*/none', 'display:/*x*/none'],
    ['display:none /*x*/', 'display:none /*x*/'],
    ['!important beating later block', 'display:none!important;display:block'],
  ])('skips identity hidden by %s', (_name, style) => {
    const html = shell({ identity: `<div style="${style}">${IDENTITY}</div>` });
    expect(parsed(html).parsed).toBeNull();
  });

  it('parses CSS comments and !important in inline styles', () => {
    expect(parseInlineStyleDeclarations('display:/*x*/none').get('display')).toBe('none');
    expect(parseInlineStyleDeclarations('display:none /*x*/').get('display')).toBe('none');
    expect(parseInlineStyleDeclarations('display:none!important;display:block').get('display')).toBe('none');
    expect(parseInlineStyleDeclarations('display:none;display:block').get('display')).toBe('block');
  });
});
