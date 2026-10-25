import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { accountsService } from '@/lib/services/accounts';
import { errorResponse, requireUser } from '@/lib/api-handler';

export async function GET(req: NextRequest) {
  try {
    const { user } = await requireUser();

    const lite = req.nextUrl.searchParams.get('lite') === '1';
    const accounts = lite
      ? await accountsService.listReferenceAccounts(user.id)
      : await accountsService.list(user.id, { allowPartialValuation: true });
    return NextResponse.json(accounts);
  } catch (error: any) {
    console.error('Accounts GET error:', error);
    return errorResponse(error);
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

    const queuedOwner = req.headers.get('x-queue-owner');
    if (queuedOwner && queuedOwner !== user.id) {
      return NextResponse.json({ error: 'La operación pertenece a otra sesión.' }, { status: 403 });
    }

    const body = await req.json();

    const account = await accountsService.create({
      userId: user.id,
      requestId: req.headers.get('idempotency-key') || undefined,
      name: body.name,
      type: body.type,
      currency: body.currency,
      initialBalance: body.initialBalance || 0,
      icon: body.icon,
      color: body.color,
      isDebt: body.isDebt || false,
      includeInTotal: body.includeInTotal !== undefined ? body.includeInTotal : true,
      includeInLiquid:
        body.includeInLiquid !== undefined ? body.includeInLiquid : true,
      minBalance: body.minBalance,
      creditLimit: body.creditLimit,
      closingDay: body.closingDay,
      dueDay: body.dueDay,
      last4Digits: body.last4Digits,
      isMulticurrency: body.isMulticurrency,
      secondaryCurrency: body.secondaryCurrency,
    });

    return NextResponse.json(account, { status: 201, headers: req.headers.get('idempotency-key')
      ? { 'Idempotency-Key': req.headers.get('idempotency-key')! } : undefined });
  } catch (error: any) {
    console.error('Accounts POST error:', error);
    return errorResponse(error);
  }
}
