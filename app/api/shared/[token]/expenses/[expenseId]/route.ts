import { NextRequest, NextResponse } from 'next/server';
import { sharedExpensesService, isValidShareToken } from '@/lib/services/sharedExpenses';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { token: string; expenseId: string } }
) {
  try {
    if (!isValidShareToken(params.token) || !UUID_REGEX.test(params.expenseId)) {
      return NextResponse.json({ error: 'Link inválido' }, { status: 404 });
    }

    const deleted = await sharedExpensesService.deleteExpenseByToken(
      params.token,
      params.expenseId
    );
    if (!deleted) {
      return NextResponse.json({ error: 'Grupo no encontrado' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Shared expense DELETE error:', error);
    return NextResponse.json(
      { error: error.message || 'Error al eliminar el gasto' },
      { status: 500 }
    );
  }
}
