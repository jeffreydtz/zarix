import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  getGeminiForUser,
  getTierForRequest,
  GeminiMissingKeyError,
} from '@/lib/ai/gemini';
import { buildBotSystemPrompt } from '@/lib/ai/prompts';
import { accountsService } from '@/lib/services/accounts';
import { transactionsService } from '@/lib/services/transactions';

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { message, history } = body;

    if (!message) {
      return NextResponse.json({ error: 'Message required' }, { status: 400 });
    }

    const [userProfile, accounts, categories, monthSummary] = await Promise.all([
      supabase.from('users').select('*').eq('id', user.id).single(),
      accountsService.list(user.id),
      supabase.from('categories').select('*').or(`user_id.eq.${user.id},is_system.eq.true`),
      transactionsService.getMonthSummary(user.id, new Date()),
    ]);

    if (userProfile.error || categories.error) {
      throw new Error('Error loading context');
    }

    const systemPrompt = buildBotSystemPrompt({
      user: userProfile.data,
      accounts,
      categories: categories.data,
      monthSummary,
    });

    const tier = getTierForRequest(message, false);

    const gemini = await getGeminiForUser(user.id);
    const response = await gemini.chat(message, {
      tier,
      systemInstruction: systemPrompt,
      history: history || [],
      maxTokens: 2048,
    });

    return NextResponse.json({ response, tier });
  } catch (error) {
    if (error instanceof GeminiMissingKeyError) {
      return NextResponse.json(
        {
          error:
            'Configurá tu API Key de Google Gemini en Configuración (o la del servidor no está definida).',
          code: 'missing_gemini_key',
        },
        { status: 503 }
      );
    }
    console.error('Chat API error:', error);
    return NextResponse.json(
      { error: 'Internal error' },
      { status: 500 }
    );
  }
}
