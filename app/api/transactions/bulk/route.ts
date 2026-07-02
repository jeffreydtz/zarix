import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClientSync } from '@/lib/supabase/server';
import { transactionsService } from '@/lib/services/transactions';

export const maxDuration = 60;

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

    // Verificar que la cuenta/categoría destino pertenezcan al usuario antes de
    // re-apuntar movimientos (evita re-asignar a recursos de otro usuario).
    let targetAccountCurrency: string | null = null;
    if (updates.account_id) {
      const { data: acc } = await serviceClient
        .from('accounts')
        .select('id, currency')
        .eq('id', updates.account_id)
        .eq('user_id', user.id)
        .maybeSingle();
      if (!acc) {
        return NextResponse.json({ error: 'Cuenta inválida' }, { status: 400 });
      }
      targetAccountCurrency = acc.currency;
    }
    if (updates.category_id) {
      // Igual que en import: las categorías del sistema (is_system) también valen.
      const { data: cat } = await serviceClient
        .from('categories')
        .select('id')
        .eq('id', updates.category_id)
        .or(`user_id.eq.${user.id},is_system.eq.true`)
        .maybeSingle();
      if (!cat) {
        return NextResponse.json({ error: 'Categoría inválida' }, { status: 400 });
      }
    }

    // Mover de cuenta requiere recalcular amount_in_account_currency por fila y
    // excluir transferencias/ajustes (mismas reglas que el PATCH individual);
    // si no, el trigger de saldos aplica montos en la moneda equivocada.
    if (updates.account_id && targetAccountCurrency) {
      const { data: rows, error: rowsErr } = await serviceClient
        .from('transactions')
        .select('id, type, amount, currency')
        .eq('user_id', user.id)
        .in('id', transactionIds);

      if (rowsErr) throw rowsErr;

      const blocked = (rows || []).find(
        (r) => r.type === 'transfer' || r.type === 'adjustment'
      );
      if (blocked) {
        return NextResponse.json(
          { error: 'Las transferencias y ajustes no se pueden mover de cuenta: borralos y recrealos.' },
          { status: 400 }
        );
      }

      // Pre-resolver cotizaciones por moneda antes de escribir: si alguna falla,
      // no se aplica ningún cambio (evita movimientos a medio convertir).
      const rateByCurrency = new Map<string, { rate: number; exchange_rate: number | null }>();
      for (const row of rows || []) {
        const cur = String(row.currency || 'ARS').trim().toUpperCase();
        if (rateByCurrency.has(cur)) continue;
        try {
          const rec = await transactionsService.recomputeExpenseIncomeAmountFields(
            1,
            cur,
            targetAccountCurrency
          );
          rateByCurrency.set(cur, {
            rate: rec.amount_in_account_currency,
            exchange_rate: rec.exchange_rate,
          });
        } catch {
          return NextResponse.json(
            { error: `No hay cotización disponible para convertir ${cur} a ${targetAccountCurrency}; reintentá más tarde.` },
            { status: 400 }
          );
        }
      }

      let updated = 0;
      for (const row of rows || []) {
        const cur = String(row.currency || 'ARS').trim().toUpperCase();
        const conv = rateByCurrency.get(cur)!;
        const { error: updErr } = await serviceClient
          .from('transactions')
          .update({
            ...updates,
            amount_in_account_currency: Number(row.amount) * conv.rate,
            exchange_rate: conv.exchange_rate,
          })
          .eq('id', row.id)
          .eq('user_id', user.id);

        if (updErr) throw updErr;
        updated++;
      }

      return NextResponse.json({
        success: true,
        updated,
      });
    }

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
