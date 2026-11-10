import { ApiError } from '@/lib/api-handler';

export async function readCappedBytes(req: Request, maxBytes: number): Promise<Uint8Array> {
  const declared = Number(req.headers.get('content-length') || 0);
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new ApiError('El cuerpo es demasiado grande.', 413);
  }
  const reader = req.body?.getReader();
  if (!reader) {
    const buf = Buffer.from(await req.arrayBuffer());
    if (buf.byteLength > maxBytes) throw new ApiError('El cuerpo es demasiado grande.', 413);
    return new Uint8Array(buf);
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
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

export async function readCappedText(req: Request, maxBytes: number): Promise<string> {
  const bytes = await readCappedBytes(req, maxBytes);
  return Buffer.from(bytes).toString('utf8');
}
