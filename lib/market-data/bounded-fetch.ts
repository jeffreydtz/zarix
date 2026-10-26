/**
 * Shared fetch policy for public market HTML/JSON: no silent redirects,
 * and a hard cap on buffered response bytes.
 */

export const FETCH_REDIRECT: RequestRedirect = 'error';

export class ResponseTooLargeError extends Error {
  readonly maxBytes: number;
  readonly bytes: number;

  constructor(maxBytes: number, bytes: number) {
    super(`response too large (${bytes} > ${maxBytes})`);
    this.name = 'ResponseTooLargeError';
    this.maxBytes = maxBytes;
    this.bytes = bytes;
  }
}

function declaredLength(res: Response): number | null {
  try {
    const raw = res.headers?.get?.('content-length');
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 ? n : null;
  } catch {
    return null;
  }
}

async function readStreamCapped(
  body: ReadableStream<Uint8Array>,
  maxBytes: number
): Promise<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) {
        throw new ResponseTooLargeError(maxBytes, bytes);
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    return text;
  } catch (error) {
    try {
      await reader.cancel();
    } catch {
      // already failed
    }
    throw error;
  }
}

/**
 * Read a Response as text, aborting if Content-Length or the streamed/buffered
 * body exceeds `maxBytes`. Mocks without a ReadableStream fall back to `text()`.
 */
export async function readResponseTextCapped(res: Response, maxBytes: number): Promise<string> {
  const declared = declaredLength(res);
  if (declared != null && declared > maxBytes) {
    throw new ResponseTooLargeError(maxBytes, declared);
  }
  const body = res.body;
  if (body && typeof body.getReader === 'function') {
    return readStreamCapped(body, maxBytes);
  }
  const text = await res.text();
  const bytes = typeof Buffer !== 'undefined' ? Buffer.byteLength(text) : text.length;
  if (bytes > maxBytes) {
    throw new ResponseTooLargeError(maxBytes, bytes);
  }
  return text;
}
