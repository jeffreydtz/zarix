import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { investmentsService } from '@/lib/services/investments';
import type { InvestmentType } from '@/types/database';

const INVESTMENT_TYPES: ReadonlySet<InvestmentType> = new Set<InvestmentType>([
  'stock_arg',
  'cedear',
  'stock_us',
  'etf',
  'crypto',
  'plazo_fijo',
  'fci',
  'bond',
  'caucion',
  'real_estate',
  'other',
]);

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const investments = await investmentsService.list(user.id);
    return NextResponse.json(investments);
  } catch (error: unknown) {
    console.error('Investments GET error:', error);
    return NextResponse.json(
      { error: errorMessage(error, 'Error al obtener las inversiones') },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = (await req.json()) as Record<string, unknown>;
    const type = body.type as InvestmentType;
    if (!INVESTMENT_TYPES.has(type)) {
      return NextResponse.json({ error: 'Tipo de inversión inválido' }, { status: 400 });
    }

    const quantity = Number(body.quantity);
    const purchasePrice = Number(body.purchasePrice);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      return NextResponse.json({ error: 'Cantidad inválida' }, { status: 400 });
    }
    if (!Number.isFinite(purchasePrice) || purchasePrice <= 0) {
      return NextResponse.json({ error: 'Precio de compra inválido' }, { status: 400 });
    }

    const accountId = String(body.accountId || '');
    const name = String(body.name || '').trim();
    const purchaseCurrency = String(body.purchaseCurrency || 'USD');
    const purchaseDate = String(body.purchaseDate || '');
    if (!accountId || !name || !purchaseDate) {
      return NextResponse.json({ error: 'Faltan campos obligatorios' }, { status: 400 });
    }

    const tickerRaw = body.ticker;
    const ticker =
      typeof tickerRaw === 'string' && tickerRaw.trim().length > 0
        ? tickerRaw.trim().toUpperCase()
        : undefined;
    const maturityDate =
      typeof body.maturityDate === 'string' && body.maturityDate ? body.maturityDate : undefined;
    const interestRateRaw = body.interestRate;
    const interestRate =
      interestRateRaw === undefined || interestRateRaw === null || interestRateRaw === ''
        ? undefined
        : Number(interestRateRaw);
    const notes = typeof body.notes === 'string' ? body.notes : undefined;

    const isManualPrice = body.isManualPrice === true;
    let currentPrice: number | undefined;
    if (isManualPrice) {
      const cp = Number(body.currentPrice);
      if (!Number.isFinite(cp) || cp <= 0) {
        return NextResponse.json({ error: 'Precio actual inválido' }, { status: 400 });
      }
      currentPrice = cp;
    }
    const marketCurrencyRaw = body.marketCurrency;
    const marketCurrency =
      typeof marketCurrencyRaw === 'string' && marketCurrencyRaw.trim().length > 0
        ? marketCurrencyRaw.trim().toUpperCase()
        : isManualPrice
          ? purchaseCurrency.toUpperCase()
          : undefined;

    const investment = await investmentsService.create({
      userId: user.id,
      accountId,
      type,
      ticker,
      name,
      quantity,
      purchasePrice,
      purchaseCurrency,
      purchaseDate,
      maturityDate,
      interestRate: Number.isFinite(interestRate) ? interestRate : undefined,
      notes,
      marketCurrency,
      isManualPrice,
      currentPrice,
    });

    return NextResponse.json(investment, { status: 201 });
  } catch (error: unknown) {
    console.error('Investments POST error:', error);
    return NextResponse.json(
      { error: errorMessage(error, 'Error al registrar la inversión') },
      { status: 500 }
    );
  }
}
