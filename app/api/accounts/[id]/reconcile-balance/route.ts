import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { transactionsService } from '@/lib/services/transactions';

/**
 * Recalcula el saldo de la cuenta desde el libro de movimientos (misma lógica que el trigger).
 * POST sin body. Útil si hubo inconsistencias tras borrar movimientos (p. ej. ajustes de saldo).
 */
export async function POST(
  _req: NextRequest,
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

    const result = await transactionsService.recomputeAccountBalanceFromLedger(user.id, params.id);
    return NextResponse.json({
      success: true,
      before: result.before,
      after: result.after,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error al recalcular saldo';
    console.error('reconcile-balance:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
