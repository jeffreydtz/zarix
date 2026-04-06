import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { accountsService } from '@/lib/services/accounts';

export async function GET(
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

    const account = await accountsService.getById(params.id, user.id);
    if (!account) {
      return NextResponse.json({ error: 'Cuenta no encontrada' }, { status: 404 });
    }
    return NextResponse.json(account);
  } catch (error: any) {
    console.error('Account GET error:', error);
    return NextResponse.json(
      { error: error.message || 'Cuenta no encontrada' },
      { status: 404 }
    );
  }
}

export async function PATCH(
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
    const { balance: _b, user_id: _u, id: _i, ...safe } = body as Record<string, unknown>;

    const account = await accountsService.update(params.id, user.id, safe);
    return NextResponse.json(account);
  } catch (error: any) {
    console.error('Account PATCH error:', error);
    return NextResponse.json(
      { error: error.message || 'Error al actualizar la cuenta' },
      { status: 500 }
    );
  }
}

export const PUT = PATCH;

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

    await accountsService.delete(params.id, user.id);
    return new NextResponse(null, { status: 204 });
  } catch (error: any) {
    console.error('Account DELETE error:', error);
    return NextResponse.json(
      { error: error.message || 'Error al eliminar la cuenta' },
      { status: 500 }
    );
  }
}
