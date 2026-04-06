import { GoogleGenerativeAI, Content } from '@google/generative-ai';
import { createServiceClientSync } from '@/lib/supabase/server';

const GEMINI_LITE_MODEL = process.env.GEMINI_MODEL_LITE || 'gemini-2.5-flash-lite';
const GEMINI_FULL_MODEL = process.env.GEMINI_MODEL_FULL || 'gemini-2.5-flash';

export type GeminiTier = 'lite' | 'full';

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
      history,
      generationConfig: {
        maxOutputTokens: maxTokens,
        temperature: 0.7,
      },
    });

    const result = await chat.sendMessage(message);
    return result.response.text();
  }

  async chatWithImage(
    message: string,
    imageBase64: string,
    mimeType: string,
    options: Omit<GeminiChatOptions, 'tier'> = {}
  ): Promise<string> {
    const {
      history = [],
      systemInstruction,
      maxTokens = 2048,
    } = options;

    const model = this.genAI.getGenerativeModel({
      model: GEMINI_FULL_MODEL,
      systemInstruction: systemInstruction,
      generationConfig: {
        responseMimeType: 'application/json',
      },
    });

    const chat = model.startChat({
      history,
      generationConfig: {
        maxOutputTokens: maxTokens,
        temperature: 0.7,
      },
    });

    const result = await chat.sendMessage([
      { text: message },
      {
        inlineData: {
          mimeType,
          data: imageBase64,
        },
      },
    ]);

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

