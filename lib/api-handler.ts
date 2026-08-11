import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { User as AuthUser } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';

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
 * Resuelve el usuario autenticado o lanza ApiError(401). Reemplaza el bloque
 * `const { data: { user } } = await supabase.auth.getUser(); if (!user) 401`.
 */
export async function requireUser(): Promise<AuthedContext> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
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
  // Error no controlado: log completo del lado server, genérico al cliente.
  console.error('[api] unhandled error:', error);
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
