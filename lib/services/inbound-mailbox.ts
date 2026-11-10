import { createHash, randomBytes } from 'node:crypto';
import { ApiError } from '@/lib/api-handler';
import { createServiceClientSync } from '@/lib/supabase/server';

export const MAILBOX_TOKEN_PREFIX = 'zrxm_';

export type InboundMailboxPublic = {
  configured: boolean;
  domain: string | null;
  address: string | null;
  tokenPrefix: string | null;
  createdAt: string | null;
  webhookConfigured: boolean;
};

function inboundDomain(): string | null {
  const raw = process.env.INBOUND_EMAIL_DOMAIN?.trim().toLowerCase();
  return raw || null;
}

export function hashMailboxToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

function isMissingRelation(error: { message?: string; code?: string } | null): boolean {
  const msg = error?.message || '';
  return error?.code === '42P01' || error?.code === 'PGRST205' || /inbound_email_mailboxes/i.test(msg);
}

export function inboundEmailConfigured(): boolean {
  return Boolean(process.env.INBOUND_EMAIL_WEBHOOK_SECRET?.trim());
}

export async function getInboundMailbox(userId: string): Promise<InboundMailboxPublic> {
  const domain = inboundDomain();
  const webhookConfigured = inboundEmailConfigured();
  const supabase = createServiceClientSync();
  const { data, error } = await supabase
    .from('inbound_email_mailboxes')
    .select('token_prefix, created_at, revoked_at')
    .eq('user_id', userId)
    .maybeSingle();
  if (error && isMissingRelation(error)) {
    return { configured: false, domain, address: null, tokenPrefix: null, createdAt: null, webhookConfigured };
  }
  if (error) throw error;
  if (!data || data.revoked_at) {
    return {
      configured: webhookConfigured && Boolean(domain),
      domain,
      address: null,
      tokenPrefix: null,
      createdAt: null,
      webhookConfigured,
    };
  }
  const prefix = data.token_prefix as string;
  return {
    configured: webhookConfigured,
    domain,
    address: null,
    tokenPrefix: prefix,
    createdAt: data.created_at as string,
    webhookConfigured,
  };
}

export async function issueInboundMailbox(userId: string): Promise<{ token: string; mailbox: InboundMailboxPublic }> {
  const token = `${MAILBOX_TOKEN_PREFIX}${randomBytes(24).toString('hex')}`;
  const hash = hashMailboxToken(token);
  const prefix = token.slice(0, 12);
  const supabase = createServiceClientSync();
  const { error } = await supabase.from('inbound_email_mailboxes').upsert(
    {
      user_id: userId,
      token_hash: hash,
      token_prefix: prefix,
      created_at: new Date().toISOString(),
      revoked_at: null,
    },
    { onConflict: 'user_id' }
  );
  if (error) {
    if (isMissingRelation(error)) {
      throw new ApiError('El buzón inbound todavía no está migrado en esta base.', 503);
    }
    throw error;
  }
  const stored = await getInboundMailbox(userId);
  const domain = inboundDomain();
  return {
    token,
    mailbox: {
      ...stored,
      address: domain ? `${token}@${domain}` : null,
    },
  };
}

export async function revokeInboundMailbox(userId: string): Promise<void> {
  const supabase = createServiceClientSync();
  const { error } = await supabase
    .from('inbound_email_mailboxes')
    .update({ revoked_at: new Date().toISOString() })
    .eq('user_id', userId);
  if (error && isMissingRelation(error)) {
    throw new ApiError('El buzón inbound todavía no está migrado en esta base.', 503);
  }
  if (error) throw error;
}

export async function lookupMailboxUserId(token: string | null): Promise<string | null> {
  if (!token || !token.startsWith(MAILBOX_TOKEN_PREFIX)) return null;
  const supabase = createServiceClientSync();
  const { data, error } = await supabase
    .from('inbound_email_mailboxes')
    .select('user_id, revoked_at')
    .eq('token_hash', hashMailboxToken(token))
    .maybeSingle();
  if (error) {
    if (isMissingRelation(error)) return null;
    throw error;
  }
  if (!data || data.revoked_at) return null;
  return data.user_id as string;
}
