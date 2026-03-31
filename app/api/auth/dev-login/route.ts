import { NextRequest, NextResponse } from 'next/server';
import { createServiceClientSync } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const email = searchParams.get('email');
    const secret = searchParams.get('secret');

    if (!email || !secret) {
      return NextResponse.json(
        { error: 'Missing email or secret' },
        { status: 400 }
      );
    }

    if (secret !== process.env.DEV_LOGIN_SECRET) {
      return NextResponse.json(
        { error: 'Invalid secret' },
        { status: 401 }
      );
    }

    const supabase = createServiceClientSync();

    const { data: authUser, error: authError } = await supabase.auth.admin.listUsers();
    
    if (authError) {
      console.error('Error listing users:', authError);
      return NextResponse.json(
        { error: 'Error finding user' },
        { status: 500 }
      );
    }

    const user = authUser.users.find((u) => u.email === email);

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    const { data, error } = await supabase.auth.admin.generateLink({
      type: 'magiclink',
      email: email,
    });

    if (error) {
      console.error('Error generating link:', error);
      return NextResponse.json(
        { error: 'Error generating link' },
        { status: 500 }
      );
    }

    const origin = req.nextUrl.origin;
    const loginUrl = data.properties.action_link.replace(
      /^.*\/auth\/v1/,
      `${origin}/auth/callback`
    );

    return NextResponse.redirect(loginUrl);
  } catch (error) {
    console.error('Dev login error:', error);
    return NextResponse.json(
      { error: 'Internal error' },
      { status: 500 }
    );
  }
}
