export function budgetRemainderLabel(remainingAmount: number): string {
  return remainingAmount < 0 ? 'Excedido por' : 'Te quedan';
}
