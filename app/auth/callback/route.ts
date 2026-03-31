import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const requestUrl = new URL(req.url);
  const code = requestUrl.searchParams.get('code');
  const origin = requestUrl.origin;

  console.log('🔍 Auth callback received:', { code: code?.substring(0, 10), origin });

  if (code) {
    try {
      const supabase = await createClient();
      const { data, error } = await supabase.auth.exchangeCodeForSession(code);
      
      if (error) {
        console.error('❌ Error exchanging code:', error);
        return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(error.message)}`);
      }

      console.log('✅ Session created for user:', data.user?.email);
      
      // Redirect to dashboard
      return NextResponse.redirect(`${origin}/dashboard`);
    } catch (err: any) {
      console.error('❌ Unexpected error:', err);
      return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(err.message)}`);
    }
  }

  // No code provided
  console.warn('⚠️ No code in callback');
  return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent('No authorization code provided')}`);
}
