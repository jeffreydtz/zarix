/** RFC 4180 quoting must apply to every field, including account/category names. */
export function encodeCsvCell(value: string): string {
  const safe = /^[\s]*[=+\-@]/.test(value) || /^[\t\r\n]/.test(value)
    ? `'${value}`
    : value;
  return `"${safe.replace(/"/g, '""')}"`;
}
