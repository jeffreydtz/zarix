import { Telegraf, Context } from 'telegraf';
import { Markup } from 'telegraf';
import { message } from 'telegraf/filters';
import {
  getGeminiForUser,
  getTierForRequest,
  GeminiMissingKeyError,
} from '@/lib/ai/gemini';
import { buildBotSystemPrompt } from '@/lib/ai/prompts';
import { transactionsService } from '@/lib/services/transactions';
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
import { executeBotTransaction } from '@/lib/telegram/executeBotTransaction';
import { parseBotTransactionDateInput } from '@/lib/transaction-date';
import { buildTelegramSummaryScheduleLines } from '@/lib/notification-schedule';

interface BotContext extends Context {
  userId?: string;
}

const MAX_BATCH_TRANSACTIONS = 12;

/** Mensajes largos o con varios montos: modelo full + más tokens. */
function preferFullTierForMessage(message: string): boolean {
  const newlines = (message.match(/\n/g) || []).length;
  if (message.length > 400) return true;
  if (newlines >= 2) return true;
  if (/^\s*[-•*]\s/m.test(message) || /;\s/.test(message)) return true;
  const nums = message.match(/\d[\d.,]*/g);
  if (nums && nums.length >= 4) return true;
  return false;
}

function parseModelJson(aiResponse: string): unknown {
  const cleaned = aiResponse.trim().replace(/^```json\s*/, '').replace(/```\s*$/, '');
  return JSON.parse(cleaned);
}

const GEMINI_SETUP_MSG =
  'No tenés configurada tu API Key de Google Gemini. Entrá a la app web → Configuración → Google Gemini y seguí el instructivo.';

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

  const [userResult, accounts, categories, monthSummary] = await Promise.all([
    supabase.from('users').select('*').eq('id', userId).single(),
    accountsService.list(userId),
    supabase.from('categories').select('*').or(`user_id.eq.${userId},is_system.eq.true`),
    transactionsService.getMonthSummary(userId, new Date()),
  ]);

  if (userResult.error) throw userResult.error;
  if (categories.error) throw categories.error;

  return {
    user: userResult.data,
    accounts,
    categories: categories.data,
    monthSummary,
  };
}

function registerBotHandlers(bot: Telegraf) {
  bot.command('start', async (ctx) => {
  const telegramChatId = ctx.chat.id;
  const username = ctx.from?.username;

  const existingUser = await getUserFromTelegramId(telegramChatId);

  if (existingUser) {
    return ctx.reply(
      `¡Ya estás vinculado! 🎉\n\n` +
        `/cuentas → saldos\n` +
        `/resumenes → avisos semanal y mensual por Telegram\n` +
        `O escribime: "gasté 5000 en el super"`
    );
  }

  return ctx.reply(
    `¡Hola! Para vincular tu cuenta, andá a la app web y pegá este código:\n\n` +
      `\`${telegramChatId}\`\n\n` +
      `O decime tu user ID de Supabase y te vinculo manual.`
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
    message += `${acc.icon || '💳'} *${acc.name}*\n`;
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
      message += `${i + 1}. ${cat.icon} ${cat.name}: $${cat.amount.toLocaleString('es-AR')}\n`;
    });
  }

  ctx.reply(message, { parse_mode: 'Markdown' });
});

bot.command('help', async (ctx) => {
  const message = `🤖 *COMANDOS DISPONIBLES*

/cuentas → ver saldos de todas tus cuentas
/cotizaciones → dólar blue, MEP, BTC, ETH
/resumen → resumen del mes actual (al instante)
/resumenes → activar/desactivar *avisos* semanal y mensual por Telegram
/reset → borrar memoria del chat con el bot (no borra tus movimientos)
/help → esta ayuda

*LENGUAJE NATURAL:*
También podés hablarme natural:

• "gasté 5000 en el super"
• "me depositaron el sueldo, 800 lucas"
• "pagué netflix con la visa, 15 dólares"
• "compré 100 dólares a 1250"
• "cuánto gasté en comida este mes?"
• "a cómo está el blue?"
• Varios gastos en un mensaje: "500 en el súper, 200 de nafta y 80 de café"

¡Probá y te entiendo! 🚀`;

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

  try {
    await ctx.reply('📷 Analizando la imagen...');
    
    const photo = ctx.message.photo[ctx.message.photo.length - 1];
    const fileLink = await ctx.telegram.getFileLink(photo.file_id);
    
    const response = await fetch(fileLink.href);
    const arrayBuffer = await response.arrayBuffer();
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

    let gPhoto;
    try {
      gPhoto = await getGeminiForUser(user.id);
    } catch (e) {
      if (e instanceof GeminiMissingKeyError) {
        return ctx.reply(GEMINI_SETUP_MSG);
      }
      throw e;
    }

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

    let account = financialContext.accounts.find(
      a => a.name.toLowerCase() === parsed.suggestedAccount?.toLowerCase()
    );
    if (!account) {
      account = financialContext.accounts.find(
        a => a.currency === parsed.currency && a.type !== 'credit_card'
      );
    }

    if (!account) {
      return ctx.reply(`Encontré un gasto de $${parsed.amount} pero no tenés cuentas en ${parsed.currency}. ¿Querés crear una?`);
    }

    let category = financialContext.categories.find(
      c => c.name.toLowerCase() === parsed.category?.toLowerCase()
    );

    const confidenceEmoji = parsed.confidence === 'high' ? '✅' : parsed.confidence === 'medium' ? '⚠️' : '❓';

    const confirmMessage = `${confidenceEmoji} *Encontré este gasto:*

💰 Monto: $${parsed.amount.toLocaleString('es-AR')} ${parsed.currency}
🏪 Comercio: ${parsed.merchant || 'No detectado'}
📅 Fecha: ${parsed.date || 'Hoy'}
🏷️ Categoría: ${category?.icon || '❓'} ${parsed.category || 'Sin categoría'}
💳 Cuenta: ${account.icon} ${account.name}

¿Lo registro? Respondé *sí* para confirmar o corregime los datos.`;

    const pendingKey = `pending_photo_${ctx.chat.id}`;
    const pendingData = {
      amount: parsed.amount,
      currency: parsed.currency,
      accountId: account.id,
      accountName: account.name,
      categoryId: category?.id,
      categoryName: parsed.category,
      description: parsed.description || parsed.merchant,
      date: parsed.date,
      userId: user.id
    };
    
    (global as any)[pendingKey] = pendingData;
    
    setTimeout(() => {
      delete (global as any)[pendingKey];
    }, 5 * 60 * 1000);

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

  try {
    await ctx.reply('🎤 Transcribiendo audio...');

    const voice = ctx.message.voice;
    const fileLink = await ctx.telegram.getFileLink(voice.file_id);

    // Download OGG audio
    const audioResponse = await fetch(fileLink.href);
    const audioBuffer = await audioResponse.arrayBuffer();
    const audioBase64 = Buffer.from(audioBuffer).toString('base64');

    let gVoice;
    try {
      gVoice = await getGeminiForUser(user.id);
    } catch (e) {
      if (e instanceof GeminiMissingKeyError) {
        return ctx.reply(GEMINI_SETUP_MSG);
      }
      throw e;
    }

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
    const systemPrompt = buildBotSystemPrompt(financialContext);
    const storedTurns = await getStoredTurns(user.id, ctx.chat.id);
    const history = storedTurnsToGeminiHistory(storedTurns);
    const tier = preferFullTierForMessage(transcribed)
      ? 'full'
      : getTierForRequest(transcribed, false);

    let aiResponse = '';
    try {
      aiResponse = await gVoice.chat(transcribed, {
        tier,
        systemInstruction: systemPrompt,
        history,
        maxTokens: 2048,
      });

      let parsedResponse: {
        action: string;
        transaction?: Record<string, unknown>;
        transactions?: Record<string, unknown>[];
        response: string;
      };
      try {
        parsedResponse = parseModelJson(aiResponse) as typeof parsedResponse;
      } catch {
        return ctx.reply(aiResponse);
      }

      if (parsedResponse.action === 'create_transaction' && parsedResponse.transaction) {
        const r = await executeBotTransaction(user.id, financialContext, parsedResponse.transaction, {
          summaryResponse: parsedResponse.response,
        });
        if (r.kind === 'abort') return ctx.reply(r.reply);
        return ctx.reply(`✅ ${r.reply}`);
      }

      if (
        parsedResponse.action === 'create_transactions' &&
        Array.isArray(parsedResponse.transactions)
      ) {
        const txs = parsedResponse.transactions
          .filter((t) => t && typeof t.amount === 'number' && (t.amount as number) > 0)
          .slice(0, MAX_BATCH_TRANSACTIONS);
        if (txs.length === 0) {
          return ctx.reply(
            parsedResponse.response || 'No encontré montos válidos en lo que dijiste.'
          );
        }
        const lines: string[] = [];
        for (const tx of txs) {
          const r = await executeBotTransaction(user.id, financialContext, tx, {});
          if (r.kind === 'abort') return ctx.reply(r.reply);
          lines.push(r.reply);
        }
        return ctx.reply(`✅ ${parsedResponse.response}\n\n${lines.join('\n')}`);
      }

      if (parsedResponse.action === 'create_account' && parsedResponse.transaction) {
        const accData = parsedResponse.transaction;
        try {
          await accountsService.create({
            userId: user.id,
            name: (accData.account || accData.name) as string,
            type: (accData.type as string) || 'cash',
            currency: (accData.currency as string) || 'ARS',
            initialBalance: 0,
            icon: accData.type === 'bank' ? '🏦' : '💵',
          });
          return ctx.reply(
            `Listo! Creé la cuenta "${accData.account || accData.name}". Ahora podés usarla para registrar gastos.`
          );
        } catch {
          return ctx.reply('No pude crear la cuenta. ¿Podés intentar de nuevo?');
        }
      }

      return ctx.reply(parsedResponse.response);
    } finally {
      if (aiResponse) {
        await appendBotTurn(user.id, ctx.chat.id, transcribed, aiResponse).catch(() => {});
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

  const userMessage = ctx.message.text;
  
  const pendingKey = `pending_photo_${ctx.chat.id}`;
  const pendingData = (global as any)[pendingKey];
  
  if (pendingData && ['sí', 'si', 'ok', 'dale', 'confirmar', 'yes'].includes(userMessage.toLowerCase().trim())) {
    try {
      await transactionsService.create({
        userId: pendingData.userId,
        type: 'expense',
        accountId: pendingData.accountId,
        amount: pendingData.amount,
        currency: pendingData.currency,
        categoryId: pendingData.categoryId,
        description: pendingData.description,
        transactionDate:
          parseBotTransactionDateInput(pendingData.date) ?? new Date().toISOString(),
      });
      
      delete (global as any)[pendingKey];
      
      return ctx.reply(
        `✅ Listo! Registré $${pendingData.amount.toLocaleString('es-AR')} ${pendingData.currency} en ${pendingData.accountName}` +
        (pendingData.categoryName ? ` (${pendingData.categoryName})` : '')
      );
    } catch (error) {
      console.error('Error saving photo transaction:', error);
      return ctx.reply('Hubo un error guardando el gasto. ¿Podés intentar de nuevo?');
    }
  }
  
  if (pendingData && ['no', 'cancelar', 'cancel'].includes(userMessage.toLowerCase().trim())) {
    delete (global as any)[pendingKey];
    return ctx.reply('Ok, cancelado. Podés mandarme otra foto o escribirme el gasto.');
  }

  const offTopicKeywords = [
    'chiste', 'poema', 'canción', 'receta', 'clima', 'tiempo',
    'horóscopo', 'partido', 'fútbol', 'película', 'serie',
    'traduci', 'traducir', 'código', 'programar', 'html', 'javascript',
  ];

  const lowerMessage = userMessage.toLowerCase();
  const isOffTopic = offTopicKeywords.some(keyword => lowerMessage.includes(keyword));

  if (isOffTopic) {
    return ctx.reply(
      'Solo ayudo con finanzas personales. ¿Necesitás registrar un gasto, consultar saldos o analizar tus gastos?'
    );
  }

  try {
    const financialContext = await getFinancialContext(user.id);

    let gText;
    try {
      gText = await getGeminiForUser(user.id);
    } catch (e) {
      if (e instanceof GeminiMissingKeyError) {
        return ctx.reply(GEMINI_SETUP_MSG);
      }
      throw e;
    }

    const systemPrompt = buildBotSystemPrompt(financialContext);

    const storedTurns = await getStoredTurns(user.id, ctx.chat.id);
    const history = storedTurnsToGeminiHistory(storedTurns);
    const tier = preferFullTierForMessage(userMessage)
      ? 'full'
      : getTierForRequest(userMessage, false);

    let aiResponse = '';
    try {
      aiResponse = await gText.chat(userMessage, {
        tier,
        systemInstruction: systemPrompt,
        history,
        maxTokens: 2048,
      });

      console.log('[BOT] AI Response:', aiResponse.substring(0, 200));

      let parsedResponse: {
        action: string;
        transaction?: Record<string, unknown>;
        transactions?: Record<string, unknown>[];
        response: string;
      };

      try {
        parsedResponse = parseModelJson(aiResponse) as typeof parsedResponse;
        console.log('[BOT] Parsed action:', parsedResponse.action);
      } catch (parseError) {
        console.error('[BOT] JSON parse error:', parseError);
        return ctx.reply(aiResponse);
      }

      if (parsedResponse.action === 'create_transaction' && parsedResponse.transaction) {
        const r = await executeBotTransaction(user.id, financialContext, parsedResponse.transaction, {
          summaryResponse: parsedResponse.response,
        });
        if (r.kind === 'abort') return ctx.reply(r.reply);
        return ctx.reply(r.reply);
      }

      if (
        parsedResponse.action === 'create_transactions' &&
        Array.isArray(parsedResponse.transactions)
      ) {
        const txs = parsedResponse.transactions
          .filter((t) => t && typeof t.amount === 'number' && (t.amount as number) > 0)
          .slice(0, MAX_BATCH_TRANSACTIONS);
        if (txs.length === 0) {
          return ctx.reply(
            parsedResponse.response || 'No encontré montos válidos en tu mensaje.'
          );
        }
        const lines: string[] = [];
        for (const tx of txs) {
          const r = await executeBotTransaction(user.id, financialContext, tx, {});
          if (r.kind === 'abort') return ctx.reply(r.reply);
          lines.push(r.reply);
        }
        return ctx.reply(`✅ ${parsedResponse.response}\n\n${lines.join('\n')}`);
      }

      if (parsedResponse.action === 'create_account' && parsedResponse.transaction) {
        const accData = parsedResponse.transaction;

        try {
          await accountsService.create({
            userId: user.id,
            name: (accData.account || accData.name) as string,
            type: (accData.type as string) || 'cash',
            currency: (accData.currency as string) || 'ARS',
            initialBalance: 0,
            icon: accData.type === 'bank' ? '🏦' : '💵',
          });

          return ctx.reply(
            `Listo! Creé la cuenta "${accData.account || accData.name}". Ahora podés usarla para registrar gastos.`
          );
        } catch {
          return ctx.reply('No pude crear la cuenta. ¿Podés intentar de nuevo?');
        }
      }

      return ctx.reply(parsedResponse.response);
    } finally {
      if (aiResponse) {
        await appendBotTurn(user.id, ctx.chat.id, userMessage, aiResponse).catch(() => {});
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
    
    ctx.reply('Hubo un error procesando tu mensaje. ¿Podés reformularlo? Por ejemplo: "gasté 500 en almacén"');
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
