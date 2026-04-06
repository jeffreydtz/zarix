import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClientSync } from '@/lib/supabase/server';
import { transactionsService } from '@/lib/services/transactions';

const MAX_BULK = 500;

interface BulkUpdateBody {
  transactionIds: string[];
  categoryId?: string | null;
  accountId?: string;
}

interface BulkDeleteBody {
  transactionIds: string[];
}

export async function PATCH(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = (await req.json()) as BulkUpdateBody;
    const transactionIds = Array.isArray(body.transactionIds) ? body.transactionIds.filter(Boolean) : [];

    if (transactionIds.length === 0) {
      return NextResponse.json({ error: 'No hay movimientos seleccionados' }, { status: 400 });
    }

    if (transactionIds.length > MAX_BULK) {
      return NextResponse.json(
        { error: `Máximo ${MAX_BULK} movimientos por operación` },
        { status: 400 }
      );
    }

    const updates: { category_id?: string | null; account_id?: string } = {};

    if (body.categoryId !== undefined) {
      updates.category_id = body.categoryId;
    }
    if (body.accountId) {
      updates.account_id = body.accountId;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No hay cambios para aplicar' }, { status: 400 });
    }

    const serviceClient = createServiceClientSync();
    const { data, error } = await serviceClient
      .from('transactions')
      .update(updates)
      .eq('user_id', user.id)
      .in('id', transactionIds)
      .select('id');

    if (error) throw error;

    return NextResponse.json({
      success: true,
      updated: data?.length || 0,
    });
  } catch (error: any) {
    console.error('Bulk transactions PATCH error:', error);
    return NextResponse.json(
      { error: error.message || 'Error al actualizar movimientos masivamente' },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = (await req.json()) as BulkDeleteBody;
    const transactionIds = Array.isArray(body.transactionIds)
      ? body.transactionIds.filter((id): id is string => Boolean(id && typeof id === 'string'))
      : [];

    if (transactionIds.length === 0) {
      return NextResponse.json({ error: 'No hay movimientos seleccionados' }, { status: 400 });
    }

    if (transactionIds.length > MAX_BULK) {
      return NextResponse.json(
        { error: `Máximo ${MAX_BULK} movimientos por operación` },
        { status: 400 }
      );
    }

    const serviceClient = createServiceClientSync();

    const { data: affectedRows, error: preErr } = await serviceClient
      .from('transactions')
      .select('account_id, destination_account_id')
      .eq('user_id', user.id)
      .in('id', transactionIds);

    if (preErr) throw preErr;

    const { data, error } = await serviceClient
      .from('transactions')
      .delete()
      .eq('user_id', user.id)
      .in('id', transactionIds)
      .select('id');

    if (error) throw error;

    const accountIds = new Set<string>();
    for (const row of affectedRows || []) {
      if (row.account_id) accountIds.add(row.account_id);
      if (row.destination_account_id) accountIds.add(row.destination_account_id);
    }
    for (const accId of accountIds) {
      try {
        await transactionsService.recomputeAccountBalanceFromLedger(user.id, accId);
      } catch (e) {
        console.error('reconcile after bulk delete', accId, e);
      }
    }

    return NextResponse.json({
      success: true,
      deleted: data?.length ?? 0,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error al eliminar movimientos';
    console.error('Bulk transactions DELETE error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
