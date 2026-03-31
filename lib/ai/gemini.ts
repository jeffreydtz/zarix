import { GoogleGenerativeAI, Content } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

const GEMINI_LITE_MODEL = process.env.GEMINI_MODEL_LITE || 'gemini-2.5-flash-lite';
const GEMINI_FULL_MODEL = process.env.GEMINI_MODEL_FULL || 'gemini-2.5-flash';

export type GeminiTier = 'lite' | 'full';

export interface GeminiChatOptions {
  tier?: GeminiTier;
  history?: Content[];
  systemInstruction?: string;
  maxTokens?: number;
}

class GeminiClient {
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
    
    const model = genAI.getGenerativeModel({
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

    const model = genAI.getGenerativeModel({
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
    if (hasMedia) return false;

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
    return !expensiveKeywords.some((keyword) =>
      lowerMessage.includes(keyword)
    );
  }

  getTierForRequest(message: string, hasMedia: boolean): GeminiTier {
    return this.shouldUseLiteTier(message, hasMedia) ? 'lite' : 'full';
  }
}

export const geminiClient = new GeminiClient();
