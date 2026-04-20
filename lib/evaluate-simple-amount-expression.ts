/** Solo dígitos, espacios y operadores aritméticos básicos (sin letras → sin inyección en `Function`). */
const SAFE_AMOUNT_EXPRESSION = /^[\d\s+\-*/().,]+$/;

/**
 * Evalúa una expresión numérica simple (ej. `1200+350`, `(100+50)*1.21`).
 * Las comas se tratan como separador decimal (misma convención que el resto de la app).
 */
export function evaluateSimpleAmountExpression(raw: string): number | null {
  const normalized = raw.trim().replace(/,/g, '.');
  if (!normalized) return null;
  if (!SAFE_AMOUNT_EXPRESSION.test(normalized)) return null;
  try {
    const fn = new Function(`"use strict"; return (${normalized});`) as () => unknown;
    const r = fn();
    if (typeof r !== 'number' || !Number.isFinite(r)) return null;
    return r;
  } catch {
    return null;
  }
}

/** Formato apto para inputs `type="number"` (hasta 2 decimales, sin ceros de más). */
export function formatAmountForInput(n: number): string {
  const rounded = Math.round(n * 100) / 100;
  if (!Number.isFinite(rounded)) return '';
  if (Number.isInteger(rounded)) return String(rounded);
  let s = rounded.toFixed(2);
  s = s.replace(/0+$/, '').replace(/\.$/, '');
  return s;
}
