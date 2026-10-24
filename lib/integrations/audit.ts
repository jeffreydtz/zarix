import { createHash } from 'node:crypto';
import { createServiceClientSync } from '@/lib/supabase/server';
import { clientIpFromRequest } from '@/lib/rate-limit';
import type { WriteChannel } from '@/lib/ai/registry/types';

export type AuditAction =
  | 'token.create'
  | 'token.revoke'
  | 'token.use'
  | 'ingest'
  | 'inbox.confirm'
  | 'inbox.discard'
  | 'mcp.write'
  | 'api.write'
  | 'secrets.update';

const UA_MAX = 180;

function ipPepper(): string {
  return process.env.ZARIX_AUDIT_IP_PEPPER || process.env.SUPABASE_SERVICE_ROLE_KEY || 'zarix-dev-audit';
}

export function hashClientIp(ip: string): string {
  return createHash('sha256').update(`ip:${ipPepper()}:${ip}`).digest('hex');
}

export function auditIpFromRequest(req: Request): string {
  return hashClientIp(clientIpFromRequest(req));
}

export function auditUserAgent(req: Request): string | null {
  const raw = req.headers.get('user-agent')?.trim();
  if (!raw) return null;
  return raw.slice(0, UA_MAX);
}

export type AuditOutcome = 'ok' | 'error' | 'thrown' | 'denied';

export async function recordIntegrationAudit(input: {
  userId: string;
  action: AuditAction;
  source: WriteChannel | 'web';
  ipHash?: string | null;
  userAgent?: string | null;
  metadata?: Record<string, unknown>;
  outcome?: AuditOutcome;
}): Promise<void> {
  const supabase = createServiceClientSync();
  const metadata = input.metadata ? redactAuditMetadata(input.metadata) : {};
  const outcome =
    input.outcome ??
    (typeof metadata.outcome === 'string' ? (metadata.outcome as AuditOutcome) : null);
  const { error } = await supabase.from('integration_audit_log').insert({
    user_id: input.userId,
    action: input.action,
    source: input.source,
    ip_hash: input.ipHash ?? null,
    user_agent: input.userAgent ?? null,
    metadata,
    outcome,
  });
  if (error) {
    console.error('[audit] write failed');
  }
}

const SECRET_KEYS = /token|secret|password|authorization|gemini|bot_token|api_key|cbu|cuit|pan|card_number/i;
const AUDIT_KEY_ALLOWLIST = new Set(['tokenId', 'prefix', 'token_prefix', 'itemId', 'pendingId', 'scope', 'tool', 'requestId', 'outcome']);

export function redactAuditMetadata(value: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) {
    if (AUDIT_KEY_ALLOWLIST.has(k)) {
      out[k] = typeof v === 'string' && v.length > 240 ? `${v.slice(0, 240)}…` : v;
      continue;
    }
    if (SECRET_KEYS.test(k)) {
      out[k] = '[redacted]';
      continue;
    }
    if (typeof v === 'string' && v.length > 240) out[k] = `${v.slice(0, 240)}…`;
    else if (v && typeof v === 'object' && !Array.isArray(v)) out[k] = redactAuditMetadata(v as Record<string, unknown>);
    else out[k] = v;
  }
  return out;
}
