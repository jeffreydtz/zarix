import { createHash } from 'node:crypto';
import { ApiError } from '@/lib/api-handler';
import { getGeminiForUser, GeminiMissingKeyError } from '@/lib/ai/gemini';
import { parkRegistryWrite, type PendingInboxItem } from '@/lib/services/pending-inbox';
import { createServiceClientSync } from '@/lib/supabase/server';
import type { WriteChannel } from '@/lib/ai/registry/types';
import {
  looksLikeCsv,
  looksLikePdf,
  parseGeminiExtractJson,
  parseStatementCsv,
  MAX_EXTRACTED_MOVEMENTS,
  type ExtractedMovement,
  type ExtractedStatement,
} from '@/lib/integrations/statement-parse';
import { reconcileExtractedMovement, type LedgerCandidate } from '@/lib/integrations/statement-reconcile';
import { statementExtractSystemInstruction, wrapUntrustedExtract } from '@/lib/integrations/untrusted-extract';
import { parseWalletText } from '@/lib/integrations/wallet-parse';
import { calendarDateToUtcNoonIso, isCivilYmd } from '@/lib/transaction-date';

const GEMINI_EXTRACT_PROMPT = `Extraé SOLO movimientos reales del documento. JSON:
{"movements":[{"amount":0,"currency":"ARS","type":"expense","merchant":"comercio","description":"texto","date":"YYYY-MM-DD","installments":1,"installmentNumber":null}],"cardLast4":null}
Reglas: type expense|income; installments 1-36; date ISO o null; no inventes filas; ignorá publicidad y pie de página.`;

export type StatementIngestResult = {
  parked: number;
  duplicates: number;
  installments: number;
  skipped: number;
  items: Array<{
    id: string;
    merchant: string | null;
    amount: number | null;
    currency: string;
    match: 'none' | 'duplicate' | 'installment';
  }>;
  parser: ExtractedStatement['parser'];
};

function sha256Hex(bytes: Uint8Array | string): string {
  const h = createHash('sha256');
  if (typeof bytes === 'string') h.update(bytes, 'utf8');
  else h.update(bytes);
  return h.digest('hex');
}

function occurredAtIso(date: string | null): string | null {
  if (!date || !isCivilYmd(date)) return null;
  return calendarDateToUtcNoonIso(date);
}

async function loadRecentLedger(userId: string): Promise<LedgerCandidate[]> {
  const supabase = createServiceClientSync();
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - 120);
  const { data, error } = await supabase
    .from('transactions')
    .select('id, amount, currency, transaction_date, description, installment_number, installment_total')
    .eq('user_id', userId)
    .gte('transaction_date', since.toISOString())
    .limit(500);
  if (error) throw error;
  return (data ?? []) as LedgerCandidate[];
}

async function extractWithGemini(input: {
  userId: string;
  text?: string;
  pdfBase64?: string;
}): Promise<ExtractedStatement> {
  let gemini;
  try {
    gemini = await getGeminiForUser(input.userId);
  } catch (error) {
    if (error instanceof GeminiMissingKeyError) {
      throw new ApiError('Configurá Gemini para leer PDFs o CSV sin columnas reconocibles.', 400);
    }
    throw error;
  }
  const wrapped = wrapUntrustedExtract(input.text || 'Documento adjunto. Extraé los movimientos.');
  const raw = input.pdfBase64
    ? await gemini.chatWithImage(`${GEMINI_EXTRACT_PROMPT}\n${wrapped}`, input.pdfBase64, 'application/pdf', {
        maxTokens: 4096,
        systemInstruction: statementExtractSystemInstruction(),
      })
    : await gemini.chat(`${GEMINI_EXTRACT_PROMPT}\n${wrapped}`, {
        tier: 'full',
        maxTokens: 4096,
        systemInstruction: statementExtractSystemInstruction(),
      });
  return parseGeminiExtractJson(raw);
}

export async function extractStatementFromBytes(input: {
  userId: string;
  bytes: Uint8Array;
  filename?: string | null;
  mimeType?: string | null;
}): Promise<ExtractedStatement> {
  if (looksLikePdf(input.bytes, input.mimeType, input.filename)) {
    return extractWithGemini({
      userId: input.userId,
      pdfBase64: Buffer.from(input.bytes).toString('base64'),
    });
  }
  const text = Buffer.from(input.bytes).toString('utf8');
  if (looksLikeCsv(input.mimeType, input.filename, text)) {
    const csv = parseStatementCsv(text);
    if (csv) return csv;
  }
  return extractWithGemini({ userId: input.userId, text });
}

export function extractMovementsFromEmailText(text: string): ExtractedMovement[] {
  const parsed = parseWalletText(text);
  if (parsed.amount == null || parsed.amount <= 0) return [];
  return [
    {
      amount: parsed.amount,
      currency: parsed.currency || 'ARS',
      type: parsed.direction === 'income' ? 'income' : 'expense',
      merchant: (parsed.merchant || 'movimiento por mail').slice(0, 160),
      description: (parsed.merchant || text).slice(0, 160),
      date: parsed.occurredAt ? parsed.occurredAt.slice(0, 10) : null,
      installments: 1,
      installmentNumber: null,
    },
  ];
}

async function parkMovements(input: {
  userId: string;
  movements: ExtractedMovement[];
  source: WriteChannel;
  batchKey: string;
  accountId?: string | null;
}): Promise<StatementIngestResult> {
  const ledger = await loadRecentLedger(input.userId);
  const items: StatementIngestResult['items'] = [];
  let duplicates = 0;
  let installments = 0;
  let parked = 0;
  for (const [index, movement] of input.movements.slice(0, MAX_EXTRACTED_MOVEMENTS).entries()) {
    const match = reconcileExtractedMovement(movement, ledger);
    if (match.kind === 'duplicate') duplicates += 1;
    if (match.kind === 'installment') installments += 1;
    const ingestKey = `${input.source}:${input.batchKey}:${index}`;
    const row = await parkRegistryWrite({
      userId: input.userId,
      amount: movement.amount,
      currency: movement.currency,
      merchant: movement.merchant,
      accountId: input.accountId ?? null,
      occurredAt: occurredAtIso(movement.date),
      source: input.source,
      ingestKey,
      toolPayload: {
        type: movement.type,
        amount: movement.amount,
        currency: movement.currency,
        description: movement.description,
        merchant: movement.merchant,
        transactionDate: movement.date ?? undefined,
        installments: movement.installments,
        accountId: input.accountId ?? undefined,
        reconcile: match,
      },
    });
    items.push({
      id: row.id,
      merchant: row.merchant,
      amount: row.amount,
      currency: row.currency,
      match: match.kind,
    });
    parked += 1;
  }
  return {
    parked,
    duplicates,
    installments,
    skipped: Math.max(0, input.movements.length - parked),
    items,
    parser: 'csv',
  };
}

export async function ingestExtractedMovements(input: {
  userId: string;
  statement: ExtractedStatement;
  source: WriteChannel;
  batchKey: string;
  accountId?: string | null;
}): Promise<StatementIngestResult> {
  if (input.statement.movements.length === 0) {
    throw new ApiError('No encontré movimientos en el archivo.', 400);
  }
  const result = await parkMovements({
    userId: input.userId,
    movements: input.statement.movements,
    source: input.source,
    batchKey: input.batchKey,
    accountId: input.accountId,
  });
  return { ...result, parser: input.statement.parser };
}

export async function ingestStatementFile(input: {
  userId: string;
  bytes: Uint8Array;
  filename?: string | null;
  mimeType?: string | null;
  accountId?: string | null;
  source?: WriteChannel;
}): Promise<StatementIngestResult> {
  const source = input.source ?? 'statement';
  const batchKey = sha256Hex(input.bytes);
  const statement = await extractStatementFromBytes({
    userId: input.userId,
    bytes: input.bytes,
    filename: input.filename,
    mimeType: input.mimeType,
  });
  return ingestExtractedMovements({
    userId: input.userId,
    statement,
    source,
    batchKey,
    accountId: input.accountId,
  });
}

export function contentHash(value: string | Uint8Array): string {
  return sha256Hex(value);
}

export async function ingestEmailPayload(input: {
  userId: string;
  text: string;
  subject: string;
  from: string;
  messageId: string;
  attachments: Array<{ filename: string; contentType: string; bytes: Uint8Array }>;
}): Promise<StatementIngestResult> {
  const batchKey = sha256Hex(input.messageId || `${input.from}|${input.subject}|${input.text.slice(0, 200)}`);
  const movements: ExtractedMovement[] = extractMovementsFromEmailText(
    [input.subject, input.from, input.text].filter(Boolean).join('\n')
  );
  let parser: ExtractedStatement['parser'] = 'wallet-text';
  if (movements.length === 0 && input.text.trim().length > 20) {
    const gemini = await extractWithGemini({ userId: input.userId, text: input.text });
    movements.push(...gemini.movements);
    parser = 'gemini';
  }
  for (const attachment of input.attachments) {
    const extracted = await extractStatementFromBytes({
      userId: input.userId,
      bytes: attachment.bytes,
      filename: attachment.filename,
      mimeType: attachment.contentType,
    });
    movements.push(...extracted.movements);
    parser = extracted.parser;
  }
  if (movements.length === 0) {
    throw new ApiError('No encontré movimientos en el mail.', 400);
  }
  return ingestExtractedMovements({
    userId: input.userId,
    statement: { movements, parser, cardLast4: null },
    source: 'email',
    batchKey,
  });
}

export type { PendingInboxItem };
