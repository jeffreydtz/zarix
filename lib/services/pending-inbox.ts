import { createHash, randomUUID } from 'node:crypto';
import { ApiError } from '@/lib/api-handler';
import { createServiceClientSync } from '@/lib/supabase/server';
import { executeRegistryTool } from '@/lib/ai/registry/execute';
import type { FinancialContext } from '@/lib/ai/prompts';
import { accountsService } from '@/lib/services/accounts';
import {
  isWalletTimestampFresh,
  parseWalletPayload,
  type WalletIngestPayload,
} from '@/lib/integrations/wallet-parse';
import { inboxDedupeLockKey } from '@/lib/inbox-dedupe-lock-key';
import { isTransactionCurrency } from '@/lib/constants/transaction-currencies';
import { suggestCategoryFromMerchant } from '@/lib/integrations/merchant-category';
import { auditIpFromRequest, auditUserAgent, recordIntegrationAudit } from '@/lib/integrations/audit';
import { validTransactionRequestId } from '@/lib/transaction-idempotency';
import { withPatUserScope } from '@/lib/supabase/request-scope';
import { withFinancialRequestContext } from '@/lib/financial-request-context';
import { AmbiguousFinancialMutationError } from '@/lib/financial-mutation-error';
import { FxUnavailableError } from '@/lib/executable-fx';
import type { ToolArgs, WriteChannel } from '@/lib/ai/registry/types';
import { formatCents, integerCentsFromToken, numberToDecimalString } from '@/lib/money-amount';

export { inboxDedupeLockKey };

export const WALLET_CIVIL_TIMEZONE = 'America/Argentina/Cordoba';
export const STALE_CONFIRMING_MS = 2 * 60 * 1000;
/** Rolling window for anonymous possible-duplicate flags. Idempotency-Key stays durable. */
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

export type PendingInboxOriginalSummary = {
  id: string;
  merchant: string | null;
  amount: number | null;
  currency: string;
  status: string;
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
  possible_duplicate_of?: string | null;
  possible_duplicate?: PendingInboxOriginalSummary | null;
  request_canonical?: string | null;
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

export function isDateOnlyOccurredAt(iso?: string | null): boolean {
  return Boolean(iso && /^\d{4}-\d{2}-\d{2}$/.test(iso.trim()));
}

/** Full instant (not YYYY-MM-DD). Date-only is anonymous for auto-confirm and dedupe. */
export function isFullOccurredAt(iso?: string | null): boolean {
  if (!iso) return false;
  const value = iso.trim();
  if (isDateOnlyOccurredAt(value)) return false;
  return Number.isFinite(Date.parse(value));
}

/** Auto-confirm needs a full timestamp or an Idempotency-Key. Date-only is not enough. */
export function hasStableInboxIdentity(
  occurredAt: string | null | undefined,
  ingestKey: string | null | undefined
): boolean {
  return Boolean(ingestKey?.trim()) || isFullOccurredAt(occurredAt);
}

/** Diagnostic hash. Keyed fingerprints omit receive day. Not unique for anonymous rows. */
export function inboxEventFingerprint(
  userId: string,
  payload: Pick<WalletIngestPayload, 'amount' | 'currency' | 'merchant' | 'cardName' | 'direction'>,
  _occurredAt: string | null,
  ingestKey: string
): string {
  const sign = payload.direction === 'income' ? '-' : '+';
  const material = [
    userId,
    sign,
    payload.direction,
    payload.amount ?? '',
    payload.currency || 'ARS',
    normalizeCard(payload.cardName),
    (payload.merchant || '').toLowerCase(),
    ingestKey,
  ].join('|');
  return createHash('sha256').update(material).digest('hex');
}

const VOLATILE_PARKED_KEYS = new Set(['pendingId', 'pendingIds', 'confirm', 'requestId']);

const HYPHENATED_UUID_RE =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/** Lowercase hyphenated UUID. Rejects dashless and any other format at every inbox entry. */
export function canonicalPendingInboxId(raw: string): string {
  const value = String(raw ?? '').trim();
  if (!HYPHENATED_UUID_RE.test(value)) {
    throw new ApiError('Identificador de pendiente inválido.', 400);
  }
  return value.toLowerCase();
}

/** Canonicalize then drop duplicate ids so mixed-case retries confirm/count once. */
export function canonicalPendingInboxIds(raw: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of raw) {
    const canonical = canonicalPendingInboxId(id);
    if (seen.has(canonical)) continue;
    seen.add(canonical);
    out.push(canonical);
  }
  return out;
}

function nfcNorm(value: string | null | undefined): string {
  return String(value ?? '').normalize('NFC').trim().toLowerCase();
}

function normalizeOccurredUtc(iso: string | null | undefined): string | null {
  const stored = occurredAtForStorage(iso);
  if (!stored) return null;
  const parsed = new Date(stored);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

function normalizeAccountId(id: string | null | undefined): string | null {
  const value = String(id ?? '').trim().toLowerCase();
  return value || null;
}

function normalizeInstallments(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(36, Math.floor(n));
}

function canonicalAmountString(value: number | null | undefined): string | null {
  if (value == null || !Number.isFinite(Number(value))) return null;
  const token = numberToDecimalString(Number(value));
  const cents = integerCentsFromToken(token);
  if (cents == null) {
    throw new ApiError('El monto no puede tener más de dos decimales.', 400);
  }
  return formatCents(cents);
}

export const INBOX_REQUEST_CANONICAL_VERSION = 'v1';

export type InboxRequestCanonicalInput = {
  source: string;
  amount?: number | null;
  currency?: string | null;
  type?: string | null;
  direction?: string | null;
  occurredAt?: string | null;
  merchant?: string | null;
  cardName?: string | null;
  accountId?: string | null;
  accountName?: string | null;
  categoryId?: string | null;
  categoryName?: string | null;
  destinationAccountId?: string | null;
  destinationAccountName?: string | null;
  installments?: number | null;
};

/** Immutable request identity. Set once at insert; confirm must not rewrite it. */
export function inboxRequestCanonical(input: InboxRequestCanonicalInput): string {
  const type =
    nfcNorm(input.type || input.direction || 'expense') || 'expense';
  return `${INBOX_REQUEST_CANONICAL_VERSION}:${JSON.stringify({
    account_id: normalizeAccountId(input.accountId),
    account_name: nfcNorm(input.accountName),
    amount: canonicalAmountString(input.amount),
    card: normalizeCard(input.cardName ?? null),
    category_id: normalizeAccountId(input.categoryId),
    category_name: nfcNorm(input.categoryName),
    currency: (String(input.currency || 'ARS').trim().toUpperCase() || 'ARS'),
    destination_account_id: normalizeAccountId(input.destinationAccountId),
    destination_account_name: nfcNorm(input.destinationAccountName),
    installments: normalizeInstallments(input.installments),
    merchant: nfcNorm(input.merchant),
    occurred_at: normalizeOccurredUtc(input.occurredAt),
    source: nfcNorm(input.source || 'wallet') || 'wallet',
    type,
  })}`;
}

export function canonicalInboxPayloadKey(input: {
  source: string;
  amount: number | null | undefined;
  currency: string | null | undefined;
  direction: string | null | undefined;
  merchant: string | null | undefined;
  accountId: string | null | undefined;
  occurredAt?: string | null;
  cardName?: string | null;
  installments?: number | null;
  toolPayload?: ParkedToolPayload | null;
}): string {
  const parked = input.toolPayload;
  return inboxRequestCanonical({
    source: input.source,
    amount: input.amount,
    currency: input.currency,
    type: typeof parked?.type === 'string' ? parked.type : input.direction,
    direction: input.direction,
    merchant: input.merchant,
    accountId: input.accountId,
    accountName: typeof parked?.account === 'string' ? parked.account : null,
    categoryId: typeof parked?.categoryId === 'string' ? parked.categoryId : null,
    categoryName: typeof parked?.category === 'string' ? parked.category : null,
    destinationAccountId: typeof parked?.destinationAccountId === 'string' ? parked.destinationAccountId : null,
    destinationAccountName: typeof parked?.destinationAccount === 'string' ? parked.destinationAccount : null,
    occurredAt: input.occurredAt ?? (typeof parked?.transactionDate === 'string'
      ? parked.transactionDate
      : typeof parked?.date === 'string'
        ? parked.date
        : null),
    cardName: input.cardName ?? null,
    installments: input.installments ?? (typeof parked?.installments === 'number'
      ? parked.installments
      : 1),
  });
}

function storedRequestCanonical(row: PendingInboxItem): string {
  if (row.request_canonical) return row.request_canonical;
  const parked = row.tool_payload;
  return inboxRequestCanonical({
    source: row.source,
    amount: row.amount,
    currency: row.currency,
    type: typeof parked?.type === 'string' ? parked.type : row.direction,
    direction: row.direction,
    merchant: row.merchant,
    cardName: row.card_name,
    accountId: row.account_id,
    accountName: typeof parked?.account === 'string' ? parked.account : null,
    categoryId: row.category_id ?? (typeof parked?.categoryId === 'string' ? parked.categoryId : null),
    categoryName: typeof parked?.category === 'string' ? parked.category : null,
    destinationAccountId: typeof parked?.destinationAccountId === 'string' ? parked.destinationAccountId : null,
    destinationAccountName: typeof parked?.destinationAccount === 'string' ? parked.destinationAccount : null,
    occurredAt: row.occurred_at,
    installments: typeof parked?.installments === 'number' ? parked.installments : 1,
  });
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

async function loadByIngestKey(userId: string, ingestKey: string): Promise<PendingInboxItem | null> {
  const supabase = createServiceClientSync();
  const { data } = await supabase
    .from('pending_inbox_items')
    .select('*')
    .eq('user_id', userId)
    .eq('ingest_key', ingestKey)
    .maybeSingle();
  return (data as PendingInboxItem | null) ?? null;
}

export async function ingestWalletItem(input: {
  userId: string;
  json?: Record<string, unknown> | null;
  text?: string | null;
  rawJson?: string | null;
  idempotencyKey?: string | null;
  req?: Request;
}): Promise<{ item: PendingInboxItem; duplicate: boolean; autoConfirmed: boolean }> {
  return withPatUserScope(input.userId, () => ingestWalletItemUnlocked(input));
}

async function ingestWalletItemUnlocked(input: {
  userId: string;
  json?: Record<string, unknown> | null;
  text?: string | null;
  rawJson?: string | null;
  idempotencyKey?: string | null;
  req?: Request;
}): Promise<{ item: PendingInboxItem; duplicate: boolean; autoConfirmed: boolean }> {
  const payload = parseWalletPayload({ json: input.json, text: input.text, rawJson: input.rawJson });
  if (payload.currencyUnsupported || !isTransactionCurrency(payload.currency)) {
    throw new ApiError('Moneda no admitida. Usá ARS, USD o EUR.', 400);
  }
  const occurredAt = occurredAtForStorage(payload.occurredAt);
  const clientKey = input.idempotencyKey?.trim() || null;
  if (clientKey && !validTransactionRequestId(clientKey) && !/^[A-Za-z0-9._:-]{8,200}$/.test(clientKey)) {
    throw new ApiError('Idempotency-Key inválida.');
  }
  const ingestKey = clientKey || randomUUID();
  const fp = inboxEventFingerprint(input.userId, payload, occurredAt, clientKey || '');
  const accountId = await resolveCardAccount(input.userId, payload.cardName);
  const requestAccountId =
    typeof input.json?.accountId === 'string'
      ? input.json.accountId
      : typeof input.json?.account_id === 'string'
        ? input.json.account_id
        : null;
  const requestAccountName =
    typeof input.json?.account === 'string'
      ? input.json.account
      : typeof input.json?.accountName === 'string'
        ? input.json.accountName
        : null;
  const requestCategoryId =
    typeof input.json?.categoryId === 'string'
      ? input.json.categoryId
      : typeof input.json?.category_id === 'string'
        ? input.json.category_id
        : null;
  const requestCategoryName = typeof input.json?.category === 'string' ? input.json.category : null;
  const requestDestinationId =
    typeof input.json?.destinationAccountId === 'string'
      ? input.json.destinationAccountId
      : typeof input.json?.destination_account_id === 'string'
        ? input.json.destination_account_id
        : null;
  const requestCanonical = inboxRequestCanonical({
    source: 'wallet',
    amount: payload.amount,
    currency: payload.currency,
    type: payload.direction,
    direction: payload.direction,
    occurredAt,
    merchant: payload.merchant,
    cardName: payload.cardName,
    accountId: requestAccountId,
    accountName: requestAccountName,
    categoryId: requestCategoryId,
    categoryName: requestCategoryName,
    destinationAccountId: requestDestinationId,
    installments: 1,
  });
  if (clientKey) {
    const existing = await loadByIngestKey(input.userId, ingestKey);
    if (existing) {
      if (existing.source !== 'wallet' || storedRequestCanonical(existing) !== requestCanonical) {
        throw new ApiError('Esa Idempotency-Key ya se usó con otro cuerpo.', 409);
      }
      return { item: existing, duplicate: true, autoConfirmed: existing.status === 'confirmed' };
    }
  }
  if (payload.occurredAt && !isWalletTimestampFresh(payload.occurredAt)) {
    throw new ApiError('La fecha del movimiento está fuera de rango.', 400);
  }
  const suggestion = await suggestCategoryFromMerchant({ userId: input.userId, merchant: payload.merchant });
  const supabase = createServiceClientSync();
  const { data: reserved, error } = await supabase.rpc('reserve_pending_inbox_item', {
    p_user_id: input.userId,
    p_lock_key: inboxDedupeLockKey(input.userId, payload, clientKey || ''),
    p_ingest_key: ingestKey,
    p_client_keyed: Boolean(clientKey),
    p_lookback_ms: INBOX_DEDUPE_WINDOW_MS,
    p_row: {
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
      request_canonical: requestCanonical,
    },
  });

  if (error) {
    if (/Idempotency-Key ya se usó/i.test(error.message || '')) {
      throw new ApiError('Esa Idempotency-Key ya se usó con otro cuerpo.', 409);
    }
    throw error;
  }
  const reservedRow = reserved as { item?: PendingInboxItem; duplicate?: boolean } | null;
  const data = reservedRow?.item;
  if (!data) throw new ApiError('No se pudo guardar el pendiente.');
  if (reservedRow?.duplicate) {
    return { item: data, duplicate: true, autoConfirmed: data.status === 'confirmed' };
  }

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
    !data.possible_duplicate_of &&
    hasStableInboxIdentity(payload.occurredAt, clientKey)
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
  const clientKey = input.ingestKey?.trim() || null;
  const ingestKey = clientKey || randomUUID();
  const toolPayload = input.toolPayload
    ? Object.fromEntries(
        Object.entries(input.toolPayload).filter(([key]) => !VOLATILE_PARKED_KEYS.has(key))
      ) as ParkedToolPayload
    : null;
  const type = String(toolPayload?.type || 'expense').trim().toLowerCase() || 'expense';
  const direction = (type === 'income' ? 'income' : 'expense') as 'expense' | 'income';
  const accountId =
    input.accountId ?? (typeof toolPayload?.accountId === 'string' ? toolPayload.accountId : null);
  const payload = {
    amount: input.amount ?? null,
    currency: input.currency,
    merchant: input.merchant ?? null,
    cardName: null as string | null,
    direction,
  };
  const occurredAt = occurredAtForStorage(input.occurredAt ?? null);
  const fp = inboxEventFingerprint(input.userId, payload, occurredAt, clientKey || '');
  const incomingCanonical = inboxRequestCanonical({
    source: input.source,
    amount: input.amount,
    currency: input.currency,
    type,
    direction,
    merchant: input.merchant ?? null,
    cardName: null,
    accountId,
    accountName: typeof toolPayload?.account === 'string' ? toolPayload.account : null,
    categoryId: input.categoryId ?? (typeof toolPayload?.categoryId === 'string' ? toolPayload.categoryId : null),
    categoryName: typeof toolPayload?.category === 'string' ? toolPayload.category : null,
    destinationAccountId: typeof toolPayload?.destinationAccountId === 'string' ? toolPayload.destinationAccountId : null,
    destinationAccountName: typeof toolPayload?.destinationAccount === 'string' ? toolPayload.destinationAccount : null,
    occurredAt,
    installments: typeof toolPayload?.installments === 'number' ? toolPayload.installments : 1,
  });
  if (clientKey) {
    const existing = await loadByIngestKey(input.userId, ingestKey);
    if (existing) {
      if (existing.source !== input.source || storedRequestCanonical(existing) !== incomingCanonical) {
        throw new ApiError('Esa Idempotency-Key ya se usó con otro cuerpo.', 409);
      }
      return existing;
    }
  }
  const supabase = createServiceClientSync();
  const { data: reserved, error } = await supabase.rpc('reserve_pending_inbox_item', {
    p_user_id: input.userId,
    p_lock_key: inboxDedupeLockKey(input.userId, payload, clientKey || ''),
    p_ingest_key: ingestKey,
    p_client_keyed: Boolean(clientKey),
    p_lookback_ms: INBOX_DEDUPE_WINDOW_MS,
    p_row: {
      amount: input.amount ?? null,
      currency: input.currency,
      merchant: input.merchant ?? null,
      account_id: accountId,
      category_id: input.categoryId ?? (typeof toolPayload?.categoryId === 'string' ? toolPayload.categoryId : null),
      occurred_at: occurredAt,
      status: 'pending',
      suggestion_source: 'none',
      idempotency_key: clientKey,
      ingest_key: ingestKey,
      direction,
      amount_ambiguous: false,
      source: input.source,
      fingerprint: fp,
      tool_payload: toolPayload,
      request_canonical: incomingCanonical,
    },
  });
  if (error) {
    if (/Idempotency-Key ya se usó/i.test(error.message || '')) {
      throw new ApiError('Esa Idempotency-Key ya se usó con otro cuerpo.', 409);
    }
    if (isUniqueViolation(error) && clientKey) {
      const existing = await loadByIngestKey(input.userId, ingestKey);
      if (existing) {
        if (existing.source !== input.source || storedRequestCanonical(existing) !== incomingCanonical) {
          throw new ApiError('Esa Idempotency-Key ya se usó con otro cuerpo.', 409);
        }
        return existing;
      }
    }
    throw error || new ApiError('No se pudo guardar el pendiente.');
  }
  const reservedRow = reserved as { item?: PendingInboxItem; duplicate?: boolean } | null;
  const data = reservedRow?.item;
  if (!data) throw new ApiError('No se pudo guardar el pendiente.');
  return data;
}

async function attachPossibleDuplicateOriginals(
  userId: string,
  rows: PendingInboxItem[]
): Promise<PendingInboxItem[]> {
  const originalIds = [
    ...new Set(rows.map((item) => item.possible_duplicate_of).filter((id): id is string => Boolean(id))),
  ];
  if (originalIds.length === 0) return rows.map((item) => ({ ...item, possible_duplicate: null }));
  const supabase = createServiceClientSync();
  const { data, error } = await supabase
    .from('pending_inbox_items')
    .select('id, merchant, amount, currency, status')
    .eq('user_id', userId)
    .in('id', originalIds);
  if (error) throw error;
  const byId = new Map(
    ((data ?? []) as PendingInboxOriginalSummary[]).map((row) => [row.id, row])
  );
  return rows.map((item) => ({
    ...item,
    possible_duplicate: item.possible_duplicate_of ? byId.get(item.possible_duplicate_of) ?? null : null,
  }));
}

export async function listPendingItems(userId: string, status: 'pending' | 'all' = 'pending'): Promise<PendingInboxItem[]> {
  const supabase = createServiceClientSync();
  let q = supabase.from('pending_inbox_items').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(100);
  if (status === 'pending') q = q.in('status', ['pending', 'confirming', 'uncertain']);
  const { data, error } = await q;
  if (error) throw error;
  const rows = (data ?? []) as PendingInboxItem[];
  const visible =
    status !== 'pending'
      ? rows
      : rows.filter(
          (item) => item.status === 'pending' || item.status === 'uncertain' || isStaleConfirming(item)
        );
  return attachPossibleDuplicateOriginals(userId, visible);
}

async function loadFinancialContext(userId: string): Promise<FinancialContext> {
  const { loadRegistryFinancialContext } = await import('@/lib/ai/registry/context');
  return loadRegistryFinancialContext(userId);
}

export function pendingInboxRequestId(itemId: string): string {
  return `wallet:${canonicalPendingInboxId(itemId)}`;
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
  const itemId = canonicalPendingInboxId(input.itemId);
  const next = { ...input, itemId };
  return withPatUserScope(next.userId, () =>
    withFinancialRequestContext(pendingInboxRequestId(itemId), () => confirmPendingItemUnlocked(next))
  );
}

export type PendingBatchItemStatus = {
  pendingId: string;
  status: string;
  error?: string;
};

function confirmableInboxStatus(status: string): boolean {
  return status === 'pending' || status === 'uncertain' || status === 'confirming';
}

function parkedConfirmFields(row: PendingInboxItem) {
  const parked = row.tool_payload;
  const amount =
    (typeof parked?.amount === 'number' ? parked.amount : null) ??
    (typeof row.amount === 'number' ? row.amount : null);
  const accountId =
    (typeof parked?.accountId === 'string' ? parked.accountId : null) ?? row.account_id;
  const type = String(parked?.type || (row.direction === 'income' ? 'income' : 'expense'));
  const accountName = typeof parked?.account === 'string' ? parked.account : null;
  return { amount, accountId, type, accountName };
}

function preflightConfirmItem(row: PendingInboxItem | undefined): { error: string; status: number } | null {
  if (!row) return { error: 'Pendiente no encontrado.', status: 400 };
  if (row.status === 'discarded') return { error: 'Este pendiente ya fue descartado.', status: 400 };
  if (row.status === 'confirmed') return null;
  if (row.status === 'confirming' && !isStaleConfirming(row)) {
    return { error: 'Este pendiente se está confirmando.', status: 409 };
  }
  if (!(confirmableInboxStatus(row.status) || isStaleConfirming(row))) {
    return { error: 'Este pendiente no se puede confirmar.', status: 400 };
  }
  const { amount, accountId, type, accountName } = parkedConfirmFields(row);
  if (amount == null || !Number.isFinite(amount) || amount <= 0) {
    return { error: 'Falta el monto para confirmar.', status: 400 };
  }
  const amountToken = numberToDecimalString(amount);
  if (integerCentsFromToken(amountToken) == null) {
    return { error: 'El monto no puede tener más de dos decimales.', status: 400 };
  }
  if (!accountId && type !== 'transfer' && !accountName) {
    return { error: 'Elegí la cuenta de Zarix para esta tarjeta.', status: 400 };
  }
  return null;
}

export async function confirmPendingItems(input: {
  userId: string;
  itemIds: string[];
  source?: WriteChannel;
  req?: Request;
}): Promise<PendingInboxItem[]> {
  const ids = canonicalPendingInboxIds(input.itemIds);
  if (ids.length === 0) return [];
  const supabase = createServiceClientSync();
  const { data, error } = await supabase
    .from('pending_inbox_items')
    .select('*')
    .eq('user_id', input.userId)
    .in('id', ids);
  if (error) throw error;
  const byId = new Map(((data ?? []) as PendingInboxItem[]).map((row) => [row.id, row]));
  const blocked = ids
    .map((id) => ({ id, err: preflightConfirmItem(byId.get(id)) }))
    .find((item) => item.err);
  if (blocked?.err) {
    throw new ApiError(blocked.err.error, blocked.err.status);
  }
  const neededAccountIds = [
    ...new Set(
      ids.flatMap((id) => {
        const row = byId.get(id);
        if (!row || row.status === 'confirmed') return [];
        const { accountId } = parkedConfirmFields(row);
        return accountId ? [accountId] : [];
      })
    ),
  ];
  if (neededAccountIds.length > 0) {
    const accounts = await accountsService.list(input.userId);
    const known = new Set(accounts.map((account) => account.id));
    if (neededAccountIds.some((accountId) => !known.has(accountId))) {
      throw new ApiError('La cuenta no existe.', 400);
    }
  }
  const out: PendingInboxItem[] = [];
  for (const id of ids) {
    const row = byId.get(id);
    if (row?.status === 'confirmed') {
      out.push(row);
      continue;
    }
    out.push(await confirmPendingItem({ userId: input.userId, itemId: id, source: input.source, req: input.req }));
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
    const rawOccurred =
      input.occurredAt ??
      (typeof parked.transactionDate === 'string' ? parked.transactionDate : null) ??
      (typeof parked.date === 'string' ? parked.date : null) ??
      row.occurred_at;
    const occurred = occurredAtForStorage(rawOccurred);
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
      args.transactionDate = occurred ?? undefined;
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
      if (error instanceof FxUnavailableError) throw error;
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
  const itemId = canonicalPendingInboxId(input.itemId);
  const supabase = createServiceClientSync();
  const { data, error } = await supabase.rpc('discard_pending_inbox_item', {
    p_user_id: input.userId,
    p_item_id: itemId,
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
      metadata: { itemId },
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
