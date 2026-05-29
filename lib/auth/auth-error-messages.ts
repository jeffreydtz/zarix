/**
 * Mensajes legibles para errores de Supabase Auth (evita inglés crudo en la UI).
 * @see https://supabase.com/docs/guides/auth/rate-limits
 */
export function translateSupabaseAuthError(message: string): string {
  const m = message.toLowerCase();

  if (m.includes('email rate limit') || (m.includes('rate limit') && m.includes('email'))) {
    return (
      'Límite de correos alcanzado (Supabase). Pasó el máximo de confirmaciones o enlaces por hora. ' +
      'Esperá unos minutos y volvé a intentar, o en el panel de Supabase: Authentication → Rate Limits, subí los valores. ' +
      'Si probás muchos registros, desactivá temporalmente “Confirm email” en Auth → Providers → Email (solo desarrollo) o usá SMTP propio.'
    );
  }

  if (m.includes('user already registered') || m.includes('already been registered')) {
    return 'Ese email ya está registrado. Probá iniciar sesión o recuperar contraseña.';
  }

  if (m.includes('invalid login credentials') || m.includes('invalid credentials')) {
    return 'Email o contraseña incorrectos.';
  }

  if (m.includes('email not confirmed')) {
    return 'Tenés que confirmar el correo antes de entrar. Revisá tu bandeja (y spam).';
  }

  return message;
}

/**
 * Mensajes es-AR para errores de passkeys (WebAuthn). Cubre los códigos de
 * `WebAuthnError` (que no se re-exporta desde supabase-js, así que se detecta
 * por la propiedad `code`) y errores de Auth del servidor.
 */
export function translatePasskeyError(error: unknown): string {
  const code =
    error && typeof error === 'object' && 'code' in error
      ? String((error as { code?: unknown }).code)
      : '';

  switch (code) {
    case 'ERROR_CEREMONY_ABORTED':
      return 'Cancelaste el ingreso con passkey o se agotó el tiempo. Probá de nuevo.';
    case 'ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED':
      return 'Este dispositivo ya tiene una passkey registrada para tu cuenta.';
    case 'ERROR_INVALID_DOMAIN':
    case 'ERROR_INVALID_RP_ID':
      return 'No se pudo validar el dominio de la passkey. Si el problema sigue, avisá al soporte.';
    case 'ERROR_AUTHENTICATOR_MISSING_USER_VERIFICATION_SUPPORT':
      return 'Tu dispositivo no permite verificación biométrica o PIN para passkeys.';
    case 'ERROR_AUTHENTICATOR_MISSING_DISCOVERABLE_CREDENTIAL_SUPPORT':
      return 'Tu dispositivo no soporta passkeys reutilizables. Usá email y contraseña.';
  }

  const message = error instanceof Error ? error.message : String(error ?? '');
  const m = message.toLowerCase();

  if (m.includes('no passkey') || m.includes('no credentials') || m.includes('not found')) {
    return 'No encontramos una passkey para iniciar sesión. Registrá una desde Configuración o usá email y contraseña.';
  }

  return translateSupabaseAuthError(message);
}
