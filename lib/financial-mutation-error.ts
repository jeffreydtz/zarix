/** A write may have committed; never ask the model to retry or select a new target. */
export class AmbiguousFinancialMutationError extends Error {
  constructor(cause: unknown) {
    super('No se pudo confirmar el resultado. Revisá tus movimientos antes de volver a intentarlo.', { cause });
    this.name = 'AmbiguousFinancialMutationError';
  }
}
