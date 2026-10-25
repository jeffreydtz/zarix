import { createServerClient } from '@supabase/ssr';
import { NextRequest, NextResponse } from 'next/server';
import type { CookieOptions } from '@supabase/ssr';
import type { User } from '@supabase/supabase-js';
import { isRejectedSessionError } from '@/lib/auth/session-error';
import { isPublicAppPath } from '@/lib/auth/public-paths';

export async function middleware(req: NextRequest) {
  const pathname = req.nextUrl.pathname;
  const isPublicAsset =
    pathname === '/sw.js' ||
    pathname === '/manifest.json' ||
    pathname === '/favicon.ico' ||
    pathname === '/apple-touch-icon.png' ||
    pathname.startsWith('/logo-formats/');

  if (isPublicAsset) {
    return NextResponse.next({
      request: req,
    });
  }

  let supabaseResponse = NextResponse.next({
    request: req,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return req.cookies.getAll();
        },
        setAll(cookiesToSet: Array<{ name: string; value: string; options: CookieOptions }>) {
          cookiesToSet.forEach(({ name, value }) =>
            req.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({
            request: req,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Refresh session if expired
  let user: User | null = null;
  let authError: unknown;
  try {
    const result = await supabase.auth.getUser();
    user = result.data.user;
    authError = result.error;
  } catch (error) {
    authError = error;
  }

  const isPublicPath = isPublicAppPath(pathname);

  if (!isPublicPath && authError && !isRejectedSessionError(authError)) {
    const unavailable = new NextResponse('No pudimos verificar tu sesión. Volvé a intentar en unos minutos.', {
      status: 503,
      headers: { 'Cache-Control': 'no-store', 'Retry-After': '30', 'Content-Type': 'text/plain; charset=utf-8' },
    });
    supabaseResponse.cookies.getAll().forEach(cookie => unavailable.cookies.set(cookie));
    return unavailable;
  }

  if ((!user || authError) && !isPublicPath) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|manifest.json|sw.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$|api|login|register|auth).*)',
  ],
};
