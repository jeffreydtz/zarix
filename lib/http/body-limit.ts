import { ApiError } from '@/lib/api-handler';

export const MAX_INTEGRATION_BODY_BYTES = 64 * 1024;
export const MAX_JSONRPC_BATCH = 12;

export async function readLimitedJsonBody(
  req: Request,
  maxBytes = MAX_INTEGRATION_BODY_BYTES
): Promise<unknown> {
  const declared = Number(req.headers.get('content-length') || 0);
  if (declared > maxBytes) throw new ApiError('El cuerpo es demasiado grande.', 413);
  const raw = await req.text();
  if (Buffer.byteLength(raw, 'utf8') > maxBytes) throw new ApiError('El cuerpo es demasiado grande.', 413);
  if (!raw.trim()) return {};
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new ApiError('JSON inválido.', 400);
  }
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
