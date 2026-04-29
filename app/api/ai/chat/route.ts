import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { GeminiMissingKeyError } from '@/lib/ai/gemini';
import { transactionsService } from '@/lib/services/transactions';
import {
  subscriptionsService,
  SubscriptionAccessError,
} from '@/lib/services/subscriptions';
import { processInternalAiChatMessage } from '@/lib/services/internal-ai-chat';
import type {
  InternalAiChatErrorResponse,
  InternalAiChatRequest,
  InternalAiChatSuccessResponse,
} from '@/types/internal-ai-chat';

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await subscriptionsService.ensureOrchestratorAccess(user.id);

    let body: InternalAiChatRequest;
    try {
      body = (await req.json()) as InternalAiChatRequest;
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }
    const { message, history } = body;

    if (!message || !message.trim()) {
      return NextResponse.json({ error: 'Message required' }, { status: 400 });
    }

    const [userProfile, accountsResult, userCategories, systemCategories, monthSummary] = await Promise.all([
      supabase.from('users').select('*').eq('id', user.id).single(),
      supabase
        .from('accounts')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .order('sort_order', { ascending: true }),
      supabase.from('categories').select('*').eq('user_id', user.id),
      supabase.from('categories').select('*').eq('is_system', true),
      transactionsService.getMonthSummary(user.id, new Date()),
    ]);

    if (
      userProfile.error ||
      accountsResult.error ||
      userCategories.error ||
      systemCategories.error
    ) {
      throw new Error(
        [
          userProfile.error?.message && `user: ${userProfile.error.message}`,
          accountsResult.error?.message && `accounts: ${accountsResult.error.message}`,
          userCategories.error?.message && `userCategories: ${userCategories.error.message}`,
          systemCategories.error?.message && `systemCategories: ${systemCategories.error.message}`,
        ]
          .filter(Boolean)
          .join(' | ') || 'Error loading context'
      );
    }

    const categories = [...(userCategories.data ?? []), ...(systemCategories.data ?? [])];

    const financialContext = {
      user: userProfile.data,
      accounts: accountsResult.data ?? [],
      categories,
      monthSummary,
    };

    const response: InternalAiChatSuccessResponse = await processInternalAiChatMessage({
      userId: user.id,
      message: message.trim(),
      history,
      financialContext,
    });
    return NextResponse.json(response);
  } catch (error) {
    if (error instanceof SubscriptionAccessError) {
      const payload: InternalAiChatErrorResponse = {
        error: error.message,
        code: 'subscription_required',
        status: error.status,
      };
      return NextResponse.json(
        payload,
        { status: 403 }
      );
    }
    if (error instanceof GeminiMissingKeyError) {
      const payload: InternalAiChatErrorResponse = {
        error:
          'Configurá tu API Key de Google Gemini en Configuración (o la del servidor no está definida).',
        code: 'missing_gemini_key',
      };
      return NextResponse.json(
        payload,
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
