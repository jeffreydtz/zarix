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
    expect(parseInlineStyleDeclarations('display:none!important;display:invalid!important').get('display')).toBe('none');
    expect(parseInlineStyleDeclarations('display:none!important;display:flex grid!important').get('display')).toBe('none');
    expect(parseInlineStyleDeclarations('display:flex grid').get('display')).toBeUndefined();
    expect(parseInlineStyleDeclarations('display:block block').get('display')).toBeUndefined();
    expect(parseInlineStyleDeclarations('display:inline table-cell').get('display')).toBeUndefined();
    expect(parseInlineStyleDeclarations('display:inherit block').get('display')).toBeUndefined();
    expect(parseInlineStyleDeclarations('display:block flex').get('display')).toBe('block flex');
    expect(parseInlineStyleDeclarations('display:inline flow list-item').get('display')).toBe('inline flow list-item');
  });
});

describe('Codex r10 HTML parser — whitespace-split NAV tail, exact Moneda', () => {
  it.each([
    ['NNBSP', '<p>Valor por cada cuotaparte: 1.241,954<span>&#x202f;039</span></p>'],
    ['NBSP', '<p>Valor por cada cuotaparte: 1.241,954<span>\u00A0039</span></p>'],
    ['thin space', '<p>Valor por cada cuotaparte: 1.241,954<span>\u2009039</span></p>'],
    ['hidden spacer', '<p><span>Valor por cada cuotaparte: 1.241,954</span><span hidden> </span><span>039</span></p>'],
    ['display:none spacer', '<p><span>Valor por cada cuotaparte: 1.241,954</span><span style="display:none"> </span><span>039</span></p>'],
    ['multiple spans', '<p><span>Valor por cada cuotaparte: 1.241,954</span><span>039</span></p>'],
  ])('skips a whitespace-split NAV tail (%s)', (_name, nav) => {
    const result = parsed(shell({ nav }));
    expect(result.parsed).toBeNull();
    expect(result.parsed?.price).not.toBe(1241.954);
  });

  it('still parses when the NAV token is followed only by trailing space in the label element', () => {
    const html = shell({ nav: '<p>Valor por cada cuotaparte: 1.241,954039 </p>' });
    expect(parsed(html).parsed).toMatchObject({ price: 1241.954039 });
  });

  it('skips a Moneda value whose hidden descendant changes the unfiltered text', () => {
    expect(parsed(shell({
      moneda: '<div id="fichaRight"><span class="label">Moneda: Peso <span hidden>X</span>Argentina</span></div>',
    })).parsed).toBeNull();
    expect(parsed(shell({
      moneda: '<div id="fichaRight"><span class="label">Moneda:</span> Peso <span hidden>Uruguayo </span>Argentina</div>',
    })).parsed).toBeNull();
  });

  it('skips an extra Peso Mexicano label on an ARS page', () => {
    const html = shell({
      moneda: `<div id="fichaRight">
        <span class="label">Moneda:</span> Peso Argentina
        <span class="label">Moneda:</span> Peso Mexicano
      </div>`,
    });
    expect(parsed(html).parsed).toBeNull();
  });

  it('skips an extra Dolar Canadiense label on a USD page', () => {
    const html = shell({
      moneda: `<div id="fichaRight">
        <span class="label">Moneda:</span> Dolar Estadounidense
        <span class="label">Moneda:</span> Dolar Canadiense
      </div>`,
    });
    expect(parsed(html).parsed).toBeNull();
  });

  it('still counts identical folded Moneda values as one', () => {
    const html = shell({
      moneda: `<div id="fichaRight">
        <span class="label">Moneda:</span> Peso Argentina
        <span class="label">Moneda:</span> peso argentina
      </div>`,
    });
    expect(parsed(html).parsed).toMatchObject({
      price: 1241.954039,
      monedaLabel: 'Peso Argentina',
    });
  });

  it('skips identity hidden by an invalid important display after display:none!important', () => {
    const html = shell({
      identity: `<div style="display:none!important;display:invalid!important">${IDENTITY}</div>`,
    });
    expect(parsed(html).parsed).toBeNull();
  });
});

describe('Kael/Codex r11 HTML parser — rendered section text, Moneda whitelist, display', () => {
  const SEPARATORS = [
    ['NNBSP', '&#x202f;'],
    ['NBSP', '\u00A0'],
    ['thin space', '\u2009'],
    ['regular space', ' '],
    ['nbsp entity', '&nbsp;'],
    ['ZWSP', '&#x200b;'],
  ] as const;

  const NAV_POSITIONS: Array<[string, (sep: string) => string]> = [
    ['inside span', (sep) => `<p>Valor por cada cuotaparte: 1.241,954<span>${sep}039</span></p>`],
    ['hidden span', (sep) => `<p>Valor por cada cuotaparte: 1.241,954<span hidden>${sep}039</span></p>`],
    ['inline sibling', (sep) => `<p><span>Valor por cada cuotaparte: 1.241,954</span><span>${sep}039</span></p>`],
    ['outside p', (sep) => `<p>Valor por cada cuotaparte: 1.241,954</p><p>${sep}039</p>`],
    ['outside div', (sep) => `<p>Valor por cada cuotaparte: 1.241,954</p><div>${sep}039</div>`],
    ['br', (sep) => `<p>Valor por cada cuotaparte: 1.241,954</p><br>${sep}039`],
  ];

  const DATE_POSITIONS: Array<[string, (sep: string) => string]> = [
    ['inside span', (sep) => `<h3>Valores al 23/10/20<span>${sep}26</span></h3>`],
    ['hidden span', (sep) => `<h3>Valores al 23/10/20<span hidden>${sep}26</span></h3>`],
    ['inline sibling', (sep) => `<h3><span>Valores al 23/10/20</span><span>${sep}26</span></h3>`],
    ['outside p', (sep) => `<h3>Valores al 23/10/20</h3><p>${sep}26</p>`],
    ['outside div', (sep) => `<h3>Valores al 23/10/20</h3><div>${sep}26</div>`],
    ['br', (sep) => `<h3>Valores al 23/10/20</h3><br>${sep}26`],
  ];

  const MONEDA_POSITIONS: Array<[string, (sep: string) => string]> = [
    ['inside span', (sep) => `<div id="fichaRight"><span class="label">Moneda:</span> Peso<span>${sep}Argentina</span></div>`],
    ['hidden span', (sep) => `<div id="fichaRight"><span class="label">Moneda:</span> Peso<span hidden>${sep}Argentina</span></div>`],
    ['inline sibling', (sep) => `<div id="fichaRight"><span class="label">Moneda:</span> Peso<span>${sep}</span>Argentina</div>`],
    ['outside p', (sep) => `<div id="fichaRight"><p><span class="label">Moneda:</span> Peso</p><p>${sep}Argentina</p></div>`],
    ['outside div', (sep) => `<div id="fichaRight"><div><span class="label">Moneda:</span> Peso</div><div>${sep}Argentina</div></div>`],
    ['br', (sep) => `<div id="fichaRight"><span class="label">Moneda:</span> Peso<br>${sep}Argentina</div>`],
  ];

  it('separator sweep has 0 truncations across NAV, date and Moneda', () => {
    let truncations = 0;
    const failures: string[] = [];
    for (const [sepName, sep] of SEPARATORS) {
      for (const [pos, build] of NAV_POSITIONS) {
        const result = parsed(shell({ nav: build(sep) }));
        if (result.parsed?.price === 1241.954) {
          truncations += 1;
          failures.push(`NAV ${pos} ${sepName} saved 1241.954`);
        }
      }
      for (const [pos, build] of DATE_POSITIONS) {
        const result = parsed(shell({ date: build(sep) }));
        const ts = result.parsed?.timestamp;
        if (ts && ts !== '2026-10-23T03:00:00.000Z') {
          truncations += 1;
          failures.push(`date ${pos} ${sepName} saved ${ts}`);
        }
      }
      for (const [pos, build] of MONEDA_POSITIONS) {
        const result = parsed(shell({ moneda: build(sep) }));
        const label = result.parsed?.monedaLabel;
        if (label && foldSweep(label) !== 'PESO ARGENTINA') {
          truncations += 1;
          failures.push(`Moneda ${pos} ${sepName} saved ${label}`);
        }
        if (label === 'Peso' || foldSweep(label ?? '') === 'PESO') {
          truncations += 1;
          failures.push(`Moneda ${pos} ${sepName} saved bare Peso`);
        }
      }
    }
    expect({ truncations, failures }).toEqual({ truncations: 0, failures: [] });
  });

  it.each(['div', 'section', 'li', 'td'] as const)(
    'skips a whitespace-split NAV tail inside a <%s> wrapper',
    (tag) => {
      const inner = `<span>Valor por cada cuotaparte: 1.241,954</span><span>&#x202f;039</span>`;
      const nav = tag === 'td'
        ? `<table><tr><td>${inner}</td></tr></table>`
        : tag === 'li'
          ? `<ul><li>${inner}</li></ul>`
          : `<${tag}>${inner}</${tag}>`;
      const result = parsed(shell({ nav }));
      expect(result.parsed).toBeNull();
      expect(result.parsed?.price).not.toBe(1241.954);
    },
  );

  it.each(['-', '('] as const)('skips a hidden %s separator between NAV digit spans', (sep) => {
    const html = shell({
      nav: `<p><span>Valor por cada cuotaparte: 1.241,954</span><span hidden>${sep}</span><span>039</span></p>`,
    });
    expect(parsed(html).parsed).toBeNull();
    expect(parsed(html).parsed?.price).not.toBe(1241.954);
  });

  it('parses when the NAV label and value are in separate nodes', () => {
    const html = shell({
      nav: '<div><span>Valor por cada cuotaparte:</span> 1.241,954039</div>',
    });
    expect(parsed(html).parsed).toMatchObject({ price: 1241.954039 });
  });

  it('parses a NAV shown with a later valid inline-table display', () => {
    const html = shell({
      nav: '<p style="display:none;display:inline-table">Valor por cada cuotaparte: 1.241,954039</p>',
    });
    expect(parsed(html).parsed).toMatchObject({ price: 1241.954039 });
  });

  it('parses a NAV shown with two-value display:inline flow-root', () => {
    const html = shell({
      nav: '<p style="display:none;display:inline flow-root">Valor por cada cuotaparte: 1.241,954039</p>',
    });
    expect(parsed(html).parsed).toMatchObject({ price: 1241.954039 });
  });

  it('skips a CSS content replacement that would save 1300 instead of the visible NAV', () => {
    const html = shell({
      nav: `<p style="content:'1.241,954039'">Valor por cada cuotaparte: 1300</p>`,
    });
    expect(parsed(html).parsed).toBeNull();
    expect(parsed(html).parsed?.price).not.toBe(1300);
  });

  it('skips a bare Peso Moneda value', () => {
    expect(parsed(shell({
      moneda: '<div id="fichaRight"><span class="label">Moneda:</span> Peso</div>',
    })).parsed).toBeNull();
  });

  it('skips a Peso / NNBSP / Argentina split that would previously save Peso from followingText', () => {
    const html = shell({
      moneda: '<div id="fichaRight"><span class="label">Moneda:</span> Peso<span>&#x202f;</span>Argentina</div>',
    });
    const result = parsed(html);
    expect(result.parsed?.monedaLabel).not.toBe('Peso');
    expect(result.parsed).toMatchObject({ monedaLabel: 'Peso Argentina' });
  });

  it('does not save 1241.95 when a template sibling carries the NAV tail', () => {
    const html = shell({
      nav: '<p>Valor por cada cuotaparte: 1.241,95</p><template>4039</template>',
    });
    const result = parsed(html);
    expect(result.parsed).toBeNull();
    expect(result.parsed?.price).not.toBe(1241.95);
  });

  it('skips a textarea, xmp or plaintext tail after the NAV token', () => {
    for (const tag of ['textarea', 'xmp', 'plaintext'] as const) {
      const result = parsed(shell({
        nav: `<p>Valor por cada cuotaparte: 1.241,95</p><${tag}>4039</${tag}>`,
      }));
      expect(result.parsed).toBeNull();
      expect(result.parsed?.price).not.toBe(1241.95);
    }
  });

  it('skips an empty template, noscript, iframe, object or embed inside #cuotaparte', () => {
    for (const extra of [
      '<template></template>',
      '<noscript></noscript>',
      '<iframe></iframe>',
      '<object></object>',
      '<embed>',
      '<script></script>',
      '<style></style>',
    ]) {
      expect(parsed(shell({
        nav: `<p>Valor por cada cuotaparte: 1.241,954039</p>${extra}`,
      })).parsed).toBeNull();
    }
  });

  it('Kael token corpus, including template noscript and comment siblings, has 0 truncations', () => {
    const wraps: Array<[string, (inner: string) => string]> = [
      ['template', (inner) => `<template>${inner}</template>`],
      ['noscript', (inner) => `<noscript>${inner}</noscript>`],
      ['comment', (inner) => `<!--${inner}-->`],
      ['script', (inner) => `<script>${inner}</script>`],
      ['style', (inner) => `<style>${inner}</style>`],
      ['iframe', (inner) => `<iframe>${inner}</iframe>`],
    ];
    const cases: Array<{ name: string; html: string; kind: 'nav' | 'date' | 'moneda'; raw: boolean }> = [];
    for (const [sepName, sep] of SEPARATORS) {
      for (const [pos, build] of NAV_POSITIONS) {
        cases.push({ name: `NAV ${pos} ${sepName}`, html: shell({ nav: build(sep) }), kind: 'nav', raw: false });
      }
      for (const [pos, build] of DATE_POSITIONS) {
        cases.push({ name: `date ${pos} ${sepName}`, html: shell({ date: build(sep) }), kind: 'date', raw: false });
      }
      for (const [pos, build] of MONEDA_POSITIONS) {
        cases.push({ name: `Moneda ${pos} ${sepName}`, html: shell({ moneda: build(sep) }), kind: 'moneda', raw: false });
      }
      for (const [wrapName, wrap] of wraps) {
        for (const where of ['sibling', 'inside'] as const) {
          const navPayload = wrap(`${sep}039`);
          const datePayload = wrap(`${sep}26`);
          const monedaPayload = wrap(`${sep}Argentina`);
          cases.push({
            name: `NAV ${wrapName} ${where} ${sepName}`,
            html: shell({
              nav: where === 'sibling'
                ? `<p>Valor por cada cuotaparte: 1.241,954</p>${navPayload}`
                : `<p>Valor por cada cuotaparte: 1.241,954${navPayload}</p>`,
            }),
            kind: 'nav',
            raw: true,
          });
          cases.push({
            name: `date ${wrapName} ${where} ${sepName}`,
            html: shell({
              date: where === 'sibling'
                ? `<h3>Valores al 23/10/20</h3>${datePayload}`
                : `<h3>Valores al 23/10/20${datePayload}</h3>`,
            }),
            kind: 'date',
            raw: true,
          });
          cases.push({
            name: `Moneda ${wrapName} ${where} ${sepName}`,
            html: shell({
              moneda: where === 'sibling'
                ? `<div id="fichaRight"><p><span class="label">Moneda:</span> Peso</p>${monedaPayload}</div>`
                : `<div id="fichaRight"><span class="label">Moneda:</span> Peso${monedaPayload}</div>`,
            }),
            kind: 'moneda',
            raw: true,
          });
        }
      }
    }
    const truncations: string[] = [];
    for (const row of cases) {
      const result = parsed(row.html);
      if (row.kind === 'nav' && result.parsed?.price === 1241.954) truncations.push(row.name);
      if (row.kind === 'date' && result.parsed && result.parsed.timestamp !== '2026-10-23T03:00:00.000Z') {
        truncations.push(row.name);
      }
      const label = result.parsed?.monedaLabel;
      if (row.kind === 'moneda' && (label === 'Peso' || (label && foldSweep(label) !== 'PESO ARGENTINA'))) {
        truncations.push(`${row.name} saved ${label}`);
      }
      if (row.raw && result.parsed) {
        truncations.push(`${row.name} parsed ${result.parsed.price} ${result.parsed.monedaLabel}`);
      }
    }
    expect(cases.length).toBe(324);
    expect(truncations).toEqual([]);
  });

  it('keeps display:none when a later important display combination is invalid', () => {
    const html = shell({
      nav: '<p style="display:none!important;display:flex grid!important">Valor por cada cuotaparte: 1.241,954</p>',
    });
    const result = parsed(html);
    expect(result.parsed).toBeNull();
    expect(result.parsed?.price).not.toBe(1241.954);
  });

  it('does not treat a second br as a single date boundary', () => {
    expect(parsed(shell({ date: '<h3>Valores al<br><br>23/10/2026</h3>' })).parsed).toBeNull();
  });

  it('rejects a date tail that stays on the same line', () => {
    expect(parsed(shell({ date: '<strong>Valores al 23/10/2026x</strong>' })).parsed).toBeNull();
    expect(parsed(shell({ date: '<span style="display:block">Valores al 23/10/2026 extra</span>' })).parsed).toBeNull();
  });

  it('parses a date in an inline wrapper when the next sibling is a block', () => {
    expect(parsed(shell({ date: '<strong>Valores al 23/10/2026</strong>' })).parsed).toMatchObject({
      price: 1241.954039,
      timestamp: '2026-10-23T03:00:00.000Z',
    });
    expect(parsed(shell({ date: '<span style="display:block">Valores al 23/10/2026</span>' })).parsed).toMatchObject({
      timestamp: '2026-10-23T03:00:00.000Z',
    });
  });

  it('skips a row whose Moneda text is not exactly one whitelist value', () => {
    const cases = [
      ['conflicting second value', `<li>
        <div><span class="label">Moneda:</span> Peso Argentina</div>
        <div>Dolar Estadounidense</div>
      </li>`],
      ['hidden br tail', '<li><span class="label">Moneda:</span> Peso Argentina<br hidden>1</li>'],
      ['Billete then Canadiense', `<li>
        <div><span class="label">Moneda:</span> Dolar Estadounidense</div>
        <div>Billete</div>
        <div>Canadiense</div>
      </li>`],
      ['empty label beside a subscription aside', `<li>
        <div><span class="label">Moneda:</span></div>
        <aside>Moneda de suscripción Peso Argentina</aside>
      </li>`],
    ] as const;
    for (const [name, row] of cases) {
      const result = parsed(shell({ moneda: `<div id="fichaRight"><ul>${row}</ul></div>` }));
      expect(result.parsed, name).toBeNull();
    }
  });

  it('does not let a later non-adjacent Billete complete Dolar Estadounidense', () => {
    const html = shell({
      moneda: `<div id="fichaRight"><ul>
        <li><span class="label">Moneda:</span> Dolar Estadounidense</li>
        <li>Código CNV: 279</li>
        <li>Billete</li>
      </ul></div>`,
    });
    expect(parsed(html).parsed).toMatchObject({ monedaLabel: 'Dolar Estadounidense' });
  });

  it('reads a block Moneda label from the following lines in that parent', () => {
    const html = shell({
      moneda: `<div id="fichaRight"><ul><li>
        <span class="label" style="display:block">Moneda:</span>
        <span style="display:block">Dolar</span>
        <span style="display:block">Estadounidense</span>
        <span style="display:block">Billete</span>
      </li></ul></div>`,
    });
    expect(parsed(html).parsed).toMatchObject({ monedaLabel: 'Dolar Estadounidense Billete' });
  });

  it('reads Dolar Estadounidense Billete across nested blocks in one li', () => {
    const html = shell({
      moneda: `<div id="fichaRight"><ul><li>
        <div><span class="label">Moneda:</span> Dolar Estadounidense</div>
        <div>Billete</div>
      </li></ul></div>`,
    });
    expect(parsed(html).parsed).toMatchObject({
      monedaLabel: 'Dolar Estadounidense Billete',
    });
  });

  it('parses Dolar Estadounidense Billete when that is the exact block value', () => {
    const html = shell({
      moneda: '<div id="fichaRight"><span class="label">Moneda:</span> Dólar Estadounidense Billete</div>',
    });
    expect(parsed(html).parsed).toMatchObject({
      monedaLabel: 'Dólar Estadounidense Billete',
    });
  });
});

function foldSweep(label: string): string {
  return label
    .replace(/\p{Cf}/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toUpperCase();
}
