import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { createServiceClientSync } from '@/lib/supabase/server';

const AES_PREFIX = 'aesgcm:v1:';
const VAULT_PREFIX = 'vault:v1:';

export const SECRETS_UNAVAILABLE_MESSAGE =
  'User secrets require Supabase Vault (schema vault, service_role SECURITY DEFINER) in production. Local/tests may set ZARIX_SECRETS_MASTER_KEY. No service-role derivation, no built-in key, no envelope:v0.';

type SecretColumn = 'gemini_api_key' | 'telegram_bot_token';

function masterKey(): Buffer | null {
  const explicit = process.env.ZARIX_SECRETS_MASTER_KEY?.trim();
  if (!explicit) return null;
  return createHash('sha256').update(`zarix-user-secrets:v1:${explicit}`).digest();
}

export function encryptSecret(plain: string | null | undefined): string | null {
  if (plain == null || plain === '') return null;
  const key = masterKey();
  if (!key) {
    throw new Error(SECRETS_UNAVAILABLE_MESSAGE);
  }
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${AES_PREFIX}${iv.toString('base64')}:${tag.toString('base64')}:${ct.toString('base64')}`;
}

export function decryptSecret(stored: string | null | undefined): string | null {
  if (!stored) return null;
  if (stored.startsWith('envelope:v0:') || stored.startsWith('pgp:v1:')) {
    return null;
  }
  if (!stored.startsWith(AES_PREFIX)) return null;
  const key = masterKey();
  if (!key) return null;
  try {
    const rest = stored.slice(AES_PREFIX.length);
    const [ivB64, tagB64, ctB64] = rest.split(':');
    if (!ivB64 || !tagB64 || !ctB64) return null;
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(ctB64, 'base64')), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}

async function vaultRead(userId: string, column: SecretColumn): Promise<string | null> {
  try {
    const supabase = createServiceClientSync();
    const { data, error } = await supabase.rpc('zarix_vault_read', {
      p_user_id: userId,
      p_kind: column,
    });
    if (error) return null;
    return typeof data === 'string' && data ? data : null;
  } catch {
    return null;
  }
}

async function vaultStore(userId: string, column: SecretColumn, value: string | null): Promise<string | null> {
  const supabase = createServiceClientSync();
  const { data, error } = await supabase.rpc('zarix_vault_store', {
    p_user_id: userId,
    p_kind: column,
    p_plain: value,
  });
  if (error) throw error;
  return typeof data === 'string' && data ? data : null;
}

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
  if (enc?.startsWith(VAULT_PREFIX)) {
    const fromVault = await vaultRead(userId, column);
    if (fromVault?.trim()) return fromVault.trim();
  }
  const fromAes = decryptSecret(enc);
  if (fromAes?.trim()) return fromAes.trim();
  const legacy = plain && String(plain).trim() ? String(plain).trim() : null;
  return legacy;
}

export async function setUserSecret(userId: string, column: SecretColumn, value: string | null): Promise<void> {
  const supabase = createServiceClientSync();
  const trimmed = value == null || value === '' ? null : String(value).trim();
  let enc: string | null = null;
  let vaultOk = false;
  try {
    enc = await vaultStore(userId, column, trimmed);
    vaultOk = Boolean(enc?.startsWith(VAULT_PREFIX)) || trimmed == null;
  } catch {
    vaultOk = false;
  }
  if (!vaultOk) {
    if (trimmed && !masterKey()) {
      throw new Error(SECRETS_UNAVAILABLE_MESSAGE);
    }
    enc = trimmed ? encryptSecret(trimmed) : null;
  }
  const { error } = await supabase
    .from('users')
    .update({
      [`${column}_enc`]: enc,
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

export async function decryptStoredSecret(stored: string | null | undefined): Promise<string | null> {
  return decryptSecret(stored ?? null);
}

/** Used by tests: never logs `plain`. */
export function secretLooksEncrypted(stored: string | null | undefined): boolean {
  if (!stored) return false;
  return stored.startsWith(AES_PREFIX) || stored.startsWith(VAULT_PREFIX);
}
