import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

// Estado del tour de primeros pasos, por usuario (sobrevive limpiar cache/cookies).
export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: row } = await supabase
      .from('users')
      .select('onboarding_done')
      .eq('id', user.id)
      .single();

    return NextResponse.json({ done: row?.onboarding_done === true });
  } catch (e) {
    console.error('onboarding GET:', e);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const done = body?.done === false ? false : true;

    const { error } = await supabase
      .from('users')
      .update({ onboarding_done: done })
      .eq('id', user.id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true, done });
  } catch (e) {
    console.error('onboarding POST:', e);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
