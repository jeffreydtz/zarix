import type { SupabaseClient } from '@supabase/supabase-js';
import { ApiError } from '@/lib/api-handler';
import { createClient } from '@/lib/supabase/server';
import {
  PRESENTATION_PREFERENCES_COLUMNS,
  presentationPreferencesSchema,
  type PresentationPreferences,
} from '@/lib/presentation-preferences';

/** Uses the session client and the verified owner, preserving users RLS. */
export async function readPresentationPreferences(
  supabase: SupabaseClient,
  userId: string,
): Promise<PresentationPreferences> {
  const { data, error } = await supabase.from('users')
    .select(PRESENTATION_PREFERENCES_COLUMNS).eq('id', userId).single();
  if (error) throw error;
  if (!data) throw new ApiError('No se encontró tu configuración.', 404);
  return presentationPreferencesSchema.parse(data);
}

export async function getPresentationPreferences(userId: string): Promise<PresentationPreferences> {
  return readPresentationPreferences(await createClient(), userId);
}
