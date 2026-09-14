import { describe, it, expect, vi } from 'vitest';
const harness = vi.hoisted(() => ({ commands:new Map<string, (ctx:any)=>Promise<unknown>>(), guards:[] as any[], from:vi.fn() }));
vi.mock('telegraf', () => ({
  Telegraf: class {
    use(fn:any){ harness.guards.push(fn); }
    command(name:string, fn:any){ harness.commands.set(name,fn); }
    action(){} on(){} catch(){}
    async handleUpdate(ctx:any){ await harness.guards.at(-1)(ctx,()=>harness.commands.get('cuentas')!(ctx)); }
  },
  Markup: { inlineKeyboard:vi.fn(), button:{ callback:vi.fn() } },
}));
vi.mock('@/lib/supabase/server', () => ({ createServiceClientSync:()=>({from:harness.from}) }));
vi.mock('@/lib/ai/gemini', () => ({ getGeminiForUser:vi.fn(), GeminiMissingKeyError:class extends Error {} }));
vi.mock('@/lib/services/internal-ai-chat', () => ({processInternalAiChatMessage:vi.fn()}));
import { handleCustomTelegramUpdate } from '@/lib/telegram/bot';

describe('custom Telegram owner isolation', () => {
  it('unlinked custom bot never resolves the incoming chat to another account', async () => {
    harness.from.mockClear();
    const ctx = { state:{}, chat:{id:222}, reply:vi.fn() };
    await handleCustomTelegramUpdate(ctx,'local-test-token',{userId:'owner-a',chatId:null});
    expect(harness.from).not.toHaveBeenCalled();
    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('No estás vinculado'));
  });
  it('linked custom bot ignores a different chat before loading financial data', async () => {
    harness.from.mockClear();
    const ctx = {state:{},chat:{id:222},reply:vi.fn()};
    await handleCustomTelegramUpdate(ctx,'local-test-token',{userId:'owner-a',chatId:111});
    expect(harness.from).not.toHaveBeenCalled();
    expect(ctx.reply).not.toHaveBeenCalled();
  });
});
