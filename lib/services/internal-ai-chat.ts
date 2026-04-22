import type { Content } from '@google/generative-ai';
import { getGeminiForUser, getTierForRequest } from '@/lib/ai/gemini';
import { buildBotSystemPrompt, type FinancialContext } from '@/lib/ai/prompts';
import { accountsService } from '@/lib/services/accounts';
import { executeBotTransaction, type BotTxPayload } from '@/lib/telegram/executeBotTransaction';
import type {
  ExecutedTransactionSummary,
  InternalAiChatHistoryItem,
  InternalAiChatSuccessResponse,
} from '@/types/internal-ai-chat';

export const MAX_BATCH_TRANSACTIONS = 12;

interface ParsedModelResponse {
  action: 'create_transaction' | 'create_transactions' | 'create_account' | 'query' | 'chat' | string;
  transaction?: BotTxPayload & { name?: string };
  transactions?: BotTxPayload[];
  response?: string;
}

export function preferFullTierForMessage(message: string): boolean {
  const newlines = (message.match(/\n/g) || []).length;
  if (message.length > 400) return true;
  if (newlines >= 2) return true;
  if (/^\s*[-•*]\s/m.test(message) || /;\s/.test(message)) return true;
  const nums = message.match(/\d[\d.,]*/g);
  if (nums && nums.length >= 4) return true;
  return false;
}

export function parseModelJson(aiResponse: string): ParsedModelResponse {
  const cleaned = aiResponse.trim().replace(/^```json\s*/, '').replace(/```\s*$/, '');
  return JSON.parse(cleaned) as ParsedModelResponse;
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
  const tier = preferFullTierForMessage(input.message) ? 'full' : getTierForRequest(input.message, false);

  const gemini = await getGeminiForUser(input.userId);
  const aiResponse = await gemini.chat(input.message, {
    tier,
    systemInstruction: systemPrompt,
    history: mapHistoryToGemini(input.history),
    maxTokens: 2048,
  });

  let parsedResponse: ParsedModelResponse;
  try {
    parsedResponse = parseModelJson(aiResponse);
  } catch {
    return {
      mode: 'chat',
      assistant_message: aiResponse,
      raw_response: aiResponse,
    };
  }

  if (parsedResponse.action === 'create_transaction' && parsedResponse.transaction) {
    const result = await executeBotTransaction(
      input.userId,
      input.financialContext,
      parsedResponse.transaction,
      { summaryResponse: parsedResponse.response ?? '' }
    );
    if (result.kind === 'abort') {
      return { mode: 'chat', assistant_message: result.reply, raw_response: aiResponse };
    }
    return {
      mode: 'executed',
      assistant_message: parsedResponse.response || result.reply,
      executed: result.executed ? [result.executed] : undefined,
      raw_response: aiResponse,
    };
  }

  if (parsedResponse.action === 'create_transactions' && Array.isArray(parsedResponse.transactions)) {
    const txs = parsedResponse.transactions
      .filter((t) => t && typeof t.amount === 'number' && t.amount > 0)
      .slice(0, MAX_BATCH_TRANSACTIONS);

    if (txs.length === 0) {
      return {
        mode: 'chat',
        assistant_message: parsedResponse.response || 'No encontré montos válidos en lo que dijiste.',
        raw_response: aiResponse,
      };
    }

    const executed: ExecutedTransactionSummary[] = [];
    for (const tx of txs) {
      const result = await executeBotTransaction(input.userId, input.financialContext, tx, {});
      if (result.kind === 'abort') {
        return { mode: 'chat', assistant_message: result.reply, raw_response: aiResponse };
      }
      if (result.executed) executed.push(result.executed);
    }

    const fallbackSummary = executed.map(executionSummaryLine).join('\n');
    return {
      mode: 'executed',
      assistant_message: parsedResponse.response || fallbackSummary || 'Listo, registré tus movimientos.',
      executed,
      raw_response: aiResponse,
    };
  }

  if (parsedResponse.action === 'create_account' && parsedResponse.transaction) {
    const accData = parsedResponse.transaction;
    try {
      const accountName = String(accData.account || accData.name || '').trim();
      if (!accountName) {
        return {
          mode: 'chat',
          assistant_message: 'Necesito un nombre de cuenta para poder crearla.',
          raw_response: aiResponse,
        };
      }

      await accountsService.create({
        userId: input.userId,
        name: accountName,
        type: (accData.type as string) || 'cash',
        currency: (accData.currency as string) || 'ARS',
        initialBalance: 0,
        icon: accData.type === 'bank' ? '🏦' : '💵',
      });

      return {
        mode: 'chat',
        assistant_message: `Listo! Creé la cuenta "${accountName}". Ahora podés usarla para registrar gastos.`,
        raw_response: aiResponse,
      };
    } catch {
      return {
        mode: 'chat',
        assistant_message: 'No pude crear la cuenta. ¿Podés intentar de nuevo?',
        raw_response: aiResponse,
      };
    }
  }

  return {
    mode: 'chat',
    assistant_message: parsedResponse.response || aiResponse,
    raw_response: aiResponse,
  };
}
