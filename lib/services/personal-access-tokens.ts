import { ApiError } from '@/lib/api-handler';
import { createBareServiceClient } from '@/lib/supabase/server';
import {
  defaultPatExpiresAt,
  generatePersonalAccessToken,
  hashPersonalAccessToken,
  hashesMatch,
  looksLikePersonalAccessToken,
  normalizeScopes,
  parseBearerToken,
  parsePatExpiry,
  parsePatExpiryForUpdate,
  scopesInclude,
  type PatHashVersion,
  type PatScope,
  PAT_HASH_VERSION_HMAC,
  PAT_HASH_VERSION_SHA256,
} from '@/lib/auth/personal-access-token';
import {
  clientIpFromRequest,
  rateLimitAllow,
  rateLimitAllowShared,
  SHARED_LIMITER_UNAVAILABLE_MESSAGE,
} from '@/lib/rate-limit';
import { auditIpFromRequest, auditUserAgent, hashClientIp, recordIntegrationAudit } from '@/lib/integrations/audit';

const PAT_PUBLIC_COLUMNS =
  'id, user_id, name, token_prefix, scopes, expires_at, last_used_at, revoked_at, created_at';

export type PatRow = {
  id: string;
  user_id: string;
  name: string;
  token_prefix: string;
  token_hash: string;
  hash_version: PatHashVersion;
  scopes: string[];
  expires_at: string | null;
  last_used_at: string | null;
  revoked_at: string | null;
  created_at: string;
};

export type PublicPat = Omit<PatRow, 'token_hash' | 'hash_version'>;

export async function listPersonalAccessTokens(userId: string): Promise<PublicPat[]> {
  const supabase = createBareServiceClient();
  const { data, error } = await supabase
    .from('personal_access_tokens')
    .select(PAT_PUBLIC_COLUMNS)
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as PublicPat[];
}

export async function createPersonalAccessToken(input: {
  userId: string;
  name: string;
  scopes?: unknown;
  expiresAt?: unknown;
  req?: Request;
}): Promise<{ token: string; pat: PublicPat }> {
  const name = String(input.name || '').trim().slice(0, 60);
  if (name.length < 2) throw new ApiError('Elegí un nombre de al menos 2 caracteres.');
  const scopes = normalizeScopes(input.scopes);
  const expiresAt = parsePatExpiry(input.expiresAt, defaultPatExpiresAt());
  const generated = generatePersonalAccessToken();
  const supabase = createBareServiceClient();
  const { count } = await supabase
    .from('personal_access_tokens')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', input.userId)
    .is('revoked_at', null);
  if ((count ?? 0) >= 20) throw new ApiError('Llegaste al máximo de 20 tokens activos.');

  const { data, error } = await supabase
    .from('personal_access_tokens')
    .insert({
      user_id: input.userId,
      name,
      token_prefix: generated.prefix,
      token_hash: generated.hash,
      hash_version: generated.version,
      scopes,
      expires_at: expiresAt,
    })
    .select(PAT_PUBLIC_COLUMNS)
    .single();
  if (error || !data) throw error || new ApiError('No se pudo crear el token.');
  if (input.req) {
    await recordIntegrationAudit({
      userId: input.userId,
      action: 'token.create',
      source: 'web',
      ipHash: auditIpFromRequest(input.req),
      userAgent: auditUserAgent(input.req),
      metadata: { tokenId: data.id, prefix: generated.prefix, scopes },
    });
  }
  return { token: generated.token, pat: data as PublicPat };
}

export async function updatePersonalAccessToken(input: {
  userId: string;
  tokenId: string;
  expiresAt?: unknown;
  name?: unknown;
  req?: Request;
}): Promise<PublicPat> {
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.expiresAt !== undefined) {
    try {
      patch.expires_at = parsePatExpiryForUpdate(input.expiresAt);
    } catch (error) {
      throw new ApiError(error instanceof Error ? error.message : 'La fecha de vencimiento es inválida.');
    }
  }
  if (input.name !== undefined) {
    const name = String(input.name || '').trim().slice(0, 60);
    if (name.length < 2) throw new ApiError('Elegí un nombre de al menos 2 caracteres.');
    patch.name = name;
  }
  const supabase = createBareServiceClient();
  const { data, error } = await supabase
    .from('personal_access_tokens')
    .update(patch)
    .eq('id', input.tokenId)
    .eq('user_id', input.userId)
    .is('revoked_at', null)
    .select(PAT_PUBLIC_COLUMNS)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new ApiError('Token no encontrado.', 404);
  return data as PublicPat;
}

export async function revokePersonalAccessToken(input: {
  userId: string;
  tokenId: string;
  req?: Request;
}): Promise<void> {
  const supabase = createBareServiceClient();
  const { data, error } = await supabase
    .from('personal_access_tokens')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', input.tokenId)
    .eq('user_id', input.userId)
    .is('revoked_at', null)
    .select('id')
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new ApiError('Token no encontrado.', 404);
  if (input.req) {
    await recordIntegrationAudit({
      userId: input.userId,
      action: 'token.revoke',
      source: 'web',
      ipHash: auditIpFromRequest(input.req),
      userAgent: auditUserAgent(input.req),
      metadata: { tokenId: input.tokenId },
    });
  }
}

export type AuthenticatedPat = {
  userId: string;
  tokenId: string;
  scopes: string[];
};

async function lookupPatByPresentedToken(token: string): Promise<PatRow | null> {
  const presentedHash = hashPersonalAccessToken(token);
  const supabase = createBareServiceClient();
  const { data, error } = await supabase
    .from('personal_access_tokens')
    .select('id, user_id, scopes, token_hash, hash_version, revoked_at, last_used_at, expires_at')
    .eq('token_hash', presentedHash)
    .maybeSingle();
  if (error) throw error;
  const row = data as PatRow | null;
  if (!row) return null;
  const storedVersion = (row.hash_version ?? PAT_HASH_VERSION_SHA256) as PatHashVersion;
  if (storedVersion === PAT_HASH_VERSION_HMAC) {
    return null;
  }
  if (!hashesMatch(presentedHash, row.token_hash)) return null;
  return row;
}

export async function authenticatePersonalAccessToken(
  req: Request,
  needed: PatScope
): Promise<AuthenticatedPat> {
  const ip = clientIpFromRequest(req);
  const ipHash = hashClientIp(ip);
  if (!rateLimitAllow(`pat-preauth:${ipHash}`, 60, 60_000)) {
    throw new ApiError('Demasiados intentos. Esperá un minuto.', 429);
  }
  const presented = parseBearerToken(req.headers.get('authorization'));
  if (!looksLikePersonalAccessToken(presented)) {
    hashPersonalAccessToken('zrxp_invalid_placeholder_000000000000000000000000000000000000000000000000');
    throw new ApiError('Unauthorized', 401);
  }
  const supabase = createBareServiceClient();
  const row = await lookupPatByPresentedToken(presented);
  if (!row || row.revoked_at) {
    throw new ApiError('Unauthorized', 401);
  }
  if (!row.expires_at || Date.parse(row.expires_at) <= Date.now()) {
    throw new ApiError('Unauthorized', 401);
  }
  const tokenLimiter = await rateLimitAllowShared(`pat-token:${row.id}`, 60, 60_000);
  if (tokenLimiter !== 'allow') {
    throw new ApiError(
      tokenLimiter === 'exhausted' ? 'Demasiados intentos. Esperá un minuto.' : SHARED_LIMITER_UNAVAILABLE_MESSAGE,
      tokenLimiter === 'exhausted' ? 429 : 503
    );
  }
  const userLimiter = await rateLimitAllowShared(`pat-user:${row.user_id}`, 120, 60_000);
  if (userLimiter !== 'allow') {
    throw new ApiError(
      userLimiter === 'exhausted' ? 'Demasiados intentos. Esperá un minuto.' : SHARED_LIMITER_UNAVAILABLE_MESSAGE,
      userLimiter === 'exhausted' ? 429 : 503
    );
  }
  if (!scopesInclude(row.scopes, needed)) {
    throw new ApiError('Este token no tiene el permiso necesario.', 403);
  }
  const last = row.last_used_at ? Date.parse(row.last_used_at) : 0;
  if (!Number.isFinite(last) || Date.now() - last > 60_000) {
    const { error: usedErr } = await supabase
      .from('personal_access_tokens')
      .update({ last_used_at: new Date().toISOString() })
      .eq('id', row.id)
      .eq('user_id', row.user_id);
    if (usedErr) console.error('[pat] last_used_at update failed');
  }
  await recordIntegrationAudit({
    userId: row.user_id,
    action: 'token.use',
    source: needed === 'ingest' ? 'wallet' : 'api',
    ipHash: auditIpFromRequest(req),
    userAgent: auditUserAgent(req),
    metadata: { tokenId: row.id, scope: needed },
  });
  return { userId: row.user_id, tokenId: row.id, scopes: row.scopes };
}
