import { NextResponse } from 'next/server';
import { errorResponse, requireUser } from '@/lib/api-handler';
import { accountsService } from '@/lib/services/accounts';
import { getCardStatement } from '@/lib/services/card-statement';

export async function GET(
  _req: Request,
  props: { params: Promise<{ id: string }> }
) {
  const params = await props.params;
  try {
    const { user } = await requireUser();
    const account = await accountsService.getById(params.id, user.id);
    if (!account) {
      return NextResponse.json({ error: 'Cuenta no encontrada' }, { status: 404 });
    }
    if (account.type !== 'credit_card') {
      return NextResponse.json({ error: 'La cuenta no es una tarjeta de crédito.' }, { status: 400 });
    }
    const statement = await getCardStatement(user.id, params.id);
    if (!statement) {
      return NextResponse.json({ error: 'Cuenta no encontrada' }, { status: 404 });
    }
    return NextResponse.json(statement);
  } catch (error) {
    return errorResponse(error);
  }
}
