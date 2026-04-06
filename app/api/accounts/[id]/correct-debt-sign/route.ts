import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { accountsService } from '@/lib/services/accounts';

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

    const result = await accountsService.correctDebtBalanceSignIfPositive(params.id, user.id);

    if (!result) {
      return NextResponse.json({
        ok: true,
        changed: false,
        message: 'No hacía falta (el saldo ya estaba en negativo o no es cuenta de deuda).',
      });
    }

    return NextResponse.json({
      ok: true,
      changed: true,
      before: result.before,
      after: result.after,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error al corregir el saldo';
    console.error('correct-debt-sign error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
