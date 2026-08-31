const ACCOUNT_DETAIL = /^\/accounts\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

export function accountIdFromPathname(pathname: string | null | undefined): string | undefined {
  if (!pathname) return undefined;
  const m = pathname.match(ACCOUNT_DETAIL);
  return m?.[1];
}
