import { AsyncLocalStorage } from 'node:async_hooks';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { mintUserAccessToken } from '@/lib/auth/user-jwt';

export type PatRequestScope = {
  userId: string;
  userClient: SupabaseClient | null;
  jwt: boolean;
};

const store = new AsyncLocalStorage<PatRequestScope>();

const SERVICE_TABLES = new Set([
  'personal_access_tokens',
  'integration_audit_log',
  'transaction_requests',
  'notification_outbox',
  'users',
  'exchange_rates',
]);

/** Global market data: no user_id column. Everything else in a PAT scope is tenant-filtered. */
export const UNSCOPED_SERVICE_TABLES = new Set(['exchange_rates']);

export function getPatRequestScope(): PatRequestScope | undefined {
  return store.getStore();
}

export function isServiceScopedTable(table: string): boolean {
  return SERVICE_TABLES.has(table);
}

export function userScopeColumn(table: string): 'user_id' | 'id' | null {
  if (UNSCOPED_SERVICE_TABLES.has(table)) return null;
  return table === 'users' ? 'id' : 'user_id';
}

function scopeMismatch(): never {
  const err = new Error('No autorizado') as Error & { status: number };
  err.status = 403;
  throw err;
}

function injectUserId(rows: unknown, column: 'user_id' | 'id', userId: string): unknown {
  const list = Array.isArray(rows) ? rows : [rows];
  const scoped = list.map((row) => {
    if (!row || typeof row !== 'object') return row;
    const rec = { ...(row as Record<string, unknown>) };
    const current = rec[column];
    if (current != null && current !== userId) scopeMismatch();
    rec[column] = userId;
    return rec;
  });
  return Array.isArray(rows) ? scoped : scoped[0];
}

/**
 * Forces every select/update/delete through `.eq(user_id|id, userId)` and
 * injects that column on insert/upsert. Used when the JWT secret is unset so
 * PAT work cannot run as an unscoped service role.
 */
export function wrapWithUserIdFilter<T extends object>(query: T, table: string, userId: string): T {
  const column = userScopeColumn(table);
  if (!column) return query;

  const wrap = (inner: object): object =>
    new Proxy(inner, {
      get(target, prop, receiver) {
        if (prop === 'insert' || prop === 'upsert') {
          return (rows: unknown, options?: unknown) =>
            wrap((target as Record<string, (a: unknown, b?: unknown) => object>)[prop](
              injectUserId(rows, column, userId),
              options
            ));
        }
        if (prop === 'select' || prop === 'update' || prop === 'delete') {
          return (...args: unknown[]) => {
            const next = (target as Record<string, (...a: unknown[]) => { eq?: (c: string, v: string) => object }>)[prop](
              ...args
            );
            return wrap(typeof next?.eq === 'function' ? next.eq(column, userId) : next);
          };
        }
        const value = Reflect.get(target, prop, receiver);
        if (typeof value === 'function') {
          return (...args: unknown[]) => {
            const result = (value as (...a: unknown[]) => unknown).apply(target, args);
            if (result && typeof result === 'object' && result !== target && typeof (result as { then?: unknown }).then !== 'function') {
              return wrap(result);
            }
            return result;
          };
        }
        return value;
      },
    });

  return wrap(query) as T;
}

function createUserScopedClient(accessToken: string): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: {
        headers: { Authorization: `Bearer ${accessToken}` },
        fetch: (url, init) => fetch(url, { ...init, cache: 'no-store' }),
      },
    }
  );
}

/**
 * Run PAT/inbox work as the fixture user. JWT+RLS when SUPABASE_JWT_SECRET is
 * set; otherwise ALS still holds userId and the service client is filtered by
 * user_id (users.id). Isolation never depends on the JWT secret being present.
 */
export async function withPatUserScope<T>(userId: string, fn: () => Promise<T>): Promise<T> {
  const existing = store.getStore();
  if (existing?.userId === userId) return fn();
  const token = mintUserAccessToken(userId);
  if (token) {
    return store.run({ userId, userClient: createUserScopedClient(token), jwt: true }, fn);
  }
  return store.run({ userId, userClient: null, jwt: false }, fn);
}
