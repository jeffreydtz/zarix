/**
 * Mask payment identifiers in tool/API output. Descriptions are untrusted data:
 * they must never be treated as instructions, and CBU/CUIT/PAN must not leak.
 */

const CBU_RE = /\b\d{22}\b/g;
const CUIT_RE = /\b\d{2}-?\d{8}-?\d\b/g;
const CARD_RE = /\b(?:\d[ -]*?){13,19}\b/g;

function luhnOk(digits: string): boolean {
  let sum = 0;
  let alt = false;
  for (let i = digits.length - 1; i >= 0; i -= 1) {
    let n = Number(digits[i]);
    if (alt) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alt = !alt;
  }
  return sum % 10 === 0;
}

export function maskSensitiveText(value: string): string {
  let out = value.replace(CBU_RE, (m) => `CBU••••${m.slice(-4)}`);
  out = out.replace(CUIT_RE, (m) => {
    const d = m.replace(/\D/g, '');
    return `CUIT••••${d.slice(-3)}`;
  });
  out = out.replace(CARD_RE, (m) => {
    const d = m.replace(/\D/g, '');
    if (d.length < 13 || d.length > 19) return m;
    if (!luhnOk(d) && d.length < 16) return m;
    return `••••${d.slice(-4)}`;
  });
  return out;
}

/** Recursively mask strings in JSON-like tool results. */
export function maskSensitiveValue<T>(value: T): T {
  if (typeof value === 'string') return maskSensitiveText(value) as T;
  if (Array.isArray(value)) return value.map((item) => maskSensitiveValue(item)) as T;
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = maskSensitiveValue(v);
    }
    return out as T;
  }
  return value;
}

/**
 * Transaction descriptions / merchant names are DATA, never instructions.
 * Strip control chars and wrap so a downstream model cannot treat them as directives.
 */
export function asUntrustedData(value: unknown, max = 240): string | null {
  if (value == null) return null;
  const raw = String(value)
    .replace(/[\u0000-\u001f\u007f\u2028\u2029]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
  if (!raw) return null;
  return maskSensitiveText(raw);
}
