import { cache } from 'react';
import type { User } from '@supabase/supabase-js';
import { isRejectedSessionError } from './session-error';
import { createClient } from '@/lib/supabase/server';

export const getCachedUser = cache(async (): Promise<User | null> => {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error) {
    if (isRejectedSessionError(error)) {
      return null;
    }
    throw error;
  }
  return user;
});
