import { AsyncLocalStorage } from 'node:async_hooks';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { mintUserAccessToken } from '@/lib/auth/user-jwt';

export type PatRequestScope = {
  userId: string;
  userClient: SupabaseClient;
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

export function getPatRequestScope(): PatRequestScope | undefined {
  return store.getStore();
}

export function isServiceScopedTable(table: string): boolean {
  return SERVICE_TABLES.has(table);
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

/** Run PAT/inbox work as the fixture user so RLS applies. Falls back if JWT secret is unset. */
export async function withPatUserScope<T>(userId: string, fn: () => Promise<T>): Promise<T> {
  const existing = store.getStore();
  if (existing?.userId === userId) return fn();
  const token = mintUserAccessToken(userId);
  if (!token) return fn();
  return store.run({ userId, userClient: createUserScopedClient(token) }, fn);
}
