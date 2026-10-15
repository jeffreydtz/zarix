import { planError } from '@/lib/plans/rules';
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { User as AuthUser } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { isRejectedSessionError } from '@/lib/auth/session-error';

// ─────────────────────────────────────────────────────────────────
// Utilidades compartidas para route handlers.
//
// Resuelven dos deudas del audit:
//  1. El bloque auth (createClient → getUser → 401) estaba copiado en ~42 rutas.
//  2. 33 handlers devolvían `error.message` crudo de Postgres/PostgREST al
//     browser (filtra nombres de tablas/constraints). `errorResponse` mapea
//     errores de dominio conocidos a un mensaje seguro y manda el resto a 500
//     genérico, con el detalle solo en los logs del server.
// ─────────────────────────────────────────────────────────────────

export class ApiError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export interface AuthedContext {
  supabase: SupabaseClient;
  user: AuthUser;
}

/**
 * Resuelve el usuario autenticado o lanza ApiError(401/503). Reemplaza el bloque
 * `const { data: { user } } = await supabase.auth.getUser(); if (!user) 401`.
 */
export async function requireUser(): Promise<AuthedContext> {
  const supabase = await createClient();
  let result;
  try {
    result = await supabase.auth.getUser();
  } catch {
    throw new ApiError('No pudimos verificar tu sesión. Volvé a intentar en unos minutos.', 503);
  }
  const { data: { user }, error } = result;
  if (error && !isRejectedSessionError(error)) {
    throw new ApiError('No pudimos verificar tu sesión. Volvé a intentar en unos minutos.', 503);
  }
  if (error || !user) {
    throw new ApiError('Unauthorized', 401);
  }
  return { supabase, user };
}

/**
 * Convierte un error en una respuesta JSON segura. Nunca filtra el mensaje
 * crudo de un error desconocido (evita exponer detalles de la DB).
 */
export function errorResponse(error: unknown): NextResponse {
  if (error instanceof ApiError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  const plan = planError(error);
  if (plan) return NextResponse.json({ error: plan.message }, { status: plan.status });
  // DB/provider errors can embed row values or credentials. Correlated handlers
  // emit fixed failure classes; legacy callers still get a content-free signal.
  console.error('[api] unhandled error');
  return NextResponse.json(
    { error: 'Ocurrió un error procesando la solicitud.' },
    { status: 500 }
  );
}

/**
 * Envuelve un handler autenticado: inyecta { supabase, user } y estandariza
 * el manejo de errores (401 + 500 genérico sin fuga). Uso:
 *
 *   export const GET = withAuth(async ({ user, supabase }) => { ... });
 */
export function withAuth(
  handler: (ctx: AuthedContext, req: Request) => Promise<NextResponse>
) {
  return async (req: Request): Promise<NextResponse> => {
    try {
      const ctx = await requireUser();
      return await handler(ctx, req);
    } catch (error) {
      return errorResponse(error);
    }
  };
}
