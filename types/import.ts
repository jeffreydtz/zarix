/** Detalle de una fila omitida en import masivo (API + UI). */
export interface ImportSkippedDetail {
  /** Título corto para identificar la fila */
  title: string;
  /** Por qué no se importó */
  reason: string;
  /** Cómo corregirlo o volver a intentar */
  suggestion: string;
  /** Datos de la fila (fecha, monto, descripción) cuando aplica */
  context?: string;
}
