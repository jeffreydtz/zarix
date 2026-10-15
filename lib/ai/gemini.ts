import { AmbiguousFinancialMutationError } from '@/lib/financial-mutation-error';
import { GoogleGenerativeAI, Content, type FunctionDeclaration } from '@google/generative-ai';
import { createServiceClientSync } from '@/lib/supabase/server';

const GEMINI_LITE_MODEL = process.env.GEMINI_MODEL_LITE || 'gemini-2.5-flash-lite';
const GEMINI_FULL_MODEL = process.env.GEMINI_MODEL_FULL || 'gemini-2.5-flash';

export type GeminiTier = 'lite' | 'full';

// Gemini exige que el historial empiece con un turno `user` (y alterne).
// Un historial que arranca con `model` (p. ej. un saludo del asistente como
// primer mensaje) tira: "First content should be with role 'user', got model".
// Recortamos los turnos `model` iniciales; el mensaje nuevo pasa a ser el
// primer `user` si no quedó ninguno.
function trimHistoryToUserStart(history: Content[]): Content[] {
  const firstUser = history.findIndex((c) => c.role === 'user');
  return firstUser === -1 ? [] : history.slice(firstUser);
}

export interface GeminiChatOptions {
  tier?: GeminiTier;
  history?: Content[];
  systemInstruction?: string;
  maxTokens?: number;
}

export class GeminiMissingKeyError extends Error {
  constructor() {
    super('missing_gemini_api_key');
    this.name = 'GeminiMissingKeyError';
  }
}

export function getTierForRequest(message: string, hasMedia: boolean): GeminiTier {
  if (hasMedia) return 'full';

  const expensiveKeywords = [
    'analis',
    'análisis',
    'insight',
    'proyecc',
    'compara',
    'sugiere',
    'sugerencia',
    'anomal',
    'tendencia',
    'resumen mensual',
    'resumen semanal',
  ];

  const lowerMessage = message.toLowerCase();
  const shouldUseLite = !expensiveKeywords.some((keyword) =>
    lowerMessage.includes(keyword)
  );
  return shouldUseLite ? 'lite' : 'full';
}

export class GeminiClient {
  private readonly genAI: GoogleGenerativeAI;

  constructor(apiKey: string) {
    if (!apiKey?.trim()) {
      throw new Error('GeminiClient: empty API key');
    }
    this.genAI = new GoogleGenerativeAI(apiKey.trim());
  }

  private async withDeadline<T>(run: (signal: AbortSignal) => Promise<T>): Promise<T> {
    const configured = Number(process.env.GEMINI_TIMEOUT_MS);
    const timeout = Number.isFinite(configured) && configured > 0 ? Math.min(configured, 45_000) : 20_000;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      return await run(controller.signal);
    } finally {
      clearTimeout(timer);
    }
  }

  async chat(
    message: string,
    options: GeminiChatOptions = {}
  ): Promise<string> {
    const {
      tier = 'lite',
      history = [],
      systemInstruction,
      maxTokens = 2048,
    } = options;

    const modelName = tier === 'lite' ? GEMINI_LITE_MODEL : GEMINI_FULL_MODEL;

    const model = this.genAI.getGenerativeModel({
      model: modelName,
      systemInstruction: systemInstruction,
      generationConfig: {
        responseMimeType: 'application/json',
      },
    });

    const chat = model.startChat({
      history: trimHistoryToUserStart(history),
      generationConfig: {
        maxOutputTokens: maxTokens,
        temperature: 0.7,
      },
    });

    const result = await this.withDeadline(signal => chat.sendMessage(message, { signal }));
    return result.response.text();
  }

  /**
   * Chat con function calling. El modelo decide qué tools llamar; ejecutamos cada
   * una con `onToolCall` y le devolvemos el resultado, en loop, hasta que produzca
   * texto final (o se agoten las rondas). No usa responseMimeType JSON: el output
   * final es prosa en rioplatense.
   */
  async chatWithTools(
    message: string,
    options: {
      tier?: GeminiTier;
      history?: Content[];
      systemInstruction?: string;
      functionDeclarations: FunctionDeclaration[];
      allowedToolNames?: ReadonlySet<string>;
      onToolCall: (name: string, args: Record<string, unknown>) => Promise<Record<string, unknown>>;
      maxTokens?: number;
      maxRounds?: number;
    }
  ): Promise<{ text: string; toolsUsed: string[] }> {
    const {
      tier = 'lite',
      history = [],
      systemInstruction,
      functionDeclarations,
      allowedToolNames,
      onToolCall,
      maxTokens = 2048,
      maxRounds = 8,
    } = options;

    const modelName = tier === 'lite' ? GEMINI_LITE_MODEL : GEMINI_FULL_MODEL;
    const model = this.genAI.getGenerativeModel({
      model: modelName,
      systemInstruction,
      tools: [{ functionDeclarations }],
    });

    const chat = model.startChat({
      history: trimHistoryToUserStart(history),
      generationConfig: { maxOutputTokens: maxTokens, temperature: 0.3 },
    });

    return this.withDeadline(async (signal) => {
      const toolsUsed: string[] = [];
      let result = await chat.sendMessage(message, { signal });

      for (let round = 0; round < maxRounds; round++) {
        signal.throwIfAborted();
        const calls = result.response.functionCalls();
        if (!calls || calls.length === 0) break;

        const responses = [];
        for (const call of calls) {
          signal.throwIfAborted();
          toolsUsed.push(call.name);
          let toolResult: Record<string, unknown>;
          if (allowedToolNames && !allowedToolNames.has(call.name)) {
            toolResult = { error: 'Herramienta no permitida.' };
          } else {
            try {
              toolResult = await onToolCall(call.name, (call.args as Record<string, unknown>) ?? {});
            } catch (e) {
              if (e instanceof AmbiguousFinancialMutationError) throw e;
              console.error('[gemini] tool error', call.name, e);
              toolResult = { error: 'No pude completar esa acción.' };
            }
          }
          responses.push({ functionResponse: { name: call.name, response: toolResult ?? {} } });
        }

        signal.throwIfAborted();
        result = await chat.sendMessage(responses, { signal });
      }

      const leftover = result.response.functionCalls();
      if (leftover && leftover.length > 0) {
        return {
          text: 'No pude terminar de procesar el pedido. ¿Lo reintentamos en partes más chicas?',
          toolsUsed,
        };
      }

      let text = '';
      try {
        text = result.response.text();
      } catch (err) {
        console.error('[gemini] failed to extract response text', err);
        text = '';
      }
      return { text: text.trim(), toolsUsed };
    });
  }

  async chatWithImage(
    message: string,
    imageBase64: string,
    mimeType: string,
    options: Omit<GeminiChatOptions, 'tier'> & { json?: boolean } = {}
  ): Promise<string> {
    const {
      history = [],
      systemInstruction,
      maxTokens = 2048,
      json = true,
    } = options;

    const model = this.genAI.getGenerativeModel({
      model: GEMINI_FULL_MODEL,
      systemInstruction: systemInstruction,
      generationConfig: json
        ? {
            responseMimeType: 'application/json',
          }
        : undefined,
    });

    const chat = model.startChat({
      history: trimHistoryToUserStart(history),
      generationConfig: {
        maxOutputTokens: maxTokens,
        temperature: 0.7,
      },
    });

    const result = await this.withDeadline(signal => chat.sendMessage([
      { text: message },
      {
        inlineData: {
          mimeType,
          data: imageBase64,
        },
      },
    ], { signal }));

    return result.response.text();
  }

  shouldUseLiteTier(message: string, hasMedia: boolean): boolean {
    return getTierForRequest(message, hasMedia) === 'lite';
  }

  getTierForRequest(message: string, hasMedia: boolean): GeminiTier {
    return getTierForRequest(message, hasMedia);
  }
}

export function createGeminiClient(apiKey: string): GeminiClient {
  return new GeminiClient(apiKey);
}

/**
 * Resolves API key: user row first, then server env (hosting default).
 */
export async function getGeminiForUser(userId: string): Promise<GeminiClient> {
  const supabase = createServiceClientSync();
  const { data } = await supabase
    .from('users')
    .select('gemini_api_key')
    .eq('id', userId)
    .single();

  const key =
    (data?.gemini_api_key && String(data.gemini_api_key).trim()) ||
    (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim()) ||
    '';

  if (!key) {
    throw new GeminiMissingKeyError();
  }

  return createGeminiClient(key);
}

