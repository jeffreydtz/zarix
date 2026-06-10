import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isTransactionCurrency } from '@/lib/constants/transaction-currencies';

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
  } catch (error: any) {
    console.error('Recurring GET error:', error);
    return NextResponse.json({ error: error.message || 'Error al obtener las reglas recurrentes' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const amount = Number(body.amount);

    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: 'Monto inválido' }, { status: 400 });
    }

    if (!body.accountId || !body.type || !body.frequency || !body.startDate) {
      return NextResponse.json({ error: 'Faltan datos obligatorios' }, { status: 400 });
    }

    if (body.type !== 'expense' && body.type !== 'income') {
      return NextResponse.json({ error: 'Tipo inválido (debe ser gasto o ingreso)' }, { status: 400 });
    }

    if (!['daily', 'weekly', 'monthly', 'yearly'].includes(body.frequency)) {
      return NextResponse.json({ error: 'Frecuencia inválida' }, { status: 400 });
    }

    const cur = String(body.currency ?? '').trim().toUpperCase();
    if (!isTransactionCurrency(cur)) {
      return NextResponse.json(
        { error: 'Solo se permiten monedas ARS, USD o EUR en reglas recurrentes' },
        { status: 400 }
      );
    }

    // La cuenta (y categoría) deben ser del usuario: la regla materializa
    // movimientos sobre account_id vía cron, así que validar el dueño acá.
    const { data: acc } = await supabase
      .from('accounts')
      .select('id')
      .eq('id', body.accountId)
      .eq('user_id', user.id)
      .maybeSingle();
    if (!acc) {
      return NextResponse.json({ error: 'Cuenta inválida' }, { status: 400 });
    }
    if (body.categoryId) {
      const { data: cat } = await supabase
        .from('categories')
        .select('id')
        .eq('id', body.categoryId)
        .eq('user_id', user.id)
        .maybeSingle();
      if (!cat) {
        return NextResponse.json({ error: 'Categoría inválida' }, { status: 400 });
      }
    }

    const { data, error } = await supabase
      .from('recurring_rules')
      .insert({
        user_id: user.id,
        account_id: body.accountId,
        type: body.type,
        amount,
        currency: cur,
        category_id: body.categoryId || null,
        description: body.description,
        is_subscription: Boolean(body.isSubscription),
        subscription_name: body.subscriptionName || null,
        subscription_plan: body.subscriptionPlan || null,
        notification_enabled: body.notificationEnabled !== false,
        frequency: body.frequency,
        start_date: body.startDate,
        end_date: body.endDate || null,
        is_active: true,
      })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json(data, { status: 201 });
  } catch (error: any) {
    console.error('Recurring POST error:', error);
    return NextResponse.json({ error: error.message || 'Error al crear la regla recurrente' }, { status: 500 });
  }
}
