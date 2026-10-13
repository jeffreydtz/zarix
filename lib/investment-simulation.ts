import type { InvestmentType } from '@/types/database';

export interface InvestmentSimulationReference {
  quantity: number;
  price: number | null;
  type: InvestmentType;
  currency: string;
}

export interface InvestmentSimulationResult {
  currentPrice: number;
  hypotheticalPrice: number;
  currentValue: number;
  hypotheticalValue: number;
  currency: string;
  variationPercent: number;
}

/** CU004 A04: a price scenario in the reference currency, without financial writes. */
export function simulateInvestment(
  reference: Readonly<InvestmentSimulationReference>,
  variationPercent: number,
): InvestmentSimulationResult {
  if (!Number.isFinite(variationPercent) || variationPercent < -100) {
    throw new Error('Ingresá una variación finita mayor o igual a -100%.');
  }
  if (!Number.isFinite(reference.quantity) || reference.quantity <= 0 ||
      reference.price === null || !Number.isFinite(reference.price) || reference.price <= 0) {
    throw new Error('Esta posición no tiene una cantidad y un precio de referencia válidos para simular.');
  }

  const factor = reference.type === 'bond' ? 100 : 1;
  const currentValue = reference.quantity * reference.price / factor;
  const hypotheticalPrice = reference.price * (1 + variationPercent / 100);
  const hypotheticalValue = reference.quantity * hypotheticalPrice / factor;
  if (![currentValue, hypotheticalPrice, hypotheticalValue].every(Number.isFinite)) {
    throw new Error('La variación supera el rango numérico de la simulación.');
  }
  return {
    currentPrice: reference.price,
    hypotheticalPrice,
    currentValue,
    hypotheticalValue,
    currency: reference.currency,
    variationPercent,
  };
}
