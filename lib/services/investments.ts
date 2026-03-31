import { createServiceClientSync } from '@/lib/supabase/server';
import { cotizacionesService } from './cotizaciones';
import type { Investment } from '@/types/database';

export interface CreateInvestmentInput {
  userId: string;
  accountId: string;
  type: string;
  ticker?: string;
  name: string;
  quantity: number;
  purchasePrice: number;
  purchaseCurrency: string;
  purchaseDate: string;
  maturityDate?: string;
  interestRate?: number;
  notes?: string;
}

export interface InvestmentWithPnL extends Investment {
  current_value: number;
  profit_loss: number;
  profit_loss_percent: number;
}

class InvestmentsService {
  async create(input: CreateInvestmentInput): Promise<Investment> {
    const supabase = createServiceClientSync();

    const { data, error } = await supabase
      .from('investments')
      .insert({
        user_id: input.userId,
        account_id: input.accountId,
        type: input.type as any,
        ticker: input.ticker || null,
        name: input.name,
        quantity: input.quantity,
        purchase_price: input.purchasePrice,
        purchase_currency: input.purchaseCurrency,
        purchase_date: input.purchaseDate,
        maturity_date: input.maturityDate || null,
        interest_rate: input.interestRate || null,
        notes: input.notes || null,
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async list(userId: string): Promise<InvestmentWithPnL[]> {
    const supabase = createServiceClientSync();

    const { data: investments, error } = await supabase
      .from('investments')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    if (error) throw error;

    const investmentsWithPnL: InvestmentWithPnL[] = await Promise.all(
      investments.map(async (inv) => {
        let currentPrice = inv.current_price || inv.purchase_price;

        if (inv.type === 'crypto' && inv.ticker) {
          try {
            const quote = await cotizacionesService.getCryptoQuote(inv.ticker);
            currentPrice = quote.priceUSD;

            await supabase
              .from('investments')
              .update({
                current_price: currentPrice,
                current_price_updated_at: new Date().toISOString(),
              })
              .eq('id', inv.id);
          } catch (error) {
            console.error(`Error updating price for ${inv.ticker}:`, error);
          }
        }

        const currentValue = Number(inv.quantity) * currentPrice;
        const purchaseValue = Number(inv.quantity) * Number(inv.purchase_price);
        const profitLoss = currentValue - purchaseValue;
        const profitLossPercent = purchaseValue > 0 ? (profitLoss / purchaseValue) * 100 : 0;

        return {
          ...inv,
          quantity: Number(inv.quantity),
          purchase_price: Number(inv.purchase_price),
          current_price: currentPrice,
          interest_rate: inv.interest_rate ? Number(inv.interest_rate) : null,
          current_value: currentValue,
          profit_loss: profitLoss,
          profit_loss_percent: profitLossPercent,
        };
      })
    );

    return investmentsWithPnL;
  }

  async getById(id: string, userId: string): Promise<Investment> {
    const supabase = createServiceClientSync();

    const { data, error } = await supabase
      .from('investments')
      .select('*')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (error) throw error;
    return data;
  }

  async update(
    id: string,
    userId: string,
    updates: Partial<CreateInvestmentInput>
  ): Promise<Investment> {
    const supabase = createServiceClientSync();

    const { data, error } = await supabase
      .from('investments')
      .update(updates as any)
      .eq('id', id)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async delete(id: string, userId: string): Promise<void> {
    const supabase = createServiceClientSync();

    const { error } = await supabase
      .from('investments')
      .update({ is_active: false })
      .eq('id', id)
      .eq('user_id', userId);

    if (error) throw error;
  }

  async getPortfolioSummary(userId: string) {
    const investments = await this.list(userId);

    const totalCurrentValue = investments.reduce((sum, inv) => sum + inv.current_value, 0);
    const totalPurchaseValue = investments.reduce(
      (sum, inv) => sum + Number(inv.quantity) * Number(inv.purchase_price),
      0
    );
    const totalPnL = totalCurrentValue - totalPurchaseValue;
    const totalPnLPercent = totalPurchaseValue > 0 ? (totalPnL / totalPurchaseValue) * 100 : 0;

    const byType = investments.reduce((acc, inv) => {
      if (!acc[inv.type]) {
        acc[inv.type] = {
          type: inv.type,
          count: 0,
          value: 0,
          pnl: 0,
        };
      }

      acc[inv.type].count += 1;
      acc[inv.type].value += inv.current_value;
      acc[inv.type].pnl += inv.profit_loss;

      return acc;
    }, {} as Record<string, { type: string; count: number; value: number; pnl: number }>);

    return {
      totalCurrentValue,
      totalPurchaseValue,
      totalPnL,
      totalPnLPercent,
      byType: Object.values(byType),
      investments,
    };
  }
}

export const investmentsService = new InvestmentsService();
