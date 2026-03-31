import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { budgetsService } from '@/lib/services/budgets';

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    
    const updates: Record<string, any> = {};
    if (body.amount !== undefined) updates.amount = body.amount;
    if (body.currency !== undefined) updates.currency = body.currency;
    if (body.rolloverEnabled !== undefined) updates.rollover_enabled = body.rolloverEnabled;
    if (body.alertAtPercent !== undefined) updates.alert_at_percent = body.alertAtPercent;

    const budget = await budgetsService.update(params.id, user.id, updates);
    return NextResponse.json(budget);
  } catch (error) {
    console.error('Budget PUT error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await budgetsService.delete(params.id, user.id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Budget DELETE error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
