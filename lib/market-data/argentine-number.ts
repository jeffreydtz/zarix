/**
 * Strict es-AR number grammar: `.` thousands, `,` decimal.
 * `1.000` is 1000. Markup, extra commas, and invalid groups are rejected.
 */

const ARGENTINE_NUMBER = /^-?(?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d+)?$/;

export function parseArgentineNumber(value: string): number | null {
  if (typeof value !== 'string') return null;
  const s = value.replace(/\s+/g, '').trim();
  if (!s || !ARGENTINE_NUMBER.test(s)) return null;
  const negative = s.startsWith('-');
  const unsigned = negative ? s.slice(1) : s;
  const comma = unsigned.indexOf(',');
  const intPart = (comma === -1 ? unsigned : unsigned.slice(0, comma)).replace(/\./g, '');
  const frac = comma === -1 ? '' : unsigned.slice(comma + 1);
  if (!/^\d+$/.test(intPart) || (frac && !/^\d+$/.test(frac))) return null;
  const n = Number(frac ? `${negative ? '-' : ''}${intPart}.${frac}` : `${negative ? '-' : ''}${intPart}`);
  return Number.isFinite(n) ? n : null;
}
