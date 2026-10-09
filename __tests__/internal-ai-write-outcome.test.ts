import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ chat: vi.fn(), tool: vi.fn(), quota: vi.fn() }));
vi.mock('@/lib/ai/gemini', () => ({ getGeminiForUser: async () => ({ chatWithTools: mocks.chat }) }));
vi.mock('@/lib/ai/prompts', () => ({ buildBotSystemPrompt: () => 'fixture' }));
vi.mock('@/lib/ai/bot-tools', () => ({
  BOT_FUNCTION_DECLARATIONS: [{ name: 'create_transaction' }],
  BOT_WRITE_TOOLS: new Set(['create_transaction']), executeBotTool: mocks.tool,
}));
vi.mock('@/lib/plans/service', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/plans/service')>();
  return { ...actual, withPlanQuota: mocks.quota };
});
import { processInternalAiChatMessage } from '@/lib/services/internal-ai-chat';
import { AmbiguousPlanWorkError } from '@/lib/plans/service';
const input = { userId: 'owner', message: 'fixture', requestKey: 'stable', financialContext: {} as any };
beforeEach(() => {
  vi.clearAllMocks();
  mocks.quota.mockImplementation(async (_input, work) => work());
  mocks.chat.mockImplementation(async (_message, options) => {
    await options.onToolCall('create_transaction', {});
    return { text: 'Listo, lo registré.', toolsUsed: ['create_transaction'] };
  });
});
describe('AI financial write outcomes', () => {
  it('never says executed or registered when a write was rejected', async () => {
    mocks.tool.mockResolvedValue({ response: { success: false, error: 'Cuenta no habilitada.' } });
    const result = await processInternalAiChatMessage(input);
    expect(result.mode).toBe('chat');
    expect(result.assistant_message).toBe('Cuenta no habilitada.');
    expect(result.raw_response).not.toContain('ejecuté');
    expect(result.raw_response).not.toContain('registré');
    expect(result.executed).toBeUndefined();
  });
  it('only confirms proven successful writes', async () => {
    mocks.tool.mockResolvedValue({ response: { success: true }, executed: [{ summary: 'Gasto', currency: 'ARS', amount: 1, accountName: 'Fixture' }] });
    const result = await processInternalAiChatMessage(input);
    expect(result.mode).toBe('executed');
    expect(result.raw_response).toContain('resultado confirmado');
    expect(result.executed).toHaveLength(1);
  });
  it('a provider failure after any write attempt remains ambiguous', async () => {
    mocks.tool.mockResolvedValue({ response: { success: true } });
    mocks.chat.mockImplementation(async (_message, options) => {
      await options.onToolCall('create_transaction', {});
      throw new Error('provider connection lost');
    });
    await expect(processInternalAiChatMessage(input)).rejects.toBeInstanceOf(AmbiguousPlanWorkError);
  });
  it('voice preparation and chat share one quota reservation', async () => {
    mocks.chat.mockResolvedValue({ text: 'fixture answer', toolsUsed: [] });
    const prepare = vi.fn(async () => 'transcribed fixture');
    await processInternalAiChatMessage({ ...input, message: 'voice:opaque-id', prepareMessage: prepare });
    expect(mocks.quota).toHaveBeenCalledOnce();
    expect(prepare).toHaveBeenCalledOnce();
    expect(mocks.chat).toHaveBeenCalledWith('transcribed fixture', expect.any(Object));
  });
  it('legacy fallback rejection cannot repeat its claimed success', async () => {
    mocks.chat.mockResolvedValue({ text: JSON.stringify({ action: 'create_transaction', transaction: { amount: 1 }, response: 'Lo registré' }), toolsUsed: [] });
    mocks.tool.mockResolvedValue({ response: { success: false, error: 'Cupo agotado.' } });
    const result = await processInternalAiChatMessage({ ...input, allowLegacyWriteFallback: true });
    expect(result.mode).toBe('chat');expect(result.assistant_message).toBe('Cupo agotado.');
  });
});
