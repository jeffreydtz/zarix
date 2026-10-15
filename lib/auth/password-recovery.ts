export const PASSWORD_RECOVERY_REQUEST_PATH = '/auth/forgot-password';
export const PASSWORD_RECOVERY_UPDATE_PATH = '/auth/update-password';
export const PASSWORD_RECOVERY_EMAIL_MESSAGE = 'Si existe una cuenta asociada a ese email, recibirás un enlace para cambiar tu contraseña.';

type RecoveryField = 'email' | 'password' | 'confirmation';
export class PasswordRecoveryError extends Error {
  constructor(public field: RecoveryField, message: string) {
    super(message);
    this.name = 'PasswordRecoveryError';
  }
}

interface RecoveryAuth {
  resetPasswordForEmail(email: string, options: { redirectTo: string }): Promise<{ error: unknown }>;
  getUser(): Promise<{ data: { user: { id: string } | null }; error: unknown }>;
  updateUser(attributes: { password: string }): Promise<{ data: { user: { id: string } | null }; error: unknown }>;
}

export async function requestPasswordRecovery(auth: RecoveryAuth, email: string, origin: string): Promise<string> {
  if (!email.trim()) throw new PasswordRecoveryError('email', 'Ingresá tu email.');
  const callback = new URL('/auth/callback', origin);
  callback.searchParams.set('next', PASSWORD_RECOVERY_UPDATE_PATH);
  try {
    const { error } = await auth.resetPasswordForEmail(email.trim(), { redirectTo: callback.href });
    if (error) throw error;
  } catch {
    throw new PasswordRecoveryError('email', 'No pudimos enviar el enlace. Volvé a intentar en unos minutos.');
  }
  // This is deliberately identical for known and unknown email addresses.
  return PASSWORD_RECOVERY_EMAIL_MESSAGE;
}

export async function updateRecoveredPassword(auth: RecoveryAuth, password: string, confirmation: string, expectedUserId?: string): Promise<void> {
  // The existing registration form already applies the same six-character rule.
  if (password.length < 6) throw new PasswordRecoveryError('password', 'La contraseña debe tener al menos 6 caracteres.');
  if (password !== confirmation) throw new PasswordRecoveryError('confirmation', 'Las contraseñas no coinciden.');
  try {
    // A stale recovery form must not change another identity's password after
    // a sign-in/account switch in the same browser.
    const current = await auth.getUser();
    if (current.error || !expectedUserId || current.data.user?.id !== expectedUserId) throw new Error('Recovery identity changed');
    const { data, error } = await auth.updateUser({ password });
    if (error || data.user?.id !== expectedUserId) throw error || new Error('Auth did not confirm the same user');
  } catch {
    throw new PasswordRecoveryError('password', 'No pudimos cambiar la contraseña. Volvé a intentar o solicitá un enlace nuevo.');
  }
}
