import { createBrowserClient } from '@supabase/ssr';
import { setOfflineOwner } from '@/lib/offline-owner';

function buildClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        experimental: { passkey: true },
      },
      cookies: {
        getAll() {
          if (typeof document === 'undefined') return [];
          return document.cookie
            .split('; ')
            .filter(Boolean)
            .map((cookie) => {
              const [name, ...rest] = cookie.split('=');
              return { name, value: rest.join('=') };
            });
        },
        setAll(cookiesToSet) {
          if (typeof document === 'undefined') return;
          for (const { name, value, options } of cookiesToSet) {
            let cookie = `${name}=${value}; path=${options?.path ?? '/'}`;
            if (options?.maxAge != null) cookie += `; max-age=${options.maxAge}`;
            if (options?.expires)
              cookie += `; expires=${options.expires.toUTCString()}`;
            if (options?.domain) cookie += `; domain=${options.domain}`;
            if (options?.sameSite) cookie += `; SameSite=${options.sameSite}`;
            if (options?.secure) cookie += '; Secure';
            document.cookie = cookie;
          }
        },
      },
    }
  );
}

// Singleton: un solo browser client por pestaña. Crear varios genera múltiples
// GoTrueClient que compiten por el mismo lock (LockManager) y storage de sesión,
// lo que vuelve lento/inestable el auth (incluido el flujo de passkeys).
let browserClient: ReturnType<typeof buildClient> | undefined;

export function createClient() {
  if (!browserClient) {
    browserClient = buildClient();
    browserClient.auth.onAuthStateChange((event, session) => {
      if (session?.user.id) setOfflineOwner(session.user.id);
      else if (event === 'SIGNED_OUT') setOfflineOwner(null);
    });
  }
  return browserClient;
}
