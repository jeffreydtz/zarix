/** Paths that do not require a session. Keep in sync with middleware. */
export function isPublicAppPath(pathname: string): boolean {
  return (
    pathname === '/' ||
    pathname === '/docs' ||
    pathname.startsWith('/docs/') ||
    pathname === '/demo' ||
    pathname.startsWith('/demo/') ||
    pathname === '/login' ||
    pathname.startsWith('/login/') ||
    pathname === '/register' ||
    pathname.startsWith('/register/') ||
    pathname === '/auth' ||
    pathname.startsWith('/auth/') ||
    pathname.startsWith('/shared/')
  );
}
