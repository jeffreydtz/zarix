import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import BudgetCard from '@/components/budgets/BudgetCard';

const budget = {
  id: 'synthetic-budget-boundary',
  category_id: null,
  amount: 10000,
  currency: 'ARS',
  rollover_enabled: false,
  rollover_amount: 0,
  alert_at_percent: 80,
  category: { name: 'Alimentos', icon: '🍽️' },
};

function render(overrides: Partial<Parameters<typeof BudgetCard>[0]['budget']>) {
  const html = renderToStaticMarkup(createElement(BudgetCard, {
    budget: { ...budget, ...overrides },
    onDelete: () => {},
    onRefresh: () => {},
  }));
  return { html, text: html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ') };
}

describe('BudgetCard monetary boundaries', () => {
  it.each([
    { spent: 9999.99, remaining: 0.01, label: 'Restante $0,01 ARS', state: 'available' },
    { spent: 10000, remaining: 0, label: 'Restante $0,00 ARS', state: 'limit' },
    { spent: 10000.01, remaining: -0.01, label: 'Excedido $0,01 ARS', state: 'exceeded' },
  ])('keeps the ARS10000 boundary $state with a rounded SQL percent of100', ({ spent, remaining, label, state }) => {
    const { html, text } = render({ spent_amount: spent, remaining_amount: remaining, percent_used: 100 });

    expect(text).toContain(label);
    expect(text).toContain('$10.000,00');
    expect(text).toContain(`$${spent.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} gastado`);
    expect(text.includes('Presupuesto superado')).toBe(state === 'exceeded');
    expect(text.includes('Presupuesto en el límite')).toBe(state === 'limit');
    expect(html.includes('border-destructive/30 bg-destructive/10')).toBe(state === 'exceeded');
    if (state === 'available') expect(text).toContain('Cerca del límite');
    expect(text).not.toContain('NaN');
  });

  it.each([undefined, Number.NaN])('falls back to amount minus spent when remaining is %s', remaining => {
    const { text } = render({ spent_amount: 9999.99, remaining_amount: remaining, percent_used: 100 });
    expect(text).toContain('Restante $0,01 ARS');
    expect(text).not.toContain('NaN');
    expect(text).not.toContain('Presupuesto superado');
  });

  it('preserves a finite authoritative remaining amount when rollover is enabled', () => {
    const { html, text } = render({
      rollover_enabled: true,
      rollover_amount: 25,
      spent_amount: 10010,
      remaining_amount: 15,
      percent_used: 100.1,
    });
    expect(text).toContain('con rollover');
    expect(text).toContain('Restante $15,00 ARS');
    expect(text).not.toContain('Excedido');
    expect(text).not.toContain('Presupuesto superado');
    expect(html).not.toContain('border-destructive/30 bg-destructive/10');
  });
});
