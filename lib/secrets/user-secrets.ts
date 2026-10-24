import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { createServiceClientSync } from '@/lib/supabase/server';

const AES_PREFIX = 'aesgcm:v1:';
const ENVELOPE_PREFIX = 'envelope:v0:';

function masterKey(): Buffer {
  const explicit = process.env.ZARIX_SECRETS_MASTER_KEY?.trim();
  const material = explicit || process.env.SUPABASE_SERVICE_ROLE_KEY || 'zarix-dev-secrets-key';
  return createHash('sha256').update(`zarix-user-secrets:v1:${material}`).digest();
}

export function encryptSecret(plain: string | null | undefined): string | null {
  if (plain == null || plain === '') return null;
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', masterKey(), iv);
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${AES_PREFIX}${iv.toString('base64')}:${tag.toString('base64')}:${ct.toString('base64')}`;
}

export function decryptSecret(stored: string | null | undefined): string | null {
  if (!stored) return null;
  try {
    if (stored.startsWith(AES_PREFIX)) {
      const rest = stored.slice(AES_PREFIX.length);
      const [ivB64, tagB64, ctB64] = rest.split(':');
      if (!ivB64 || !tagB64 || !ctB64) return null;
      const decipher = createDecipheriv('aes-256-gcm', masterKey(), Buffer.from(ivB64, 'base64'));
      decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
      return Buffer.concat([decipher.update(Buffer.from(ctB64, 'base64')), decipher.final()]).toString('utf8');
    }
    if (stored.startsWith(ENVELOPE_PREFIX)) {
      return Buffer.from(stored.slice(ENVELOPE_PREFIX.length), 'base64').toString('utf8');
    }
  } catch {
    return null;
  }
  return null;
}

/** Decrypts aesgcm:v1, envelope:v0, or pgp:v1 (via service-role RPC). Never logs `stored`. */
export async function decryptStoredSecret(stored: string | null | undefined): Promise<string | null> {
  return decryptStored(stored ?? null);
}

async function decryptStored(stored: string | null): Promise<string | null> {
  const local = decryptSecret(stored);
  if (local) return local;
  if (stored?.startsWith('pgp:v1:')) {
    try {
      const supabase = createServiceClientSync();
      const { data } = await supabase.rpc('decrypt_user_secret', { p_stored: stored });
      return typeof data === 'string' && data ? data : null;
    } catch {
      return null;
    }
  }
  return null;
}

type SecretColumn = 'gemini_api_key' | 'telegram_bot_token';

async function readPair(userId: string, column: SecretColumn): Promise<{ enc: string | null; plain: string | null }> {
  try {
    const supabase = createServiceClientSync();
    const encCol = `${column}_enc`;
    const query: {
      maybeSingle?: () => Promise<{ data: Record<string, string | null> | null }>;
      single: () => Promise<{ data: Record<string, string | null> | null }>;
    } = supabase.from('users').select(`${column}, ${encCol}`).eq('id', userId) as unknown as {
      maybeSingle?: () => Promise<{ data: Record<string, string | null> | null }>;
      single: () => Promise<{ data: Record<string, string | null> | null }>;
    };
    const { data } = await (query.maybeSingle ? query.maybeSingle() : query.single());
    const row = (data ?? {}) as Record<string, string | null>;
    return { enc: row[encCol] ?? null, plain: row[column] ?? null };
  } catch {
    return { enc: null, plain: null };
  }
}

export async function getUserSecret(userId: string, column: SecretColumn): Promise<string | null> {
  const { enc, plain } = await readPair(userId, column);
  const fromEnc = await decryptStored(enc);
  const value = (fromEnc && fromEnc.trim()) || (plain && String(plain).trim()) || null;
  if (value && (!enc || !enc.startsWith(AES_PREFIX))) {
    try {
      const supabase = createServiceClientSync();
      await supabase
        .from('users')
        .update({ [`${column}_enc`]: encryptSecret(value), [column]: null })
        .eq('id', userId);
    } catch {
      // Mocks and read-only clients skip the lazy upgrade.
    }
  }
  return value;
}

export async function setUserSecret(userId: string, column: SecretColumn, value: string | null): Promise<void> {
  const supabase = createServiceClientSync();
  const trimmed = value == null || value === '' ? null : String(value).trim();
  const { error } = await supabase
    .from('users')
    .update({
      [`${column}_enc`]: encryptSecret(trimmed),
      [column]: null,
    })
    .eq('id', userId);
  if (error) throw error;
}

export async function getUserGeminiApiKey(userId: string): Promise<string | null> {
  return getUserSecret(userId, 'gemini_api_key');
}

export async function getUserTelegramBotToken(userId: string): Promise<string | null> {
  return getUserSecret(userId, 'telegram_bot_token');
}

export async function userHasOwnGeminiKey(userId: string): Promise<boolean> {
  const key = await getUserGeminiApiKey(userId);
  return Boolean(key);
}

/** Used by tests: never logs `plain`. */
export function secretLooksEncrypted(stored: string | null | undefined): boolean {
  if (!stored) return false;
  return stored.startsWith(AES_PREFIX) || stored.startsWith(ENVELOPE_PREFIX) || stored.startsWith('pgp:v1:');
}
