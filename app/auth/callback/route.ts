import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getEmailRedirectOrigin } from '@/lib/auth/email-redirect';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const requestUrl = new URL(req.url);
  const code = requestUrl.searchParams.get('code');
  /** Origen confiable (env) para evitar open redirects por cabecera `Host` en despliegues mal configurados. */
  const siteOrigin = getEmailRedirectOrigin(req);

  if (process.env.NODE_ENV !== 'production') {
    console.log('Auth callback:', { hasCode: Boolean(code) });
  }

  if (code) {
    try {
      const supabase = await createClient();
      const { error } = await supabase.auth.exchangeCodeForSession(code);

      if (error) {
        if (process.env.NODE_ENV !== 'production') {
          console.error('exchangeCodeForSession:', error);
        }
        return NextResponse.redirect(`${siteOrigin}/login?error=${encodeURIComponent(error.message)}`);
      }

      return NextResponse.redirect(`${siteOrigin}/dashboard`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      if (process.env.NODE_ENV !== 'production') {
        console.error('Auth callback error:', err);
      }
      return NextResponse.redirect(`${siteOrigin}/login?error=${encodeURIComponent(message)}`);
    }
  }

  return NextResponse.redirect(
    `${siteOrigin}/login?error=${encodeURIComponent('No authorization code provided')}`
  );
}
