import { Telegraf, Context } from 'telegraf';
import { Markup } from 'telegraf';
import { message } from 'telegraf/filters';
import {
  getGeminiForUser,
  GeminiMissingKeyError,
} from '@/lib/ai/gemini';
import { transactionsService, excludedCurrenciesNote } from '@/lib/services/transactions';
import { accountsService } from '@/lib/services/accounts';
import { cotizacionesService } from '@/lib/services/cotizaciones';
import { createServiceClientSync } from '@/lib/supabase/server';
import type { FinancialContext } from '@/lib/ai/prompts';
import {
  appendBotTurn,
  clearBotSession,
  getStoredTurns,
  storedTurnsToGeminiHistory,
} from '@/lib/services/botSessions';
import { subscriptionsService } from '@/lib/services/subscriptions';
import {
  processInternalAiChatMessage,
} from '@/lib/services/internal-ai-chat';
import { escapeMd } from '@/lib/telegram/markdown';
import { buildTelegramSummaryScheduleLines } from '@/lib/notification-schedule';
import type { SubscriptionStatus } from '@/types/database';
import type { InternalAiChatHistoryItem } from '@/types/internal-ai-chat';

interface BotContext extends Context {
  userId?: string;
}

const GEMINI_SETUP_MSG =
  'No tenés configurada tu API Key de Google Gemini. Entrá a la app web → Configuración → Google Gemini y seguí el instructivo.';

function getSubscriptionBlockedMessage(status: SubscriptionStatus | null | undefined): string {
  if (status === 'PAST_DUE') {
    return 'Tu suscripción está vencida por falta de pago. Actualizá tu método de pago para volver a usar el asistente de IA.';
  }
  if (status === 'CANCELED') {
    return 'Tu suscripción está cancelada. Reactivala para volver a usar el asistente de IA.';
  }
  return 'No encontramos una suscripción activa para esta cuenta.';
}

async function getUserFromTelegramId(telegramChatId: number) {
  const supabase = createServiceClientSync();

  const { data: user, error } = await supabase
    .from('users')
    .select('*')
    .eq('telegram_chat_id', telegramChatId)
    .single();

  if (error || !user) return null;
  return user;
}

async function linkUserToTelegram(userId: string, telegramChatId: number, username?: string) {
  const supabase = createServiceClientSync();

  const { error } = await supabase
    .from('users')
    .update({
      telegram_chat_id: telegramChatId,
      telegram_username: username || null,
    })
    .eq('id', userId);

  if (error) throw error;
}

function summaryPrefsKeyboard(weekly: boolean, monthly: boolean) {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback(`📅 Semanal ${weekly ? '✅' : '⬜'}`, 'sum:weekly'),
      Markup.button.callback(`📆 Mensual ${monthly ? '✅' : '⬜'}`, 'sum:monthly'),
    ],
  ]);
}

function coerceSummaryBool(v: unknown, fallback: boolean): boolean {
  if (v === null || v === undefined) return fallback;
  return Boolean(v);
}

async function getFinancialContext(userId: string): Promise<FinancialContext> {
  const supabase = createServiceClientSync();

  // El asistente consulta gastos/saldos vía tools (get_spending, get_accounts…),
  // así que el contexto base solo necesita usuario + cuentas + categorías.
  const [userResult, accounts, categories] = await Promise.all([
    supabase.from('users').select('*').eq('id', userId).single(),
    accountsService.list(userId),
    supabase.from('categories').select('*').or(`user_id.eq."${userId.replace(/"/g, '\\"')}",is_system.eq.true`),
  ]);

  if (userResult.error) throw userResult.error;
  if (categories.error) throw categories.error;

  return {
    user: userResult.data,
    accounts,
    categories: categories.data,
  };
}

function toInternalHistoryItems(history: Array<{ role?: string; parts?: Array<{ text?: string }> }>): InternalAiChatHistoryItem[] {
  return history
    .map((h) => {
      const text = h.parts?.map((p) => p.text || '').join(' ').trim() || '';
      const role = h.role === 'model' ? 'model' : 'user';
      return text ? { role, text } : null;
    })
    .filter((item): item is InternalAiChatHistoryItem => item !== null);
}

function registerBotHandlers(bot: Telegraf) {
  bot.command('start', async (ctx) => {
  const telegramChatId = ctx.chat.id;
  const username = ctx.from?.username;

  const existingUser = await getUserFromTelegramId(telegramChatId);

  if (existingUser) {
    return ctx.reply(
      `¡Ya estás vinculado! 🎉\n\n` +
        `Escribime natural:\n` +
        `• "gasté 5000 en el super"\n` +
        `• "cuánto gasté en comida este mes?"\n` +
        `• "cómo va mi cartera?"\n\n` +
        `O usá /help para ver todo lo que puedo hacer.`
    );
  }

  return ctx.reply(
    `¡Hola! Soy el asistente de Zarix.\n\n` +
      `Para vincular tu cuenta, entrá a la app web → Configuración → Telegram y pegá este código:\n\n` +
      `\`${telegramChatId}\`\n\n` +
      `Cuando lo vincules, volvé acá y mandame /start.`
  );
});

bot.command('cuentas', async (ctx) => {
  const user = await getUserFromTelegramId(ctx.chat.id);
  if (!user) {
    return ctx.reply('No estás vinculado. Usá /start primero.');
  }

  const accounts = await accountsService.list(user.id);
  const total = await accountsService.getTotalBalance(user.id);

  let message = `💰 *TUS CUENTAS*\n\n`;

  accounts.forEach((acc) => {
    const sign = acc.is_debt ? '-' : '';
    message += `${acc.icon || '💳'} *${escapeMd(acc.name)}*\n`;
    message += `   ${sign}$${acc.balance.toLocaleString('es-AR', { minimumFractionDigits: 2 })} ${acc.currency}\n`;

    if (acc.currency !== 'ARS') {
      message += `   ≈ $${acc.balance_ars_blue?.toLocaleString('es-AR') || 0} ARS\n`;
    }
    message += `\n`;
  });

  message += `━━━━━━━━━━━━━━━━━━━━━━\n`;
  message += `📊 *TOTAL PATRIMONIO*\n`;
  message += `💵 $${total.totalARSBlue.toLocaleString('es-AR')} ARS (blue)\n`;
  message += `💵 USD ${total.totalUSD.toLocaleString('en-US', { minimumFractionDigits: 2 })}\n`;

  ctx.reply(message, { parse_mode: 'Markdown' });
});

bot.command('cotizaciones', async (ctx) => {
  try {
    const quotes = await cotizacionesService.getAllQuotes();

    let message = `💱 *COTIZACIONES* (actualizadas ahora)\n\n`;
    message += `🇦🇷 *DÓLAR*\n`;
    message += `💵 Blue: $${quotes.dolar.blue.sell.toFixed(2)}\n`;
    message += `🏛️ Oficial: $${quotes.dolar.oficial.sell.toFixed(2)}\n`;
    message += `📊 MEP: $${quotes.dolar.mep.sell.toFixed(2)}\n`;
    message += `📈 CCL: $${quotes.dolar.ccl.sell.toFixed(2)}\n\n`;

    message += `₿ *CRYPTO*\n`;
    message += `BTC: USD ${quotes.crypto.btc.priceUSD.toLocaleString('en-US', { maximumFractionDigits: 0 })} `;
    message += `(${quotes.crypto.btc.change24h >= 0 ? '+' : ''}${quotes.crypto.btc.change24h.toFixed(2)}%)\n`;
    message += `ETH: USD ${quotes.crypto.eth.priceUSD.toLocaleString('en-US', { maximumFractionDigits: 0 })} `;
    message += `(${quotes.crypto.eth.change24h >= 0 ? '+' : ''}${quotes.crypto.eth.change24h.toFixed(2)}%)\n`;
    message += `USDT: USD ${quotes.crypto.usdt.priceUSD.toFixed(4)}\n`;

    ctx.reply(message, { parse_mode: 'Markdown' });
  } catch (error) {
    ctx.reply('Error obteniendo cotizaciones. Probá de nuevo en un rato.');
  }
});

bot.command('resumen', async (ctx) => {
  const user = await getUserFromTelegramId(ctx.chat.id);
  if (!user) {
    return ctx.reply('No estás vinculado. Usá /start primero.');
  }

  const summary = await transactionsService.getMonthSummary(user.id, new Date());

  let message = `📊 *RESUMEN DEL MES*\n\n`;
  message += `💸 Gastos: $${summary.totalExpenses.toLocaleString('es-AR')}\n`;
  message += `💰 Ingresos: $${summary.totalIncome.toLocaleString('es-AR')}\n`;
  message += `📈 Balance: $${summary.balance.toLocaleString('es-AR')}\n\n`;

  if (summary.topCategories.length > 0) {
    message += `*Top categorías:*\n`;
    summary.topCategories.forEach((cat, i) => {
      message += `${i + 1}. ${cat.icon} ${escapeMd(cat.name)}: $${cat.amount.toLocaleString('es-AR')}\n`;
    });
  }

  const excludedNote = excludedCurrenciesNote(summary.excludedCurrencies);
  if (excludedNote) {
    message += `\n${excludedNote}\n`;
  }

  ctx.reply(message, { parse_mode: 'Markdown' });
});

bot.command('help', async (ctx) => {
  const message = `🤖 *ASISTENTE DE ZARIX*

*Comandos rápidos:*
/cuentas → saldos de todas tus cuentas
/cotizaciones → dólar blue, MEP, CCL, BTC, ETH
/resumen → resumen del mes (al instante)
/resumenes → avisos semanal y mensual por Telegram
/reset → borrar la memoria del chat (no borra tus movimientos)
/help → esta ayuda

*Hablame natural — registro:*
• "gasté 5000 en el super"
• "me depositaron el sueldo, 800 lucas"
• "pagué netflix con la visa, 15 dólares"
• "compré 100 dólares a 1250"
• "500 en el súper, 200 de nafta y 80 de café"
• 📷 Mandame la *foto de un ticket* o un 🎤 *audio*

*Hablame natural — consultas:*
• "cuánto gasté en comida este mes?"
• "mostrame mis últimos gastos"
• "cómo voy con el presupuesto?"
• "cómo va mi cartera?"
• "cuánto tengo en total?"
• "a cómo está el blue?"

*Corregir:* "borrá el último" · "eran 5000 no 500"

Solo me ocupo de tus finanzas en Zarix. 🚀`;

  ctx.reply(message, { parse_mode: 'Markdown' });
});

bot.command('reset', async (ctx) => {
  const user = await getUserFromTelegramId(ctx.chat.id);
  if (!user) {
    return ctx.reply('No estás vinculado. Usá /start primero.');
  }
  await clearBotSession(user.id, ctx.chat.id);
  return ctx.reply('Listo, borré el contexto de esta conversación. Tus movimientos no se tocaron.');
});

bot.command('resumenes', async (ctx) => {
  const user = await getUserFromTelegramId(ctx.chat.id);
  if (!user) {
    return ctx.reply('No estás vinculado. Usá /start y vinculá tu chat desde la app.');
  }
  const weekly = coerceSummaryBool(user.weekly_summary_enabled, true);
  const monthly = coerceSummaryBool(user.monthly_summary_enabled, true);
  const header =
    '📬 *Resúmenes automáticos por Telegram*\n\n' +
    'Tocá *Semanal* o *Mensual* para activar o desactivar. Se guarda al toque.\n\n';
  const body = buildTelegramSummaryScheduleLines(weekly, monthly, user.timezone);
  return ctx.reply(header + body, {
    parse_mode: 'Markdown',
    ...summaryPrefsKeyboard(weekly, monthly),
  });
});

bot.command('notificaciones', async (ctx) => {
  const user = await getUserFromTelegramId(ctx.chat.id);
  if (!user) {
    return ctx.reply('No estás vinculado. Usá /start y vinculá tu chat desde la app.');
  }
  const weekly = coerceSummaryBool(user.weekly_summary_enabled, true);
  const monthly = coerceSummaryBool(user.monthly_summary_enabled, true);
  const header =
    '📬 *Resúmenes automáticos por Telegram*\n\n' +
    'Tocá para activar o desactivar.\n\n';
  const body = buildTelegramSummaryScheduleLines(weekly, monthly, user.timezone);
  return ctx.reply(header + body, {
    parse_mode: 'Markdown',
    ...summaryPrefsKeyboard(weekly, monthly),
  });
});

bot.action(/^sum:(weekly|monthly)$/, async (ctx) => {
  const chatId = ctx.chat?.id;
  if (!chatId) {
    await ctx.answerCbQuery('Error de chat');
    return;
  }

  const user = await getUserFromTelegramId(chatId);
  if (!user) {
    await ctx.answerCbQuery('No vinculado');
    return;
  }

  const kind = ctx.match[1];
  const field =
    kind === 'weekly' ? 'weekly_summary_enabled' : 'monthly_summary_enabled';
  const current =
    kind === 'weekly'
      ? coerceSummaryBool(user.weekly_summary_enabled, true)
      : coerceSummaryBool(user.monthly_summary_enabled, true);
  const nextVal = !current;

  const supabase = createServiceClientSync();
  const { error } = await supabase
    .from('users')
    .update({ [field]: nextVal })
    .eq('id', user.id);

  if (error) {
    await ctx.answerCbQuery('No se pudo guardar');
    return;
  }

  await ctx.answerCbQuery(nextVal ? 'Activado' : 'Desactivado');

  const fresh = await getUserFromTelegramId(chatId);
  if (!fresh) return;

  const weekly = coerceSummaryBool(fresh.weekly_summary_enabled, true);
  const monthly = coerceSummaryBool(fresh.monthly_summary_enabled, true);
  const header =
    '📬 *Resúmenes automáticos por Telegram*\n\n' +
    'Tocá *Semanal* o *Mensual* para activar o desactivar. Se guarda al toque.\n\n';
  const body = buildTelegramSummaryScheduleLines(weekly, monthly, fresh.timezone);
  const text = header + body;

  try {
    if (ctx.callbackQuery?.message && 'message_id' in ctx.callbackQuery.message) {
      await ctx.telegram.editMessageText(
        chatId,
        ctx.callbackQuery.message.message_id,
        undefined,
        text,
        {
          parse_mode: 'Markdown',
          reply_markup: summaryPrefsKeyboard(weekly, monthly).reply_markup,
        }
      );
    }
  } catch {
    await ctx.reply(text, {
      parse_mode: 'Markdown',
      ...summaryPrefsKeyboard(weekly, monthly),
    });
  }
});

bot.on(message('photo'), async (ctx) => {
  const user = await getUserFromTelegramId(ctx.chat.id);
  if (!user) {
    return ctx.reply('No estás vinculado todavía. Usá /start para vincular tu cuenta.');
  }
  if (!subscriptionsService.hasOrchestratorAccess(user.status)) {
    return ctx.reply(getSubscriptionBlockedMessage(user.status));
  }

  try {
    let gPhoto;
    try {
      gPhoto = await getGeminiForUser(user.id);
    } catch (e) {
      if (e instanceof GeminiMissingKeyError) {
        return ctx.reply(GEMINI_SETUP_MSG);
      }
      throw e;
    }

    await ctx.reply('📷 Analizando la imagen...');

    const photo = ctx.message.photo[ctx.message.photo.length - 1];
    const fileLink = await ctx.telegram.getFileLink(photo.file_id);

    const response = await fetch(fileLink.href);
    if (!response.ok) {
      throw new Error(`Error descargando la imagen de Telegram: ${response.status}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    if (arrayBuffer.byteLength > 10 * 1024 * 1024) {
      return ctx.reply('La imagen es muy pesada (máximo 10 MB). ¿Podés mandar una más liviana?');
    }
    const base64 = Buffer.from(arrayBuffer).toString('base64');
    
    const financialContext = await getFinancialContext(user.id);
    
    const prompt = `Analizá esta imagen de un ticket, factura o comprobante de compra.

Extraé la siguiente información:
- Monto total (el más grande/final)
- Comercio/tienda
- Fecha (si aparece)
- Categoría sugerida (basándote en el comercio: supermercado=Comida, farmacia=Salud, etc.)
- Moneda (ARS por defecto, USD si dice dólares o $US)

CUENTAS DEL USUARIO:
${financialContext.accounts.map(a => `- ${a.icon} ${a.name} (${a.currency})`).join('\n')}

CATEGORÍAS DISPONIBLES:
${financialContext.categories.filter(c => c.type === 'expense').map(c => `- ${c.icon} ${c.name}`).join('\n')}

Respondé en JSON:
{
  "found": true/false,
  "amount": número,
  "currency": "ARS" o "USD",
  "merchant": "nombre del comercio",
  "date": "YYYY-MM-DD" o null,
  "category": "nombre de categoría sugerida",
  "suggestedAccount": "nombre de cuenta sugerida",
  "confidence": "high" | "medium" | "low",
  "description": "descripción corta para la transacción"
}

Si no es un ticket/factura o no podés extraer información:
{
  "found": false,
  "message": "razón"
}`;

    const result = await gPhoto.chatWithImage(
      prompt,
      base64,
      'image/jpeg',
      { maxTokens: 1024 }
    );

    let parsed;
    try {
      const cleaned = result.trim().replace(/^```json\s*/, '').replace(/```\s*$/, '');
      parsed = JSON.parse(cleaned);
    } catch (e) {
      return ctx.reply('No pude analizar la imagen. ¿Es un ticket o comprobante de compra?');
    }

    if (!parsed.found) {
      return ctx.reply(parsed.message || 'No encontré información de gasto en la imagen. ¿Es un ticket de compra?');
    }

    const amount = Number(parsed.amount);
    if (!amount || amount <= 0) {
      return ctx.reply('Detecté un ticket pero no pude leer el monto. ¿Me lo escribís?');
    }

    const currency = String(parsed.currency || 'ARS').toUpperCase();
    const merchant = parsed.merchant || 'comercio';
    const description = parsed.description || merchant;
    const category = parsed.category || null;
    const suggestedAccount = parsed.suggestedAccount || null;
    const confidenceEmoji =
      parsed.confidence === 'high' ? '✅' : parsed.confidence === 'medium' ? '⚠️' : '❓';

    const confirmMessage =
      `${confidenceEmoji} *Encontré este gasto:*\n\n` +
      `💰 Monto: $${amount.toLocaleString('es-AR')} ${currency}\n` +
      `🏪 Comercio: ${escapeMd(merchant)}\n` +
      `📅 Fecha: ${escapeMd(parsed.date || 'hoy')}\n` +
      `🏷️ Categoría: ${escapeMd(category || 'a definir')}\n` +
      (suggestedAccount ? `💳 Cuenta: ${escapeMd(suggestedAccount)}\n` : '') +
      `\n¿Lo registro? Respondé *sí* para confirmar, o corregime cualquier dato.`;

    // Guardamos la propuesta en la memoria de la conversación. Si el usuario
    // responde "sí" (o corrige algo), el modelo la lee del historial y la
    // registra con create_transaction. Sin estado en `global` (no sobrevive a
    // serverless: cada request puede ser una instancia distinta).
    const memoryTurn =
      `Analicé la foto de un ticket y detecté un gasto para confirmar: ` +
      `monto ${amount} ${currency}` +
      (suggestedAccount ? `, cuenta sugerida "${suggestedAccount}"` : '') +
      (category ? `, categoría "${category}"` : '') +
      `, descripción "${description}"` +
      (parsed.date ? `, fecha ${parsed.date}` : '') +
      `. Le pregunté al usuario si lo registro; si confirma, registrá este gasto con estos datos.`;
    await appendBotTurn(user.id, ctx.chat.id, '[Foto de un ticket de compra]', memoryTurn).catch(
      (err) => console.error('[telegram] appendBotTurn failed', err)
    );

    return ctx.reply(confirmMessage, { parse_mode: 'Markdown' });

  } catch (error) {
    console.error('Photo processing error:', error);
    if (error instanceof GeminiMissingKeyError) {
      return ctx.reply(GEMINI_SETUP_MSG);
    }
    return ctx.reply('Hubo un error procesando la imagen. ¿Podés intentar con otra foto o escribirme el gasto?');
  }
});

bot.on(message('voice'), async (ctx) => {
  const user = await getUserFromTelegramId(ctx.chat.id);
  if (!user) {
    return ctx.reply('No estás vinculado todavía. Usá /start para vincular tu cuenta.');
  }
  if (!subscriptionsService.hasOrchestratorAccess(user.status)) {
    return ctx.reply(getSubscriptionBlockedMessage(user.status));
  }

  try {
    let gVoice;
    try {
      gVoice = await getGeminiForUser(user.id);
    } catch (e) {
      if (e instanceof GeminiMissingKeyError) {
        return ctx.reply(GEMINI_SETUP_MSG);
      }
      throw e;
    }

    await ctx.reply('🎤 Transcribiendo audio...');

    const voice = ctx.message.voice;
    const fileLink = await ctx.telegram.getFileLink(voice.file_id);

    // Download OGG audio
    const audioResponse = await fetch(fileLink.href);
    if (!audioResponse.ok) {
      throw new Error(`Error descargando el audio de Telegram: ${audioResponse.status}`);
    }
    const audioBuffer = await audioResponse.arrayBuffer();
    if (audioBuffer.byteLength > 20 * 1024 * 1024) {
      return ctx.reply('El audio es muy pesado (máximo 20 MB). ¿Podés mandar uno más corto?');
    }
    const audioBase64 = Buffer.from(audioBuffer).toString('base64');

    const transcriptResult = await gVoice.chatWithImage(
      `Transcribí exactamente este mensaje de voz en español. 
      El usuario está hablando sobre sus finanzas personales.
      Solo devolvé el texto transcripto, sin explicaciones ni formato JSON.
      Si no podés transcribir, devolvé "ERROR".`,
      audioBase64,
      'audio/ogg',
      { maxTokens: 512 }
    );

    // Clean JSON wrapper if Gemini returns it
    let transcribed = transcriptResult.trim();
    try {
      const parsed = JSON.parse(transcribed);
      transcribed = parsed.text || parsed.transcript || parsed.response || transcribed;
    } catch {
      // not JSON, use as-is
    }

    if (!transcribed || transcribed === 'ERROR' || transcribed.length < 3) {
      return ctx.reply('No pude entender el audio. ¿Podés escribirme el gasto?');
    }

    await ctx.reply(`🎤 Escuché: _"${transcribed}"_`, { parse_mode: 'Markdown' });

    const financialContext = await getFinancialContext(user.id);
    const storedTurns = await getStoredTurns(user.id, ctx.chat.id);
    const history = toInternalHistoryItems(storedTurnsToGeminiHistory(storedTurns));
    let rawResponse = '';
    try {
      const result = await processInternalAiChatMessage({
        userId: user.id,
        message: transcribed,
        history,
        financialContext,
      });
      rawResponse = result.raw_response || '';
      return ctx.reply(result.assistant_message);
    } finally {
      if (rawResponse) {
        await appendBotTurn(user.id, ctx.chat.id, transcribed, rawResponse).catch((err) =>
          console.error('[telegram] appendBotTurn failed', err)
        );
      }
    }
  } catch (error) {
    console.error('Voice processing error:', error);
    if (error instanceof GeminiMissingKeyError) {
      return ctx.reply(GEMINI_SETUP_MSG);
    }
    return ctx.reply('No pude procesar el audio. ¿Podés escribirme el gasto?');
  }
});

bot.on(message('text'), async (ctx) => {
  const user = await getUserFromTelegramId(ctx.chat.id);
  if (!user) {
    return ctx.reply(
      'No estás vinculado todavía. Usá /start para vincular tu cuenta.'
    );
  }
  if (!subscriptionsService.hasOrchestratorAccess(user.status)) {
    return ctx.reply(getSubscriptionBlockedMessage(user.status));
  }

  const userMessage = ctx.message.text;

  // El alcance (solo finanzas) y la confirmación de tickets las maneja el modelo
  // con su system prompt + memoria de conversación. No hay blocklist de keywords
  // (daba falsos positivos) ni estado de confirmación en `global`.

  try {
    const financialContext = await getFinancialContext(user.id);

    try {
      await getGeminiForUser(user.id);
    } catch (e) {
      if (e instanceof GeminiMissingKeyError) {
        return ctx.reply(GEMINI_SETUP_MSG);
      }
      throw e;
    }

    const storedTurns = await getStoredTurns(user.id, ctx.chat.id);
    const history = toInternalHistoryItems(storedTurnsToGeminiHistory(storedTurns));
    let rawResponse = '';
    try {
      const result = await processInternalAiChatMessage({
        userId: user.id,
        message: userMessage,
        history,
        financialContext,
      });
      rawResponse = result.raw_response || '';
      return ctx.reply(result.assistant_message);
    } finally {
      if (rawResponse) {
        await appendBotTurn(user.id, ctx.chat.id, userMessage, rawResponse).catch((err) =>
          console.error('[telegram] appendBotTurn failed', err)
        );
      }
    }
  } catch (error: any) {
    console.error('Bot error:', error);

    if (error instanceof GeminiMissingKeyError) {
      return ctx.reply(GEMINI_SETUP_MSG);
    }

    if (error.message?.includes('404') || error.message?.includes('not found')) {
      return ctx.reply('El servicio de IA no está disponible temporalmente. Probá de nuevo en unos minutos.');
    }
    
    if (error.message?.includes('account')) {
      return ctx.reply('No encontré esa cuenta. Usá /cuentas para ver cuáles tenés disponibles.');
    }
    
    return ctx.reply('Hubo un error procesando tu mensaje. ¿Podés reformularlo? Por ejemplo: "gasté 500 en almacén"');
  }
});

  // Red de captura global: cualquier error no manejado en un handler cae acá.
  bot.catch(async (err, ctx) => {
    console.error('Telegram handler error:', err);
    try {
      await ctx.reply('Uy, algo falló de mi lado. Probá de nuevo en un toque.');
    } catch {
      // ignorar: no podemos responder
    }
  });
}

const sharedToken = process.env.TELEGRAM_BOT_TOKEN;
const sharedBot = sharedToken
  ? (() => {
      const t = new Telegraf(sharedToken);
      registerBotHandlers(t);
      return t;
    })()
  : null;

const customBots = new Map<string, Telegraf>();

function getBotForTelegramToken(token: string): Telegraf {
  if (!customBots.has(token)) {
    const t = new Telegraf(token);
    registerBotHandlers(t);
    customBots.set(token, t);
  }
  return customBots.get(token)!;
}

export async function handleTelegramUpdate(update: any) {
  if (!sharedBot) {
    console.error('TELEGRAM_BOT_TOKEN no configurado');
    return;
  }
  await sharedBot.handleUpdate(update);
}

export async function handleCustomTelegramUpdate(update: any, botToken: string) {
  const b = getBotForTelegramToken(botToken);
  await b.handleUpdate(update);
}
