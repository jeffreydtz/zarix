/** A UI preview must not subtract nominal prices denominated in different currencies. */
export function investmentSalePreview(input: {
  quantity: number; price: number; purchasePrice: number;
  currency: string; purchaseCurrency: string; type: string;
}): number | null {
  if (input.currency.toUpperCase() !== input.purchaseCurrency.toUpperCase()) return null;
  if (![input.quantity, input.price, input.purchasePrice].every(Number.isFinite) || input.quantity <= 0 || input.price <= 0) return null;
  return ((input.price - input.purchasePrice) * input.quantity) / (input.type === 'bond' ? 100 : 1);
}
