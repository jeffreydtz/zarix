import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getEmailRedirectOrigin } from '@/lib/auth/email-redirect';
import { PASSWORD_RECOVERY_REQUEST_PATH, PASSWORD_RECOVERY_UPDATE_PATH } from '@/lib/auth/password-recovery';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const requestUrl = new URL(req.url);
  const code = requestUrl.searchParams.get('code');
  const isPasswordRecovery = requestUrl.searchParams.get('next') === PASSWORD_RECOVERY_UPDATE_PATH;
  /** Origen confiable (env) para evitar open redirects por cabecera `Host` en despliegues mal configurados. */
  const siteOrigin = getEmailRedirectOrigin(req);
  const publicAccessError = 'No pudimos completar el acceso. Volvé a intentar.';
  const recoveryRedirect = (destination: string) => {
    const response = NextResponse.redirect(`${siteOrigin}${destination}`);
    response.headers.set('Cache-Control', 'no-store');
    response.headers.set('Referrer-Policy', 'no-referrer');
    return response;
  };
  const invalidRecovery = () => recoveryRedirect(`${PASSWORD_RECOVERY_REQUEST_PATH}?invalid_link=1`);

  if (process.env.NODE_ENV !== 'production') {
    console.log('Auth callback:', { hasCode: Boolean(code) });
  }

  if (code) {
    try {
      const supabase = await createClient();
      const { error } = await supabase.auth.exchangeCodeForSession(code);

      if (error) {
        if (isPasswordRecovery) return invalidRecovery();
        if (process.env.NODE_ENV !== 'production') {
          console.error('Auth code exchange failed');
        }
        return NextResponse.redirect(`${siteOrigin}/login?error=${encodeURIComponent(publicAccessError)}`);
      }

      if (isPasswordRecovery) return recoveryRedirect(PASSWORD_RECOVERY_UPDATE_PATH);
      return NextResponse.redirect(`${siteOrigin}/dashboard`);
    } catch {
      if (isPasswordRecovery) return invalidRecovery();
      if (process.env.NODE_ENV !== 'production') {
        console.error('Auth callback failed');
      }
      return NextResponse.redirect(`${siteOrigin}/login?error=${encodeURIComponent(publicAccessError)}`);
    }
  }

  if (isPasswordRecovery) return invalidRecovery();
  return NextResponse.redirect(
    `${siteOrigin}/login?error=${encodeURIComponent('No authorization code provided')}`
  );
}
