import type { Telegram } from 'telegraf';

/** One deadline covers Telegram metadata, headers and the complete media body. */
export async function downloadTelegramMedia(telegram: Telegram, fileId: string, maxBytes: number): Promise<ArrayBuffer> {
  const configured = Number(process.env.TELEGRAM_MEDIA_TIMEOUT_MS);
  const timeout = Number.isFinite(configured) && configured > 0 ? Math.min(configured, 20_000) : 8_000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const file = await telegram.callApi('getFile', { file_id: fileId }, {
      signal: controller.signal,
    } as Parameters<Telegram['callApi']>[2]);
    controller.signal.throwIfAborted();
    // Passing the fetched File avoids an additional unbounded metadata request.
    const link = await telegram.getFileLink(file);
    const response = await fetch(link.href, { signal: controller.signal });
    if (!response.ok) throw new Error('No se pudo descargar el archivo de Telegram.');
    if (Number(response.headers.get('content-length')) > maxBytes) {
      controller.abort();
      throw new Error('El archivo de Telegram supera el tamaño permitido.');
    }
    if (!response.body) throw new Error('Telegram devolvió un archivo vacío.');
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        controller.abort();
        await reader.cancel().catch(() => {});
        throw new Error('El archivo de Telegram supera el tamaño permitido.');
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return bytes.buffer;
  } catch {
    // Telegram URLs contain the bot token; never propagate URLs from fetch errors.
    throw new Error(controller.signal.aborted
      ? 'La descarga de Telegram se interrumpió por tiempo o tamaño máximo.'
      : 'No se pudo descargar el archivo de Telegram.');
  } finally {
    clearTimeout(timer);
  }
}
