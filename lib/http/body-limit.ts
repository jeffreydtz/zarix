import { ApiError } from '@/lib/api-handler';
import { rawJsonHasInvalidMoney } from '@/lib/money-amount';

export const MAX_INTEGRATION_BODY_BYTES = 64 * 1024;
export const MAX_JSONRPC_BATCH = 12;

export async function readLimitedText(
  req: Request,
  maxBytes = MAX_INTEGRATION_BODY_BYTES
): Promise<string> {
  const declared = Number(req.headers.get('content-length') || 0);
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new ApiError('El cuerpo es demasiado grande.', 413);
  }
  const reader = req.body?.getReader();
  if (!reader) {
    const raw = await req.text();
    if (Buffer.byteLength(raw, 'utf8') > maxBytes) throw new ApiError('El cuerpo es demasiado grande.', 413);
    return raw;
  }
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > maxBytes) {
      try {
        await reader.cancel();
      } catch {
        /* ignore */
      }
      throw new ApiError('El cuerpo es demasiado grande.', 413);
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks.map((c) => Buffer.from(c))).toString('utf8');
}

export async function readLimitedJsonBody(
  req: Request,
  maxBytes = MAX_INTEGRATION_BODY_BYTES
): Promise<unknown> {
  const { value } = await readLimitedJsonBodyWithRaw(req, maxBytes);
  return value;
}

export async function readLimitedJsonBodyWithRaw(
  req: Request,
  maxBytes = MAX_INTEGRATION_BODY_BYTES
): Promise<{ value: unknown; raw: string }> {
  const raw = await readLimitedText(req, maxBytes);
  if (!raw.trim()) return { value: {}, raw: '' };
  let value: unknown;
  try {
    value = JSON.parse(raw) as unknown;
  } catch {
    throw new ApiError('JSON inválido.', 400);
  }
  if (rawJsonHasInvalidMoney(raw)) {
    throw new ApiError('Monto inválido.', 400);
  }
  return { value, raw };
}

export function rejectJsonRpcBatch(body: unknown, max = MAX_JSONRPC_BATCH): void {
  if (Array.isArray(body) && body.length > max) {
    throw new ApiError('El lote JSON-RPC es demasiado grande.', 413);
  }
}

export const CANONICAL_APP_ORIGIN = 'https://zarix-phi.vercel.app';

export function canonicalAppOrigin(): string {
  const fromEnv = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, '');
  if (fromEnv && /^https?:\/\//i.test(fromEnv) && !/localhost|127\.0\.0\.1/i.test(fromEnv)) {
    return fromEnv;
  }
  return CANONICAL_APP_ORIGIN;
}
