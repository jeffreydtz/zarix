import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { sharedExpensesService } from '@/lib/services/sharedExpenses';

export async function DELETE(
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

    await sharedExpensesService.deleteGroup(params.id, user.id);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Shared group DELETE error:', error);
    return NextResponse.json(
      { error: error.message || 'Error al eliminar el grupo' },
      { status: 500 }
    );
  }
}
