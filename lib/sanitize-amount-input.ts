/**
 * Filtra la entrada de un campo de monto: deja solo dígitos y un único
 * separador decimal (coma o punto). Letras y símbolos se descartan al
 * tipear o pegar, salvo notación científica o hex — esas se conservan
 * para que el parser de dinero las rechace en vez de concatenar dígitos.
 */
export function sanitizeAmountInput(raw: string): string {
  if (/[eE]/.test(raw) || /0[xX]/i.test(raw)) return raw.trim();
  const cleaned = raw.replace(/[^0-9.,]/g, '');
  const sep = Math.max(cleaned.lastIndexOf('.'), cleaned.lastIndexOf(','));
  if (sep === -1) return cleaned;
  return cleaned.slice(0, sep).replace(/[.,]/g, '') + cleaned.slice(sep);
}
