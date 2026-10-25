import { createHash, randomUUID } from 'node:crypto';
import { ApiError } from '@/lib/api-handler';
import { createServiceClientSync } from '@/lib/supabase/server';
import { executeRegistryTool } from '@/lib/ai/registry/execute';
import type { FinancialContext } from '@/lib/ai/prompts';
import { accountsService } from '@/lib/services/accounts';
import { parseWalletPayload, type WalletIngestPayload } from '@/lib/integrations/wallet-parse';
import { isTransactionCurrency } from '@/lib/constants/transaction-currencies';
import { suggestCategoryFromMerchant } from '@/lib/integrations/merchant-category';
import { auditIpFromRequest, auditUserAgent, recordIntegrationAudit } from '@/lib/integrations/audit';
import { validTransactionRequestId } from '@/lib/transaction-idempotency';
import { withPatUserScope } from '@/lib/supabase/request-scope';
import { withFinancialRequestContext } from '@/lib/financial-request-context';
import { AmbiguousFinancialMutationError } from '@/lib/financial-mutation-error';
import type { ToolArgs, WriteChannel } from '@/lib/ai/registry/types';

export const WALLET_CIVIL_TIMEZONE = 'America/Argentina/Cordoba';
export const STALE_CONFIRMING_MS = 2 * 60 * 1000;
export const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;
/** Fingerprint reservation window. Idempotency-Key stays durable; this bucket expires. */
export const INBOX_DEDUPE_WINDOW_MS = 15 * 60 * 1000;

export type ParkedToolPayload = {
  type?: string;
  amount?: number;
  currency?: string;
  description?: string;
  account?: string;
  accountId?: string;
  category?: string;
  categoryId?: string;
  destinationAccount?: string;
  destinationAccountId?: string;
  transactionDate?: string;
  date?: string;
  installments?: number;
  [key: string]: unknown;
};

export type PendingInboxItem = {
  id: string;
  user_id: string;
  amount: number | null;
  currency: string;
  merchant: string | null;
  card_name: string | null;
  account_id: string | null;
  category_id: string | null;
  occurred_at: string | null;
  status: 'pending' | 'confirming' | 'confirmed' | 'discarded' | 'uncertain';
  suggestion_source: string | null;
  idempotency_key: string | null;
  ingest_key: string;
  direction: 'expense' | 'income';
  amount_ambiguous: boolean;
  source: string;
  raw_text: string | null;
  tool_payload: ParkedToolPayload | null;
  claim_id?: string | null;
  fingerprint?: string | null;
  created_at: string;
  updated_at?: string;
};

function normalizeCard(name: string | null): string {
  return (name || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

export function walletCivilDate(iso: string | null | undefined): string | undefined {
  if (!iso) return undefined;
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return undefined;
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: WALLET_CIVIL_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

/** Date-only values must not be stored as midnight UTC (that is the previous day in Cordoba). */
export function occurredAtForStorage(iso: string | null | undefined): string | null {
  if (!iso) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return `${iso}T12:00:00-03:00`;
  return iso;
}

const ACTIVE_EVENT_STATUSES: PendingInboxItem['status'][] = [
  'pending',
  'confirming',
  'confirmed',
  'uncertain',
];

/** Auto-confirm needs a stable event identity so a receive-time bucket split cannot double-save. */
export function hasStableInboxIdentity(
  occurredAt: string | null | undefined,
  ingestKey: string | null | undefined
): boolean {
  return Boolean(ingestKey?.trim()) || Boolean(occurredAt);
}

export function inboxEffectiveCivilDate(occurredAt: string | null, nowMs = Date.now()): string {
  return walletCivilDate(occurredAt) ?? walletCivilDate(new Date(nowMs).toISOString()) ?? '';
}

export function inboxReservationBucket(
  occurredAt: string | null,
  ingestKey: string,
  nowMs = Date.now()
): string {
  if (ingestKey) return 'idemp';
  const ts = occurredAt ? Date.parse(occurredAt) : NaN;
  const t = Number.isFinite(ts) ? ts : nowMs;
  return `win:${Math.floor(t / INBOX_DEDUPE_WINDOW_MS)}`;
}

export function inboxEventFingerprint(
  userId: string,
  payload: Pick<WalletIngestPayload, 'amount' | 'currency' | 'merchant' | 'cardName' | 'direction'>,
  occurredAt: string | null,
  ingestKey: string,
  nowMs = Date.now()
): string {
  const bucket = inboxReservationBucket(occurredAt, ingestKey, nowMs);
  const sign = payload.direction === 'income' ? '-' : '+';
  const material = [
    userId,
    sign,
    payload.direction,
    payload.amount ?? '',
    payload.currency || 'ARS',
    normalizeCard(payload.cardName),
    (payload.merchant || '').toLowerCase(),
    bucket,
    ingestKey,
    inboxEffectiveCivilDate(occurredAt, nowMs),
  ].join('|');
  return createHash('sha256').update(material).digest('hex');
}

export function inboxFingerprintCandidates(
  userId: string,
  payload: Pick<WalletIngestPayload, 'amount' | 'currency' | 'merchant' | 'cardName' | 'direction'>,
  occurredAt: string | null,
  ingestKey: string,
  nowMs = Date.now()
): string[] {
  const current = inboxEventFingerprint(userId, payload, occurredAt, ingestKey, nowMs);
  if (ingestKey) return [current];
  const previous = inboxEventFingerprint(
    userId,
    payload,
    occurredAt,
    ingestKey,
    nowMs - INBOX_DEDUPE_WINDOW_MS
  );
  return previous === current ? [current] : [current, previous];
}

const VOLATILE_PARKED_KEYS = new Set(['pendingId', 'pendingIds', 'confirm', 'requestId']);

function parkedBodyKey(payload: ParkedToolPayload | null | undefined): string {
  if (!payload) return '';
  const entries = Object.entries(payload)
    .filter(([key, value]) => !VOLATILE_PARKED_KEYS.has(key) && value !== undefined)
    .sort(([a], [b]) => a.localeCompare(b));
  return JSON.stringify(entries);
}

export function isStaleConfirming(item: Pick<PendingInboxItem, 'status' | 'updated_at' | 'created_at'>): boolean {
  if (item.status !== 'confirming') return false;
  const ts = Date.parse(item.updated_at || item.created_at);
  return Number.isFinite(ts) && Date.now() - ts >= STALE_CONFIRMING_MS;
}

export async function resolveCardAccount(userId: string, cardName: string | null): Promise<string | null> {
  const key = normalizeCard(cardName);
  if (!key) return null;
  const supabase = createServiceClientSync();
  const { data: mapped } = await supabase
    .from('wallet_card_account_maps')
    .select('account_id')
    .eq('user_id', userId)
    .eq('card_name_normalized', key)
    .maybeSingle();
  if (mapped?.account_id) return mapped.account_id as string;
  const fuzzy = await accountsService.findByNameFuzzy(userId, cardName || '');
  if (fuzzy.account && (fuzzy.confidence === 'exact' || fuzzy.confidence === 'high')) {
    await supabase.from('wallet_card_account_maps').upsert({
      user_id: userId,
      card_name_normalized: key,
      account_id: fuzzy.account.id,
    });
    return fuzzy.account.id;
  }
  return null;
}

export async function rememberCardAccount(userId: string, cardName: string | null, accountId: string): Promise<void> {
  const key = normalizeCard(cardName);
  if (!key) return;
  const supabase = createServiceClientSync();
  await supabase.from('wallet_card_account_maps').upsert({
    user_id: userId,
    card_name_normalized: key,
    account_id: accountId,
  });
}

function isUniqueViolation(error: { code?: string; message?: string } | null | undefined): boolean {
  return error?.code === '23505' || /duplicate key|unique constraint/i.test(error?.message || '');
}

function isFreshIdempotency(item: { created_at?: string } | null | undefined): boolean {
  if (!item?.created_at) return false;
  const ts = Date.parse(item.created_at);
  return Number.isFinite(ts) && Date.now() - ts <= IDEMPOTENCY_TTL_MS;
}

async function loadByIngestKey(userId: string, ingestKey: string): Promise<PendingInboxItem | null> {
  const supabase = createServiceClientSync();
  const { data } = await supabase
    .from('pending_inbox_items')
    .select('*')
    .eq('user_id', userId)
    .eq('ingest_key', ingestKey)
    .maybeSingle();
  const item = (data as PendingInboxItem | null) ?? null;
  if (item && !isFreshIdempotency(item)) {
    await supabase
      .from('pending_inbox_items')
      .update({ ingest_key: `expired:${item.id}`, idempotency_key: null })
      .eq('id', item.id)
      .eq('user_id', userId);
    return null;
  }
  return item;
}

async function loadByFingerprint(userId: string, fp: string): Promise<PendingInboxItem | null> {
  const supabase = createServiceClientSync();
  const { data } = await supabase
    .from('pending_inbox_items')
    .select('*')
    .eq('user_id', userId)
    .eq('fingerprint', fp)
    .in('status', ACTIVE_EVENT_STATUSES)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as PendingInboxItem | null) ?? null;
}

export async function ingestWalletItem(input: {
  userId: string;
  json?: Record<string, unknown> | null;
  text?: string | null;
  idempotencyKey?: string | null;
  req?: Request;
}): Promise<{ item: PendingInboxItem; duplicate: boolean; autoConfirmed: boolean }> {
  return withPatUserScope(input.userId, () => ingestWalletItemUnlocked(input));
}

async function ingestWalletItemUnlocked(input: {
  userId: string;
  json?: Record<string, unknown> | null;
  text?: string | null;
  idempotencyKey?: string | null;
  req?: Request;
}): Promise<{ item: PendingInboxItem; duplicate: boolean; autoConfirmed: boolean }> {
  const payload = parseWalletPayload({ json: input.json, text: input.text });
  if (payload.currencyUnsupported || !isTransactionCurrency(payload.currency)) {
    throw new ApiError('Moneda no admitida. Usá ARS, USD o EUR.', 400);
  }
  const occurredAt = occurredAtForStorage(payload.occurredAt);
  const clientKey = input.idempotencyKey?.trim() || null;
  if (clientKey && !validTransactionRequestId(clientKey) && !/^[A-Za-z0-9._:-]{8,200}$/.test(clientKey)) {
    throw new ApiError('Idempotency-Key inválida.');
  }
  const ingestKey = clientKey || randomUUID();
  const nowMs = Date.now();
  const fp = inboxEventFingerprint(input.userId, payload, occurredAt, clientKey || '', nowMs);
  const fingerprintCandidates = inboxFingerprintCandidates(
    input.userId,
    payload,
    occurredAt,
    clientKey || '',
    nowMs
  );
  // Anonymous fingerprint encodes a 15-minute window. Look back one extra bucket
  // so a retry that crosses the boundary still matches. Unique index is atomic.
  const supabase = createServiceClientSync();

  if (clientKey) {
    const existing = await loadByIngestKey(input.userId, clientKey);
    if (existing) {
      if (existing.fingerprint && existing.fingerprint !== fp) {
        throw new ApiError('Esa Idempotency-Key ya se usó con otro cuerpo.', 409);
      }
      return { item: existing, duplicate: true, autoConfirmed: existing.status === 'confirmed' };
    }
  } else {
    const { data: dupes } = await supabase
      .from('pending_inbox_items')
      .select('*')
      .eq('user_id', input.userId)
      .in('fingerprint', fingerprintCandidates)
      .in('status', ACTIVE_EVENT_STATUSES)
      .order('created_at', { ascending: false })
      .limit(1);
    if (dupes?.[0]) {
      return { item: dupes[0] as PendingInboxItem, duplicate: true, autoConfirmed: dupes[0].status === 'confirmed' };
    }
  }

  const accountId = await resolveCardAccount(input.userId, payload.cardName);
  const suggestion = await suggestCategoryFromMerchant({ userId: input.userId, merchant: payload.merchant });

  const { data, error } = await supabase
    .from('pending_inbox_items')
    .insert({
      user_id: input.userId,
      amount: payload.amount,
      currency: payload.currency,
      merchant: payload.merchant,
      card_name: payload.cardName,
      account_id: accountId,
      category_id: suggestion.categoryId,
      occurred_at: occurredAt,
      raw_payload: input.json ?? null,
      raw_text: payload.rawText,
      status: 'pending',
      suggestion_source: suggestion.source,
      idempotency_key: clientKey,
      ingest_key: ingestKey,
      direction: payload.direction,
      amount_ambiguous: payload.amountAmbiguous,
      source: 'wallet',
      fingerprint: fp,
    })
    .select('*')
    .single();

  if (error) {
    if (isUniqueViolation(error)) {
      const byKey = clientKey ? await loadByIngestKey(input.userId, ingestKey) : null;
      if (byKey?.fingerprint && byKey.fingerprint !== fp) {
        throw new ApiError('Esa Idempotency-Key ya se usó con otro cuerpo.', 409);
      }
      let existing = byKey;
      if (!existing) {
        for (const candidate of fingerprintCandidates) {
          existing = await loadByFingerprint(input.userId, candidate);
          if (existing) break;
        }
      }
      if (existing) return { item: existing, duplicate: true, autoConfirmed: existing.status === 'confirmed' };
    }
    throw error;
  }
  if (!data) throw new ApiError('No se pudo guardar el pendiente.');

  if (input.req) {
    await recordIntegrationAudit({
      userId: input.userId,
      action: 'ingest',
      source: 'wallet',
      ipHash: auditIpFromRequest(input.req),
      userAgent: auditUserAgent(input.req),
      metadata: { itemId: data.id, duplicate: false, hasAmount: payload.amount != null, hasMerchant: Boolean(payload.merchant) },
    });
  }

  const { data: prefs } = await supabase
    .from('users')
    .select('wallet_auto_confirm')
    .eq('id', input.userId)
    .maybeSingle();

  const complete =
    payload.amount != null &&
    payload.amount > 0 &&
    Boolean(accountId) &&
    suggestion.source === 'history' &&
    !payload.amountAmbiguous &&
    !payload.currencyUnsupported &&
    isTransactionCurrency(payload.currency) &&
    payload.direction === 'expense';
  if (
    prefs?.wallet_auto_confirm &&
    complete &&
    hasStableInboxIdentity(occurredAt, clientKey)
  ) {
    try {
      const confirmed = await confirmPendingItem({
        userId: input.userId,
        itemId: data.id as string,
        req: input.req,
      });
      return { item: confirmed, duplicate: false, autoConfirmed: true };
    } catch {
      return { item: data as PendingInboxItem, duplicate: false, autoConfirmed: false };
    }
  }

  return { item: data as PendingInboxItem, duplicate: false, autoConfirmed: false };
}

export async function parkRegistryWrite(input: {
  userId: string;
  amount?: number | null;
  currency: string;
  merchant?: string | null;
  accountId?: string | null;
  categoryId?: string | null;
  occurredAt?: string | null;
  source: WriteChannel;
  ingestKey?: string | null;
  toolPayload?: ParkedToolPayload | null;
}): Promise<PendingInboxItem> {
  const ingestKey = input.ingestKey?.trim() || randomUUID();
  const toolPayload = input.toolPayload ?? null;
  if (input.ingestKey) {
    const existing = await loadByIngestKey(input.userId, ingestKey);
    if (existing) {
      if (toolPayload && existing.tool_payload && parkedBodyKey(existing.tool_payload) !== parkedBodyKey(toolPayload)) {
        throw new ApiError('Esa Idempotency-Key ya se usó con otro cuerpo.', 409);
      }
      return existing;
    }
  }
  const type = String(toolPayload?.type || 'expense');
  const payload = {
    amount: input.amount ?? null,
    currency: input.currency,
    merchant: input.merchant ?? null,
    cardName: null as string | null,
    direction: (type === 'income' ? 'income' : 'expense') as 'expense' | 'income',
  };
  const occurredAt = occurredAtForStorage(input.occurredAt ?? null);
  const fp = inboxEventFingerprint(input.userId, payload, occurredAt, ingestKey);
  const supabase = createServiceClientSync();
  const { data, error } = await supabase
    .from('pending_inbox_items')
    .insert({
      user_id: input.userId,
      amount: input.amount ?? null,
      currency: input.currency,
      merchant: input.merchant ?? null,
      account_id: input.accountId ?? (typeof toolPayload?.accountId === 'string' ? toolPayload.accountId : null),
      category_id: input.categoryId ?? (typeof toolPayload?.categoryId === 'string' ? toolPayload.categoryId : null),
      occurred_at: occurredAt,
      status: 'pending',
      suggestion_source: 'none',
      idempotency_key: input.ingestKey ?? null,
      ingest_key: ingestKey,
      direction: type === 'income' ? 'income' : 'expense',
      amount_ambiguous: false,
      source: input.source,
      fingerprint: fp,
      tool_payload: toolPayload,
    })
    .select('*')
    .single();
  if (error) {
    if (isUniqueViolation(error)) {
      const existing =
        (await loadByIngestKey(input.userId, ingestKey)) ||
        (await loadByFingerprint(input.userId, fp));
      if (existing) {
        if (toolPayload && existing.tool_payload && parkedBodyKey(existing.tool_payload) !== parkedBodyKey(toolPayload)) {
          throw new ApiError('Esa Idempotency-Key ya se usó con otro cuerpo.', 409);
        }
        return existing;
      }
    }
    throw error || new ApiError('No se pudo guardar el pendiente.');
  }
  return data as PendingInboxItem;
}

export async function listPendingItems(userId: string, status: 'pending' | 'all' = 'pending'): Promise<PendingInboxItem[]> {
  const supabase = createServiceClientSync();
  let q = supabase.from('pending_inbox_items').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(100);
  if (status === 'pending') q = q.in('status', ['pending', 'confirming', 'uncertain']);
  const { data, error } = await q;
  if (error) throw error;
  const rows = (data ?? []) as PendingInboxItem[];
  if (status !== 'pending') return rows;
  return rows.filter(
    (item) => item.status === 'pending' || item.status === 'uncertain' || isStaleConfirming(item)
  );
}

async function loadFinancialContext(userId: string): Promise<FinancialContext> {
  const { loadRegistryFinancialContext } = await import('@/lib/ai/registry/context');
  return loadRegistryFinancialContext(userId);
}

export function pendingInboxRequestId(itemId: string): string {
  return `wallet:${itemId}`;
}

function directionFromType(type: string | undefined): 'expense' | 'income' {
  return type === 'income' ? 'income' : 'expense';
}

function ledgerChannelFor(row: Pick<PendingInboxItem, 'source'>): WriteChannel {
  const src = row.source;
  if (src === 'mcp' || src === 'api' || src === 'wallet' || src === 'telegram' || src === 'web') return src;
  return 'wallet';
}

async function loadPriorLedger(
  userId: string,
  requestId: string
): Promise<{ id?: string } | null> {
  const supabase = createServiceClientSync();
  const { data, error } = await supabase
    .from('transaction_requests')
    .select('response')
    .eq('user_id', userId)
    .eq('request_id', requestId)
    .maybeSingle();
  if (error) throw error;
  const response = data?.response as { id?: string } | null;
  return response?.id ? response : null;
}

export async function confirmPendingItem(input: {
  userId: string;
  itemId: string;
  amount?: number | null;
  currency?: string;
  merchant?: string;
  accountId?: string;
  categoryId?: string;
  occurredAt?: string;
  source?: WriteChannel;
  req?: Request;
}): Promise<PendingInboxItem> {
  return withPatUserScope(input.userId, () =>
    withFinancialRequestContext(pendingInboxRequestId(input.itemId), () => confirmPendingItemUnlocked(input))
  );
}

export async function confirmPendingItems(input: {
  userId: string;
  itemIds: string[];
  source?: WriteChannel;
  req?: Request;
}): Promise<PendingInboxItem[]> {
  const out: PendingInboxItem[] = [];
  for (const itemId of input.itemIds) {
    out.push(await confirmPendingItem({ userId: input.userId, itemId, source: input.source, req: input.req }));
  }
  return out;
}

async function confirmPendingItemUnlocked(input: {
  userId: string;
  itemId: string;
  amount?: number | null;
  currency?: string;
  merchant?: string;
  accountId?: string;
  categoryId?: string;
  occurredAt?: string;
  source?: WriteChannel;
  req?: Request;
}): Promise<PendingInboxItem> {
  const supabase = createServiceClientSync();
  const requestId = pendingInboxRequestId(input.itemId);
  const claim = async () =>
    supabase.rpc('claim_pending_inbox_item', {
      p_user_id: input.userId,
      p_item_id: input.itemId,
    });

  let { data: claimed, error: claimErr } = await claim();
  if (claimErr) throw claimErr;
  let claimedRow = Array.isArray(claimed) ? claimed[0] : claimed;

  if (!claimedRow) {
    const { data: existing } = await supabase
      .from('pending_inbox_items')
      .select('*')
      .eq('id', input.itemId)
      .eq('user_id', input.userId)
      .maybeSingle();
    if (!existing) throw new ApiError('Pendiente no encontrado.', 404);
    if (existing.status === 'confirmed') return existing as PendingInboxItem;
    if (existing.status === 'discarded') throw new ApiError('Este pendiente ya fue descartado.');
    if (isStaleConfirming(existing as PendingInboxItem)) {
      const prior = await loadPriorLedger(input.userId, requestId);
      const staleClaimId = (existing as PendingInboxItem).claim_id;
      if (prior) {
        const { data: recovered } = await supabase
          .from('pending_inbox_items')
          .update({
            status: 'confirmed',
            confirmed_transaction_id: prior.id ?? null,
            claim_id: null,
          })
          .eq('id', input.itemId)
          .eq('user_id', input.userId)
          .eq('status', 'confirming')
          .select('*')
          .maybeSingle();
        if (recovered) return recovered as PendingInboxItem;
      }
      let release = supabase
        .from('pending_inbox_items')
        .update({ status: 'pending', claim_id: null })
        .eq('id', input.itemId)
        .eq('user_id', input.userId)
        .eq('status', 'confirming');
      // Only the claim owner may release. A null claim_id matches only unfenced rows.
      release = staleClaimId ? release.eq('claim_id', staleClaimId) : release.is('claim_id', null);
      await release;
      const retried = await claim();
      if (retried.error) throw retried.error;
      claimed = retried.data;
      claimedRow = Array.isArray(claimed) ? claimed[0] : claimed;
    }
    if (!claimedRow) {
      throw new ApiError('Este pendiente se está confirmando.', 409);
    }
  }

  const row = claimedRow as PendingInboxItem;
  if (!row) throw new ApiError('Pendiente no encontrado.', 404);
  const myClaimId = row.claim_id ?? null;

  const revertClaim = async () => {
    if (!myClaimId) return;
    await supabase
      .from('pending_inbox_items')
      .update({ status: 'pending', claim_id: null })
      .eq('id', input.itemId)
      .eq('user_id', input.userId)
      .eq('status', 'confirming')
      .eq('claim_id', myClaimId);
  };

  const markUncertain = async () => {
    if (!myClaimId) return;
    await supabase
      .from('pending_inbox_items')
      .update({ status: 'uncertain' })
      .eq('id', input.itemId)
      .eq('user_id', input.userId)
      .eq('status', 'confirming')
      .eq('claim_id', myClaimId);
  };

  const prior = await loadPriorLedger(input.userId, requestId);
  if (prior) {
    const { data: recovered, error: recErr } = await supabase
      .from('pending_inbox_items')
      .update({
        status: 'confirmed',
        confirmed_transaction_id: prior.id ?? null,
        claim_id: null,
      })
      .eq('id', input.itemId)
      .eq('user_id', input.userId)
      .eq('status', 'confirming')
      .eq('claim_id', myClaimId)
      .select('*')
      .maybeSingle();
    if (recErr) throw recErr;
    if (recovered) return recovered as PendingInboxItem;
  }

  let committed = false;
  let ledgerCommitted = false;
  try {
    const parked = { ...(row.tool_payload || {}) };
    const toolName = String(parked._tool || 'create_transaction');
    delete parked._tool;
    delete parked.pendingId;
    delete parked.pendingIds;
    delete parked.confirm;
    const amount =
      input.amount !== undefined
        ? input.amount == null || !Number.isFinite(Number(input.amount))
          ? null
          : Number(input.amount)
        : (typeof parked?.amount === 'number' ? parked.amount : null) ??
          (typeof row.amount === 'number' ? row.amount : null);
    const accountId =
      input.accountId ??
      (typeof parked.accountId === 'string' ? parked.accountId : null) ??
      row.account_id;
    const needsLedgerAmount = toolName === 'create_transaction' || toolName === 'create_transactions';
    const currencyRaw = String(
      input.currency || row.currency || parked?.currency || 'ARS'
    ).trim().toUpperCase();
    if (needsLedgerAmount && !isTransactionCurrency(currencyRaw)) {
      throw new ApiError('Moneda no admitida. Usá ARS, USD o EUR.');
    }
    if (needsLedgerAmount && (amount == null || !Number.isFinite(amount) || amount <= 0)) {
      throw new ApiError('Falta el monto para confirmar.');
    }
    if (needsLedgerAmount && !accountId && parked.type !== 'transfer' && !parked.account) {
      throw new ApiError('Elegí la cuenta de Zarix para esta tarjeta.');
    }

    const accounts = await accountsService.list(input.userId);
    const account = accountId ? accounts.find((a) => a.id === accountId) : null;
    if (needsLedgerAmount && accountId && !account) {
      throw new ApiError('La cuenta no existe.');
    }

    const financialContext = await loadFinancialContext(input.userId);
    const occurred = occurredAtForStorage(input.occurredAt ?? row.occurred_at);
    const txType = String(parked.type || (row.direction === 'income' ? 'income' : 'expense'));
    const args: ToolArgs = { ...parked, confirm: true };
    if (needsLedgerAmount) {
      args.type = txType;
      args.amount = amount != null && Number.isFinite(amount) && amount > 0 ? amount : parked.amount;
      args.currency = currencyRaw;
      args.account = parked.account || account?.name;
      args.accountId = accountId ?? parked.accountId;
      args.category = parked.category;
      args.categoryId = input.categoryId ?? row.category_id ?? parked.categoryId;
      args.destinationAccount = parked.destinationAccount;
      args.destinationAccountId = parked.destinationAccountId;
      args.description =
        input.merchant ||
        row.merchant ||
        (typeof parked.description === 'string' ? parked.description : 'Wallet');
      args.transactionDate = walletCivilDate(
        (typeof parked.transactionDate === 'string' ? parked.transactionDate : null) ||
          (typeof parked.date === 'string' ? parked.date : null) ||
          occurred
      );
    }

    let result: Awaited<ReturnType<typeof executeRegistryTool>>;
    try {
      result = await executeRegistryTool(toolName, args, {
        userId: input.userId,
        financialContext,
        source: 'wallet',
        ledgerSource: ledgerChannelFor(row),
        requestId,
      });
    } catch (error) {
      if (error instanceof AmbiguousFinancialMutationError) {
        ledgerCommitted = true;
      }
      throw error;
    }
    if (result.response?.success !== true) {
      const priorAfter = await loadPriorLedger(input.userId, requestId);
      if (!priorAfter) {
        throw new ApiError(String(result.response?.error || 'No se pudo confirmar el movimiento.'));
      }
      result = {
        ...result,
        executed: result.executed?.length
          ? result.executed
          : [
              {
                id: priorAfter.id as string,
                summary: '',
                amount: 0,
                currency: 'ARS',
                accountName: '',
              },
            ],
      };
    }
    ledgerCommitted = true;

    if (accountId) {
      await rememberCardAccount(input.userId, row.card_name, accountId);
    }

    const { data: updated, error: updErr } = await supabase
      .from('pending_inbox_items')
      .update({
        status: 'confirmed',
        amount,
        currency: currencyRaw,
        merchant: input.merchant ?? row.merchant,
        account_id: accountId,
        category_id: input.categoryId ?? row.category_id,
        occurred_at: occurred,
        confirmed_transaction_id: result.executed?.[0]?.id ?? prior?.id ?? null,
        idempotency_key: row.idempotency_key || requestId,
        ingest_key: row.ingest_key || requestId,
        direction: directionFromType(txType),
      })
      .eq('id', input.itemId)
      .eq('user_id', input.userId)
      .eq('status', 'confirming')
      .select('*')
      .maybeSingle();
    if (updErr) throw updErr;
    if (!updated) {
      const { data: already } = await supabase
        .from('pending_inbox_items')
        .select('*')
        .eq('id', input.itemId)
        .eq('user_id', input.userId)
        .maybeSingle();
      if (already?.status === 'confirmed') {
        committed = true;
        return already as PendingInboxItem;
      }
      throw new ApiError('No se pudo actualizar el pendiente.');
    }

    if (input.req) {
      await recordIntegrationAudit({
        userId: input.userId,
        action: 'inbox.confirm',
        source: ledgerChannelFor(row),
        ipHash: auditIpFromRequest(input.req),
        userAgent: auditUserAgent(input.req),
        metadata: { itemId: input.itemId },
      });
    }
    committed = true;
    return updated as PendingInboxItem;
  } finally {
    if (!committed) {
      if (ledgerCommitted) await markUncertain();
      else await revertClaim();
    }
  }
}

function discardRpcError(error: { message?: string; code?: string } | null): never {
  const message = error?.message || 'No se pudo descartar.';
  if (/no encontrado/i.test(message)) throw new ApiError('Pendiente no encontrado.', 404);
  if (/ya fue confirmado/i.test(message)) throw new ApiError('Este pendiente ya fue confirmado.');
  if (/ya fue descartado/i.test(message)) throw new ApiError('Este pendiente ya fue descartado.');
  if (/confirmando/i.test(message) || /movimiento/i.test(message)) {
    throw new ApiError(message.includes('movimiento')
      ? 'Este pendiente ya tiene un movimiento. No se puede descartar.'
      : 'Este pendiente se está confirmando.', 409);
  }
  throw new ApiError(message, 409);
}

export async function discardPendingItem(input: { userId: string; itemId: string; req?: Request }): Promise<void> {
  const supabase = createServiceClientSync();
  const { data, error } = await supabase.rpc('discard_pending_inbox_item', {
    p_user_id: input.userId,
    p_item_id: input.itemId,
  });
  if (error) discardRpcError(error);
  const row = (Array.isArray(data) ? data[0] : data) as PendingInboxItem | undefined;
  if (!row) throw new ApiError('Pendiente no encontrado.', 404);
  if (input.req) {
    await recordIntegrationAudit({
      userId: input.userId,
      action: 'inbox.discard',
      source: ledgerChannelFor(row),
      ipHash: auditIpFromRequest(input.req),
      userAgent: auditUserAgent(input.req),
      metadata: { itemId: input.itemId },
    });
  }
}

export function sampleWalletPayload(): Record<string, unknown> {
  return {
    amount: 1250.5,
    currency: 'ARS',
    merchant: 'Ejemplo Café (dato de ejemplo)',
    cardName: 'Visa Ejemplo',
    timestamp: new Date().toISOString(),
  };
}
