import { ApiError } from '@/lib/api-handler';
import { createServiceClientSync } from '@/lib/supabase/server';
import {
  generatePersonalAccessToken,
  hashPersonalAccessToken,
  hashesMatch,
  looksLikePersonalAccessToken,
  normalizeScopes,
  parseBearerToken,
  scopesInclude,
  type PatScope,
} from '@/lib/auth/personal-access-token';
import { clientIpFromRequest, rateLimitAllow } from '@/lib/rate-limit';
import { auditIpFromRequest, auditUserAgent, recordIntegrationAudit } from '@/lib/integrations/audit';

export type PatRow = {
  id: string;
  user_id: string;
  name: string;
  token_prefix: string;
  token_hash: string;
  scopes: string[];
  last_used_at: string | null;
  revoked_at: string | null;
  created_at: string;
};

export type PublicPat = Omit<PatRow, 'token_hash'>;

function toPublic(row: PatRow): PublicPat {
  const { token_hash: _hash, ...rest } = row;
  return rest;
}

export async function listPersonalAccessTokens(userId: string): Promise<PublicPat[]> {
  const supabase = createServiceClientSync();
  const { data, error } = await supabase
    .from('personal_access_tokens')
    .select('id, user_id, name, token_prefix, scopes, last_used_at, revoked_at, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as PublicPat[];
}

export async function createPersonalAccessToken(input: {
  userId: string;
  name: string;
  scopes?: unknown;
  req?: Request;
}): Promise<{ token: string; pat: PublicPat }> {
  const name = String(input.name || '').trim().slice(0, 60);
  if (name.length < 2) throw new ApiError('Elegí un nombre de al menos 2 caracteres.');
  const scopes = normalizeScopes(input.scopes);
  const generated = generatePersonalAccessToken();
  const supabase = createServiceClientSync();
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
      scopes,
    })
    .select('id, user_id, name, token_prefix, scopes, last_used_at, revoked_at, created_at')
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

export async function revokePersonalAccessToken(input: {
  userId: string;
  tokenId: string;
  req?: Request;
}): Promise<void> {
  const supabase = createServiceClientSync();
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

export async function authenticatePersonalAccessToken(
  req: Request,
  needed: PatScope
): Promise<AuthenticatedPat> {
  const ip = clientIpFromRequest(req);
  if (!rateLimitAllow(`pat-auth:${ip}`, 60, 60_000)) {
    throw new ApiError('Demasiados intentos. Esperá un minuto.', 429);
  }
  const presented = parseBearerToken(req.headers.get('authorization'));
  if (!looksLikePersonalAccessToken(presented)) {
    hashPersonalAccessToken('zrxp_invalid_placeholder_000000000000000000000000000000000000000000000000');
    throw new ApiError('Unauthorized', 401);
  }
  const presentedHash = hashPersonalAccessToken(presented);
  const supabase = createServiceClientSync();
  const { data, error } = await supabase
    .from('personal_access_tokens')
    .select('id, user_id, scopes, token_hash, revoked_at, last_used_at')
    .eq('token_hash', presentedHash)
    .maybeSingle();
  if (error) throw error;
  const row = data as PatRow | null;
  if (!row || !hashesMatch(presentedHash, row.token_hash) || row.revoked_at) {
    throw new ApiError('Unauthorized', 401);
  }
  if (!scopesInclude(row.scopes, needed)) {
    throw new ApiError('Este token no tiene el permiso necesario.', 403);
  }
  const last = row.last_used_at ? Date.parse(row.last_used_at) : 0;
  if (!Number.isFinite(last) || Date.now() - last > 60_000) {
    await supabase
      .from('personal_access_tokens')
      .update({ last_used_at: new Date().toISOString() })
      .eq('id', row.id)
      .eq('user_id', row.user_id);
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
