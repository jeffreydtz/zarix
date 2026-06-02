import type { Content } from '@google/generative-ai';
import { getGeminiForUser, getTierForRequest } from '@/lib/ai/gemini';
import { buildBotSystemPrompt, type FinancialContext } from '@/lib/ai/prompts';
import {
  BOT_FUNCTION_DECLARATIONS,
  BOT_WRITE_TOOLS,
  executeBotTool,
} from '@/lib/ai/bot-tools';
import type {
  ExecutedTransactionSummary,
  InternalAiChatHistoryItem,
  InternalAiChatSuccessResponse,
} from '@/types/internal-ai-chat';

export const MAX_BATCH_TRANSACTIONS = 12;

/** Mensajes "pesados" (listas, varios montos) van al modelo full por confiabilidad. */
export function preferFullTierForMessage(message: string): boolean {
  const newlines = (message.match(/\n/g) || []).length;
  if (message.length > 400) return true;
  if (newlines >= 2) return true;
  if (/^\s*[-•*]\s/m.test(message) || /;\s/.test(message)) return true;
  const nums = message.match(/\d[\d.,]*/g);
  if (nums && nums.length >= 4) return true;
  return false;
}

export function mapHistoryToGemini(history: InternalAiChatHistoryItem[] = []): Content[] {
  return history
    .filter((h) => h?.text?.trim())
    .map((h) => ({
      role: h.role,
      parts: [{ text: h.text }],
    }));
}

function executionSummaryLine(executed: ExecutedTransactionSummary): string {
  const cat = executed.categoryName ? ` · ${executed.categoryName}` : '';
  return `- ${executed.summary} (${executed.currency} ${executed.amount.toLocaleString('es-AR')}, ${executed.accountName}${cat})`;
}

export async function processInternalAiChatMessage(input: {
  userId: string;
  message: string;
  financialContext: FinancialContext;
  history?: InternalAiChatHistoryItem[];
}): Promise<InternalAiChatSuccessResponse> {
  const systemPrompt = buildBotSystemPrompt(input.financialContext);
  const tier = preferFullTierForMessage(input.message)
    ? 'full'
    : getTierForRequest(input.message, false);

  const gemini = await getGeminiForUser(input.userId);

  const executed: ExecutedTransactionSummary[] = [];

  const { text, toolsUsed } = await gemini.chatWithTools(input.message, {
    tier,
    systemInstruction: systemPrompt,
    history: mapHistoryToGemini(input.history),
    functionDeclarations: BOT_FUNCTION_DECLARATIONS,
    maxTokens: 2048,
    onToolCall: async (name, args) => {
      const out = await executeBotTool(name, args, {
        userId: input.userId,
        financialContext: input.financialContext,
      });
      if (out.executed?.length) executed.push(...out.executed);
      return out.response;
    },
  });

  const didWrite = executed.length > 0 || toolsUsed.some((t) => BOT_WRITE_TOOLS.has(t));

  const fallback = executed.length
    ? executed.map(executionSummaryLine).join('\n')
    : 'Listo.';

  return {
    mode: didWrite ? 'executed' : 'chat',
    assistant_message: text || fallback,
    executed: executed.length ? executed : undefined,
    raw_response: text,
  };
}
