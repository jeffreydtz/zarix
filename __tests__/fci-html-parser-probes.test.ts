import { describe, expect, it } from 'vitest';
import { parseCafciHtmlFichaDetailed } from '@/lib/market-data/cafci-html';
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
  const moneda = opts.moneda ?? '<span class="label">Moneda:</span> Peso Argentina';
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
      moneda: '<span class="label">Moneda:</span> Peso Argentina<span class="label">Moneda:</span> Dolar Estadounidense',
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
