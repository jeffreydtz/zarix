import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { transactionsService } from '@/lib/services/transactions';

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const minAmountParam = searchParams.get('minAmount');
    const maxAmountParam = searchParams.get('maxAmount');

    const transactions = await transactionsService.list(user.id, {
      accountId: searchParams.get('accountId') || undefined,
      categoryId: searchParams.get('categoryId') || undefined,
      type: searchParams.get('type') || undefined,
      startDate: searchParams.get('startDate') || undefined,
      endDate: searchParams.get('endDate') || undefined,
      search: searchParams.get('search') || undefined,
      minAmount: minAmountParam ? parseFloat(minAmountParam) : undefined,
      maxAmount: maxAmountParam ? parseFloat(maxAmountParam) : undefined,
      limit: parseInt(searchParams.get('limit') || '100'),
      offset: parseInt(searchParams.get('offset') || '0'),
    });

    return NextResponse.json(transactions);
  } catch (error) {
    console.error('Transactions GET error:', error);
    return NextResponse.json(
      { error: 'Internal error' },
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

    const body = await req.json();

    const transaction = await transactionsService.create({
      userId: user.id,
      type: body.type,
      accountId: body.accountId,
      destinationAccountId: body.destinationAccountId,
      amount: body.amount,
      currency: body.currency,
      categoryId: body.categoryId,
      description: body.description,
      notes: body.notes,
      tags: body.tags,
      transactionDate: body.transactionDate,
      installments: body.installments,
    });

    return NextResponse.json(transaction, { status: 201 });
  } catch (error) {
    console.error('Transactions POST error:', error);
    return NextResponse.json(
      { error: 'Internal error' },
      { status: 500 }
    );
  }
}
