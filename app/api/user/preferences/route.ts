import { NextResponse } from 'next/server';
import { ApiError, withAuth } from '@/lib/api-handler';
import {
  PRESENTATION_PREFERENCES_COLUMNS,
  presentationPreferencesSchema,
} from '@/lib/presentation-preferences';
import { readPresentationPreferences } from '@/lib/services/presentation-preferences';

export const dynamic = 'force-dynamic';

export const GET = withAuth(async ({ supabase, user }) =>
  NextResponse.json(await readPresentationPreferences(supabase, user.id)));

export const PUT = withAuth(async ({ supabase, user }, request) => {
  const formOwner = request.headers.get('X-Preferences-Owner');
  if (formOwner !== null && formOwner !== user.id) {
    throw new ApiError('La sesión cambió. Recargá Configuración antes de guardar.', 403);
  }
  const body = await request.json().catch(() => null);
  // PUT confirms a complete, valid state before writing. A partial update must
  // not commit against a legacy unsupported base and then fail serialization.
  const parsed = presentationPreferencesSchema.safeParse(body);
  if (!parsed.success) {
    throw new ApiError('Preferencias inválidas. Usá ARS/USD y la visibilidad de Patrimonio.', 400);
  }

  // No caller-controlled user ID, generic profile update, or financial writes.
  const { data, error } = await supabase.from('users').update(parsed.data)
    .eq('id', user.id).select(PRESENTATION_PREFERENCES_COLUMNS).single();
  if (error) throw error;
  if (!data) throw new ApiError('No se encontró tu configuración.', 404);
  return NextResponse.json(presentationPreferencesSchema.parse(data));
});
