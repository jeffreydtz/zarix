import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { sharedExpensesService } from '@/lib/services/sharedExpenses';
import { isTransactionCurrency } from '@/lib/constants/transaction-currencies';

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const groups = await sharedExpensesService.listGroupsForOwner(user.id);
    return NextResponse.json(groups);
  } catch (error: any) {
    console.error('Shared groups GET error:', error);
    return NextResponse.json(
      { error: error.message || 'Error al obtener los grupos compartidos' },
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

    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (!name || name.length > 80) {
      return NextResponse.json(
        { error: 'El nombre del grupo es obligatorio (máx. 80 caracteres)' },
        { status: 400 }
      );
    }

    const currency = typeof body.currency === 'string' ? body.currency.toUpperCase() : 'ARS';
    if (!isTransactionCurrency(currency)) {
      return NextResponse.json({ error: 'Moneda inválida' }, { status: 400 });
    }

    const rawMembers = Array.isArray(body.members) ? body.members : [];
    if (rawMembers.length > 30) {
      return NextResponse.json({ error: 'Máximo 30 miembros por grupo' }, { status: 400 });
    }
    const members = rawMembers
      .map((m: any) => ({
        displayName: typeof m?.displayName === 'string' ? m.displayName.trim().slice(0, 60) : '',
        email: typeof m?.email === 'string' && m.email.trim() ? m.email.trim() : null,
        phone: typeof m?.phone === 'string' && m.phone.trim() ? m.phone.trim() : null,
      }))
      .filter((m: { displayName: string }) => m.displayName.length > 0);

    const group = await sharedExpensesService.createGroup({
      ownerUserId: user.id,
      name,
      currency,
      members,
    });

    return NextResponse.json(group, { status: 201 });
  } catch (error: any) {
    console.error('Shared groups POST error:', error);
    return NextResponse.json(
      { error: error.message || 'Error al crear el grupo compartido' },
      { status: 500 }
    );
  }
}
