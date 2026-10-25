import { NextRequest, NextResponse } from 'next/server';
import { errorResponse, requireUser } from '@/lib/api-handler';
import { assertSameOrigin } from '@/lib/auth/origin';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    assertSameOrigin(req);
    const { user, supabase } = await requireUser();
    const body = await req.json().catch(() => ({}));
    const enabled = body.wallet_auto_confirm === true;
    const { error } = await supabase.from('users').update({ wallet_auto_confirm: enabled }).eq('id', user.id);
    if (error) throw error;
    return NextResponse.json({ wallet_auto_confirm: enabled });
  } catch (error) {
    return errorResponse(error);
  }
}
