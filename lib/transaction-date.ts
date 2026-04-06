/**
 * Fechas de movimientos: el usuario elige un día calendario (YYYY-MM-DD).
 * Guardamos ese día como instante a mediodía UTC para que al listar en cualquier
 * zona horaria no se muestre el día anterior (bug típico con `...T00:00:00.000Z`).
 */

export function todayLocalYmd(): string {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
}

/** `YYYY-MM-DD` (input date) → ISO al mediodía UTC de ese día civil. */
export function calendarDateToUtcNoonIso(ymd: string): string {
  const m = ymd.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) {
    return calendarDateToUtcNoonIso(todayLocalYmd());
  }
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) {
    return calendarDateToUtcNoonIso(todayLocalYmd());
  }
  return new Date(Date.UTC(y, mo - 1, d, 12, 0, 0, 0)).toISOString();
}

/** ISO guardado → valor para `<input type="date">` según calendario local del usuario. */
export function isoToLocalDateInputValue(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return todayLocalYmd();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
