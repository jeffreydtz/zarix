import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data, error } = await supabase
      .from('recurring_rules')
      .select('*, category:categories(name, icon), account:accounts(name, currency)')
      .eq('user_id', user.id)
      .order('is_active', { ascending: false })
      .order('created_at', { ascending: false });

    if (error) throw error;
    return NextResponse.json(data);
  } catch (error) {
    console.error('Recurring GET error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();

    const { data, error } = await supabase
      .from('recurring_rules')
      .insert({
        user_id: user.id,
        account_id: body.accountId,
        type: body.type,
        amount: body.amount,
        currency: body.currency,
        category_id: body.categoryId || null,
        description: body.description,
        frequency: body.frequency,
        start_date: body.startDate,
        end_date: body.endDate || null,
        is_active: true,
      })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    console.error('Recurring POST error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
