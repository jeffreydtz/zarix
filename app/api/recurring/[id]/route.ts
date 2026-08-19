import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { errorResponse } from '@/lib/api-handler';

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const updates: Record<string, any> = {};

    if (body.isActive !== undefined) updates.is_active = body.isActive;
    if (body.amount !== undefined) {
      const amount = Number(body.amount);
      if (!Number.isFinite(amount) || amount <= 0) {
        return NextResponse.json({ error: 'El monto debe ser mayor a 0' }, { status: 400 });
      }
      updates.amount = amount;
    }
    if (body.description !== undefined) updates.description = body.description;
    if (body.endDate !== undefined) updates.end_date = body.endDate;
    if (body.notificationEnabled !== undefined) updates.notification_enabled = body.notificationEnabled;
    if (body.subscriptionName !== undefined) updates.subscription_name = body.subscriptionName;
    if (body.subscriptionPlan !== undefined) updates.subscription_plan = body.subscriptionPlan;

    const { data, error } = await supabase
      .from('recurring_rules')
      .update(updates)
      .eq('id', params.id)
      .eq('user_id', user.id)
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json(data);
  } catch (error: any) {
    console.error('Recurring PUT error:', error);
    return errorResponse(error);
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { error } = await supabase
      .from('recurring_rules')
      .delete()
      .eq('id', params.id)
      .eq('user_id', user.id);

    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Recurring DELETE error:', error);
    return errorResponse(error);
  }
}
