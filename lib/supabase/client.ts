import { createBrowserClient } from '@supabase/ssr';

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          if (typeof document === 'undefined') return undefined;
          const value = `; ${document.cookie}`;
          const parts = value.split(`; ${name}=`);
          if (parts.length === 2) return parts.pop()?.split(';').shift();
        },
        set(name: string, value: string, options: any) {
          if (typeof document === 'undefined') return;
          document.cookie = `${name}=${value}; path=/; max-age=${options.maxAge}; ${options.sameSite ? `SameSite=${options.sameSite}` : ''}; ${options.secure ? 'Secure' : ''}`;
        },
        remove(name: string, options: any) {
          if (typeof document === 'undefined') return;
          document.cookie = `${name}=; path=/; max-age=0`;
        },
      },
    }
  );
}
