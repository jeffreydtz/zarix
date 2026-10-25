/**
 * Filtra la entrada de un campo de monto: deja el signo opcional, dígitos y un
 * único separador decimal (coma o punto). Letras y símbolos se descartan al
 * tipear o pegar, salvo notación científica o hex — esas se conservan
 * para que el parser de dinero las rechace en vez de concatenar dígitos.
 * El signo se conserva para que el submit rechace negativos; nunca se hace abs().
 */
export function sanitizeAmountInput(raw: string): string {
  const trimmed = raw.trim();
  if (/[eE]/.test(trimmed) || /0[xX]/i.test(trimmed)) return trimmed;
  const negative = /^\s*-/.test(trimmed);
  const cleaned = trimmed.replace(/[^0-9.,]/g, '');
  const sep = Math.max(cleaned.lastIndexOf('.'), cleaned.lastIndexOf(','));
  const body = sep === -1 ? cleaned : cleaned.slice(0, sep).replace(/[.,]/g, '') + cleaned.slice(sep);
  if (!body) return negative ? '-' : '';
  return negative ? `-${body}` : body;
}
