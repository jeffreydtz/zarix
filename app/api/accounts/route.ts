import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { accountsService } from '@/lib/services/accounts';

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const accounts = await accountsService.list(user.id);
    return NextResponse.json(accounts);
  } catch (error) {
    console.error('Accounts GET error:', error);
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

    const account = await accountsService.create({
      userId: user.id,
      name: body.name,
      type: body.type,
      currency: body.currency,
      initialBalance: body.initialBalance || 0,
      icon: body.icon,
      color: body.color,
      isDebt: body.isDebt || false,
      includeInTotal: body.includeInTotal !== undefined ? body.includeInTotal : true,
      minBalance: body.minBalance,
      creditLimit: body.creditLimit,
      closingDay: body.closingDay,
      dueDay: body.dueDay,
      last4Digits: body.last4Digits,
    });

    return NextResponse.json(account, { status: 201 });
  } catch (error) {
    console.error('Accounts POST error:', error);
    return NextResponse.json(
      { error: 'Internal error' },
      { status: 500 }
    );
  }
}
