import { randomUUID } from 'node:crypto';
import { ApiError } from '@/lib/api-handler';
import { AmbiguousPlanWorkError } from '@/lib/plans/service';
import { NextRequest, NextResponse } from 'next/server';
import { clientIpFromRequest, rateLimitAllow } from '@/lib/rate-limit';
import {
  MAX_CHAT_HISTORY_TURNS,
  MAX_CHAT_MESSAGE_CHARS,
} from '@/lib/services/internal-ai-chat';
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
import { USER_CLIENT_SAFE_COLUMNS } from '@/lib/constants/user-columns';
import type { User } from '@/types/database';

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const queuedOwner = req.headers.get('x-queue-owner');
    if (queuedOwner && queuedOwner !== user.id) return NextResponse.json({ error: 'La solicitud pertenece a otra sesión.' }, { status: 403 });
    const requestKey = req.headers.get('idempotency-key') || randomUUID();

    if (!rateLimitAllow(`ai-chat:${user.id}:${clientIpFromRequest(req)}`, 40, 60 * 60 * 1000)) {
      return NextResponse.json({ error: 'Demasiados mensajes. Esperá un rato.' }, { status: 429 });
    }

    await subscriptionsService.ensureOrchestratorAccess(user.id);

    let body: InternalAiChatRequest;
    try {
      body = (await req.json()) as InternalAiChatRequest;
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }
    const { message } = body;

    if (!message || !message.trim()) {
      return NextResponse.json({ error: 'Message required' }, { status: 400 });
    }
    if (message.length > MAX_CHAT_MESSAGE_CHARS) {
      return NextResponse.json({ error: 'Mensaje demasiado largo' }, { status: 400 });
    }
    const rawHistory = Array.isArray(body.history) ? body.history.slice(-MAX_CHAT_HISTORY_TURNS) : [];
    const safeHistory = rawHistory
      .filter(
        (h): h is { role: 'user' | 'model'; text: string } =>
          !!h &&
          (h.role === 'user' || h.role === 'model') &&
          typeof h.text === 'string'
      )
      .map((h) => ({ role: h.role, text: h.text.slice(0, MAX_CHAT_MESSAGE_CHARS) }));

    const [userProfile, accountsResult, userCategories, systemCategories, monthSummary] = await Promise.all([
      supabase.from('users').select(USER_CLIENT_SAFE_COLUMNS).eq('id', user.id).single(),
      supabase
        .from('accounts')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .order('sort_order', { ascending: true }),
      supabase.from('categories').select('*').eq('user_id', user.id),
      supabase.from('categories').select('*').eq('is_system', true),
      // El resumen es contexto opcional: si falla (p.ej. cotizaciones caídas) no
      // debe tumbar todo el chat.
      transactionsService.getMonthSummary(user.id, new Date()).catch(() => undefined),
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
      user: userProfile.data as unknown as User,
      accounts: accountsResult.data ?? [],
      categories,
      monthSummary,
    };

    const response: InternalAiChatSuccessResponse = await processInternalAiChatMessage({
      userId: user.id,
      requestKey,
      message: message.trim(),
      history: safeHistory,
      financialContext,
    });
    return NextResponse.json(response, { headers: { 'Idempotency-Key': requestKey } });
  } catch (error) {
    if (error instanceof ApiError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof AmbiguousPlanWorkError) return NextResponse.json({ error: error.message }, { status: 409 });
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
