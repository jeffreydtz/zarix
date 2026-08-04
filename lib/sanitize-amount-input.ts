/**
 * Filtra la entrada de un campo de monto: deja solo dígitos y un único
 * separador decimal (coma o punto). Letras y símbolos se descartan al
 * tipear o pegar. El último separador se toma como decimal y los
 * anteriores como miles, así "1.234,56" pegado queda "1234,56".
 */
export function sanitizeAmountInput(raw: string): string {
  const cleaned = raw.replace(/[^0-9.,]/g, '');
  const sep = Math.max(cleaned.lastIndexOf('.'), cleaned.lastIndexOf(','));
  if (sep === -1) return cleaned;
  return cleaned.slice(0, sep).replace(/[.,]/g, '') + cleaned.slice(sep);
}
