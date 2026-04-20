/** Formato apto para inputs `type="number"` (hasta 2 decimales, sin ceros de más). */
export function formatAmountForInput(n: number): string {
  const rounded = Math.round(n * 100) / 100;
  if (!Number.isFinite(rounded)) return '';
  if (Number.isInteger(rounded)) return String(rounded);
  let s = rounded.toFixed(2);
  s = s.replace(/0+$/, '').replace(/\.$/, '');
  return s;
}
