import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { sharedExpensesService } from '@/lib/services/sharedExpenses';
import { errorResponse } from '@/lib/api-handler';

export async function DELETE(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
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
    return errorResponse(error);
  }
}
