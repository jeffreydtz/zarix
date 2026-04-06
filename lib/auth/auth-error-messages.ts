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
