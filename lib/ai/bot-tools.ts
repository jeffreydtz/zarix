/**
 * Compatibility façade for Telegram and the in-app chat.
 * The provider-agnostic registry in `lib/ai/registry` is the source of truth.
 */
import { geminiFunctionDeclarations } from '@/lib/ai/registry/gemini';
import { WRITE_TOOL_NAMES } from '@/lib/ai/registry/catalog';
import { executeRegistryTool } from '@/lib/ai/registry/execute';
import type { RegistryToolContext, RegistryToolResult, ToolArgs } from '@/lib/ai/registry/types';

export type BotToolContext = RegistryToolContext;
export type BotToolResult = RegistryToolResult;

export const BOT_WRITE_TOOLS: ReadonlySet<string> = WRITE_TOOL_NAMES;

export const BOT_FUNCTION_DECLARATIONS = geminiFunctionDeclarations();

export async function executeBotTool(
  name: string,
  args: ToolArgs,
  ctx: BotToolContext
): Promise<BotToolResult> {
  return executeRegistryTool(name, args, ctx);
}
