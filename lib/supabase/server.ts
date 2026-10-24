import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { CookieOptions } from '@supabase/ssr';
import { getPatRequestScope, isServiceScopedTable } from '@/lib/supabase/request-scope';

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: Array<{ name: string; value: string; options: CookieOptions }>) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // The `setAll` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing
            // user sessions.
          }
        },
      },
    }
  );
}

function buildServiceRoleClient() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      cookies: {
        getAll() {
          return [];
        },
        setAll() {
          // No-op for service client
        },
      },
      // Evita que el Data Cache de Next sirva respuestas viejas de Supabase
      // en rutas sin cookies (ej: páginas públicas por share_token).
      global: {
        fetch: (url, init) => fetch(url, { ...init, cache: 'no-store' }),
      },
    }
  );
}

/** Always the service role. Use for PAT hash lookup, audit inserts and secret decrypt. */
export function createBareServiceClient() {
  return buildServiceRoleClient();
}

function withPatRowLevelSecurity<T extends ReturnType<typeof buildServiceRoleClient>>(service: T): T {
  const scope = getPatRequestScope();
  if (!scope) return service;
  return new Proxy(service, {
    get(target, prop, receiver) {
      if (prop === 'from') {
        return (table: string) =>
          isServiceScopedTable(table) ? target.from(table) : scope.userClient.from(table);
      }
      if (prop === 'rpc') {
        return (fn: string, args?: Record<string, unknown>, options?: never) => {
          if (args && typeof args.p_user_id === 'string' && args.p_user_id !== scope.userId) {
            const err = new Error('No autorizado') as Error & { status: number };
            err.status = 403;
            throw err;
          }
          return target.rpc(fn, args as never, options);
        };
      }
      const value = Reflect.get(target, prop, receiver);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  }) as T;
}

export async function createServiceClient() {
  return withPatRowLevelSecurity(buildServiceRoleClient());
}

// Cliente sin cookies para uso en webhooks y contextos sin request.
// Inside a PAT request this returns a proxy: tenant tables go through the
// user JWT (RLS), privileged tables/RPCs stay on the service role.
export function createServiceClientSync() {
  return withPatRowLevelSecurity(buildServiceRoleClient());
}
