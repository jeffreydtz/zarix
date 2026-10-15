// Actual Gemini SDK with fetch doubles; Telegram APIs/media are explicit doubles.
// No test calls a real provider or uses a real credential.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createServiceClientSync: vi.fn() }));
vi.mock('telegraf', () => ({ Telegraf: class { telegram = { callApi: mocks.send }; } }));
import { GeminiClient } from '@/lib/ai/gemini';
import { AmbiguousFinancialMutationError } from '@/lib/financial-mutation-error';
import { downloadTelegramMedia } from '@/lib/telegram/download-media';
import { sendTelegramDm } from '@/lib/telegram/send';
const sdkResponse = (parts: unknown[]) => new Response(JSON.stringify({ candidates: [{ content: { role: 'model', parts }, finishReason: 'STOP' }] }));
function stall(signal: AbortSignal): Promise<never> {
  return new Promise((_resolve, reject) => {
    if (signal.aborted) return reject(new Error('synthetic abort'));
    signal.addEventListener('abort', () => reject(new Error('synthetic abort')), { once: true });
  });
}
beforeEach(() => {
  vi.stubEnv('GEMINI_TIMEOUT_MS', '10');
  vi.stubEnv('TELEGRAM_MEDIA_TIMEOUT_MS', '10');
  vi.stubEnv('TELEGRAM_SEND_TIMEOUT_MS', '10');
  vi.stubEnv('TELEGRAM_BOT_TOKEN', 'isolated-test-token');
  vi.stubGlobal('fetch', vi.fn()); mocks.send.mockReset();
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
describe('bounded Gemini SDK requests and tool-loop safety', () => {
  it.each(['chat', 'image', 'tools'])('aborts a stalled %s request', async kind => {
    let signal: AbortSignal | undefined;
    vi.mocked(fetch).mockImplementation((_url, options) => { signal = options?.signal as AbortSignal; return stall(signal); });
    const client = new GeminiClient('isolated-test-key');
    const pending = kind === 'chat' ? client.chat('test') : kind === 'image'
      ? client.chatWithImage('test', 'ZmFrZQ==', 'image/jpeg')
      : client.chatWithTools('test', { functionDeclarations: [], onToolCall: vi.fn() });
    await expect(pending).rejects.toThrow('synthetic abort');
    expect(signal?.aborted).toBe(true); expect(fetch).toHaveBeenCalledOnce();
  });
  it('aborts a stalled response after a successful tool instead of retrying that write', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(sdkResponse([{ functionCall: { name: 'create_transaction', args: {} } }]));
    vi.mocked(fetch).mockImplementationOnce((_url, options) => stall(options?.signal as AbortSignal));
    const write = vi.fn().mockResolvedValue({ success: true });
    await expect(new GeminiClient('isolated-test-key').chatWithTools('test', { functionDeclarations: [], onToolCall: write })).rejects.toThrow('synthetic abort');
    expect(write).toHaveBeenCalledOnce(); expect(fetch).toHaveBeenCalledTimes(2);
  });
  it('stops the actual model loop immediately on an ambiguous mutation', async () => {
    vi.mocked(fetch).mockResolvedValue(sdkResponse([
      { functionCall: { name: 'create_transaction', args: { amount: 100 } } },
      { functionCall: { name: 'create_transaction', args: { amount: 200 } } },
    ]));
    const error = new AmbiguousFinancialMutationError('synthetic uncertain commit');
    const write = vi.fn().mockRejectedValue(error);
    await expect(new GeminiClient('isolated-test-key').chatWithTools('test', { functionDeclarations: [], onToolCall: write })).rejects.toBe(error);
    expect(write).toHaveBeenCalledOnce(); expect(fetch).toHaveBeenCalledOnce();
  });
});
describe('bounded Telegram media and notification requests', () => {
  const telegram = () => ({ callApi: vi.fn().mockResolvedValue({ file_path: 'test.jpg' }), getFileLink: vi.fn().mockResolvedValue(new URL('https://media.example.test/test.jpg')) });
  it('aborts file metadata lookup before attempting download', async () => {
    const api = telegram(); let signal: AbortSignal | undefined;
    api.callApi.mockImplementation((_method, _payload, options) => { signal = options.signal; return stall(signal!); });
    await expect(downloadTelegramMedia(api as any, 'fixture', 100)).rejects.toThrow('interrumpió');
    expect(signal?.aborted).toBe(true); expect(fetch).not.toHaveBeenCalled();
  });
  it('aborts a stalled media response body, not just response headers', async () => {
    let signal: AbortSignal | undefined;
    vi.mocked(fetch).mockImplementation(async (_url, options) => {
      signal = options?.signal as AbortSignal;
      return new Response(new ReadableStream({ start(controller) {
        signal!.addEventListener('abort', () => controller.error(new Error('synthetic abort')), { once: true });
      } }));
    });
    await expect(downloadTelegramMedia(telegram() as any, 'fixture', 100)).rejects.toThrow('interrumpió');
    expect(signal?.aborted).toBe(true);
  });
  it('enforces the byte cap while streaming', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response('synthetic oversized bytes'));
    await expect(downloadTelegramMedia(telegram() as any, 'fixture', 5)).rejects.toThrow('tamaño máximo');
  });
  it('returns successful bounded bytes', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response('fixture'));
    expect(new TextDecoder().decode(await downloadTelegramMedia(telegram() as any, 'fixture', 100))).toBe('fixture');
  });
  it('aborts a stalled notification send so the outbox can retain/retry it', async () => {
    let signal: AbortSignal | undefined;
    mocks.send.mockImplementation((_method, _payload, options) => { signal = options.signal; return stall(signal!); });
    await expect(sendTelegramDm(123, 'test')).rejects.toThrow('tiempo permitido');
    expect(signal?.aborted).toBe(true);
    expect(mocks.send).toHaveBeenCalledWith('sendMessage', { chat_id: 123, text: 'test', parse_mode: undefined }, expect.objectContaining({ signal }));
  });
});
