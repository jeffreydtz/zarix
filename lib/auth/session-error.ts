import { isAuthApiError, isAuthSessionMissingError } from '@supabase/supabase-js';

/** Only an absent or rejected credential establishes that the user needs to log in. */
export function isRejectedSessionError(error: unknown): boolean {
  return isAuthSessionMissingError(error) ||
    (isAuthApiError(error) && (
      error.status === 401 || error.status === 403 ||
      (error.status === 400 && ['bad_jwt', 'session_expired', 'refresh_token_not_found', 'refresh_token_already_used'].includes(error.code ?? ''))
    ));
}
