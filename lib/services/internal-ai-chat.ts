import { createHash, randomUUID } from 'node:crypto';
import { withFinancialRequestContext } from '@/lib/financial-request-context';
import { withPlanQuota, AmbiguousPlanWorkError } from '@/lib/plans/service';
import type { Content } from '@google/generative-ai';
import { getGeminiForUser } from '@/lib/ai/gemini';
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
export const MAX_CHAT_HISTORY_TURNS = 24;
export const MAX_CHAT_MESSAGE_CHARS = 4000;

/**
 * El bot viejo (antes de function calling) respondía con JSON
 * `{ action, transaction(s), response }`. Esos turnos quedaron guardados en
 * bot_sessions; al reinyectarlos como historial le enseñan al modelo a volver a
 * responder JSON en vez de llamar tools. Lo detectamos para neutralizarlo.
 */
type LegacyAction = {
  /** Tool de escritura a ejecutar, o '' si la acción no escribe datos. */
  tool: '' | 'create_transaction' | 'create_transactions';
  args: Record<string, unknown>;
  /** Texto humano que traía el JSON (campo `response`). */
  response: string;
};

function parseLegacyActionJson(text: string): LegacyAction | null {
  const t = text
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/```\s*$/, '')
    .trim();
  if (!t.startsWith('{')) return null;

  let obj: any;
  try {
    obj = JSON.parse(t);
  } catch {
    return null;
  }
  if (!obj || typeof obj !== 'object' || !('action' in obj)) return null;

  const response = typeof obj.response === 'string' ? obj.response : '';
  if (obj.action === 'create_transaction' && obj.transaction && typeof obj.transaction === 'object') {
    return { tool: 'create_transaction', args: obj.transaction, response };
  }
  if (obj.action === 'create_transactions' && Array.isArray(obj.transactions)) {
    return { tool: 'create_transactions', args: { transactions: obj.transactions }, response };
  }
  return { tool: '', args: {}, response };
}

export function mapHistoryToGemini(history: InternalAiChatHistoryItem[] = []): Content[] {
  const out: Content[] = [];
  const capped = history.slice(-MAX_CHAT_HISTORY_TURNS);
  for (const h of capped) {
    const role = h?.role === 'model' ? 'model' : h?.role === 'user' ? 'user' : null;
    if (!role) continue;
    const raw = h?.text?.trim();
    if (!raw) continue;
    const clipped = raw.slice(0, MAX_CHAT_MESSAGE_CHARS);
    // Turnos del modelo en formato JSON viejo → quedarnos solo con el texto.
    const text = role === 'model' ? parseLegacyActionJson(clipped)?.response ?? clipped : clipped;
    if (text.trim()) out.push({ role, parts: [{ text }] });
  }
  return out;
}

function executionSummaryLine(executed: ExecutedTransactionSummary): string {
  const cat = executed.categoryName ? ` · ${executed.categoryName}` : '';
  return `- ${executed.summary} (${executed.currency} ${executed.amount.toLocaleString('es-AR')}, ${executed.accountName}${cat})`;
}

export async function processInternalAiChatMessage(input: {
  userId: string;
  requestKey?: string;
  /** Immutable provider event binds retries independently of evolving bot history. */
  eventFingerprint?: string;
  /** Server-only media preparation runs inside the same one-request quota. */
  prepareMessage?: () => Promise<string>;
  message: string;
  financialContext: FinancialContext;
  history?: InternalAiChatHistoryItem[];
  allowLegacyWriteFallback?: boolean;
  source?: 'web' | 'telegram' | 'wallet' | 'api' | 'mcp';
}): Promise<InternalAiChatSuccessResponse> {
  const requestKey = input.requestKey || randomUUID();
  const financialKey = `ai:${input.userId}:${createHash('sha256').update(requestKey).digest('hex')}`;
  return withPlanQuota({ userId: input.userId, feature: 'ai', requestKey,
    fingerprint: input.eventFingerprint || JSON.stringify({ message: input.message, history: input.history ?? [] }),
  }, () => withFinancialRequestContext(financialKey, async () => {
    let writeAttempted = false;
    try {
      const messageText = input.prepareMessage ? await input.prepareMessage() : input.message;
      const systemPrompt = buildBotSystemPrompt(input.financialContext);
      // Siempre 'full' (gemini-2.5-flash): el modelo lite es poco confiable para
      // function-calling y deja de llamar create_transaction (movimiento "responde
      // bien pero no impacta"). El costo extra es despreciable para este volumen.
      const tier = 'full' as const;

      const gemini = await getGeminiForUser(input.userId);

      const executed: ExecutedTransactionSummary[] = [];
      let writeCalls = 0;
      const successfulWrites = new Set<string>();
      const failedWrites: string[] = [];
      let pendingConfirm: { preview: string } | undefined;
      const allowedTools = new Set(BOT_FUNCTION_DECLARATIONS.map((d) => d.name));

      const { text, toolsUsed } = await gemini.chatWithTools(messageText.slice(0, MAX_CHAT_MESSAGE_CHARS), {
        tier,
        systemInstruction: systemPrompt,
        history: mapHistoryToGemini(input.history),
        functionDeclarations: BOT_FUNCTION_DECLARATIONS,
        allowedToolNames: allowedTools,
        maxTokens: 2048,
        onToolCall: async (name, args) => {
          if (BOT_WRITE_TOOLS.has(name)) {
            writeAttempted = true;
            writeCalls += 1;
            if (writeCalls > 2 || executed.length >= MAX_BATCH_TRANSACTIONS) {
              return { success: false, error: 'Límite de escrituras en este mensaje. Confirmá el resto después.' };
            }
          }
          const out = await executeBotTool(name, args, {
            userId: input.userId,
            financialContext: input.financialContext,
            source: input.source ?? 'web',
          });
          if (out.response?.needs_confirm) {
            const raw = out.response.preview;
            let preview = '¿Confirmás esta acción?';
            if (typeof raw === 'string' && raw.trim()) preview = raw;
            else if (raw && typeof raw === 'object') {
              const o = raw as Record<string, unknown>;
              preview = [o.type, o.amount != null ? `${o.amount} ${o.currency ?? ''}`.trim() : null, o.description]
                .filter(Boolean)
                .join(' · ') || preview;
            } else if (out.response.error) {
              preview = String(out.response.error);
            }
            pendingConfirm = { preview };
          }
          if (out.executed?.length) executed.push(...out.executed);
          if (BOT_WRITE_TOOLS.has(name)) {
            if (out.response?.success === true || out.executed?.length) successfulWrites.add(name);
            else if (!out.response?.needs_confirm) failedWrites.push(String(out.response?.error || 'No se pudo completar la operación.'));
          }
          return out.response;
        },
      });

      let assistantText = text;

      // Red de seguridad: si el modelo no llamó ninguna tool y devolvió JSON viejo
      // {action, transaction, response} (por historial heredado del bot anterior),
      // lo ejecutamos a mano para no perder el movimiento ni mostrarle JSON crudo.
      if (
        input.allowLegacyWriteFallback &&
        toolsUsed.length === 0 &&
        executed.length === 0 &&
        assistantText
      ) {
        const legacy = parseLegacyActionJson(assistantText);
        if (legacy?.tool) {
          writeAttempted = true;
          try {
            const out = await executeBotTool(legacy.tool, legacy.args, {
              userId: input.userId,
              financialContext: input.financialContext,
              source: input.source ?? 'web',
            });
            if (out.executed?.length) executed.push(...out.executed);
            if (out.response?.success === true || out.executed?.length) successfulWrites.add(legacy.tool);
            else failedWrites.push(String(out.response?.error || 'No se pudo completar la operación.'));
            toolsUsed.push(legacy.tool);
            assistantText = ''; // usamos el resumen real de `executed`
          } catch (error) {
            throw new AmbiguousPlanWorkError(error);
          }
        } else if (legacy) {
          assistantText = legacy.response; // acción sin escritura: mostrar solo el texto
        }
      }

      const didWrite = executed.length > 0 || successfulWrites.size > 0;

      const fallback = executed.length
        ? executed.map(executionSummaryLine).join('\n')
        : 'Listo.';

      const message = failedWrites.length
        ? [...(executed.length ? [fallback] : []), ...failedWrites].join('\n')
        : assistantText || fallback;

      // Historial (memoria del bot): si se ejecutó una tool de escritura, dejamos
      // una marca explícita. Sin esto, lo guardado es pura prosa de confirmación y
      // "entrena" al modelo a confirmar SIN volver a llamar la tool → el próximo
      // movimiento no se persiste. No se muestra al usuario (solo va al history).
      const writeToolsUsed = Array.from(successfulWrites);
      const historyText = writeToolsUsed.length
        ? `${message}\n⟦ejecuté ${writeToolsUsed.join(', ')} con resultado confirmado⟧`
        : message;

      return {
        mode: pendingConfirm ? 'confirm' : didWrite ? 'executed' : 'chat',
        assistant_message: pendingConfirm
          ? pendingConfirm.preview
          : message,
        executed: executed.length ? executed : undefined,
        pending_confirm: pendingConfirm,
        raw_response: historyText,
      };
    } catch (error) {
      if (writeAttempted) throw new AmbiguousPlanWorkError(error);
      throw error;
    }
  }));
}
