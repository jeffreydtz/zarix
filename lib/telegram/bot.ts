import { Telegraf, Context } from 'telegraf';
import { message } from 'telegraf/filters';
import { geminiClient } from '@/lib/ai/gemini';
import { buildBotSystemPrompt } from '@/lib/ai/prompts';
import { transactionsService } from '@/lib/services/transactions';
import { accountsService } from '@/lib/services/accounts';
import { cotizacionesService } from '@/lib/services/cotizaciones';
import { createServiceClientSync } from '@/lib/supabase/server';
import type { FinancialContext } from '@/lib/ai/prompts';

interface BotContext extends Context {
  userId?: string;
}

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN!);

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

bot.command('start', async (ctx) => {
  const telegramChatId = ctx.chat.id;
  const username = ctx.from?.username;

  const existingUser = await getUserFromTelegramId(telegramChatId);

  if (existingUser) {
    return ctx.reply(
      `¡Ya estás vinculado! 🎉\n\nUsá /cuentas para ver tus saldos o hablame natural: "gasté 5000 en el super"`
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
/resumen → resumen del mes actual
/help → esta ayuda

*LENGUAJE NATURAL:*
También podés hablarme natural:

• "gasté 5000 en el super"
• "me depositaron el sueldo, 800 lucas"
• "pagué netflix con la visa, 15 dólares"
• "compré 100 dólares a 1250"
• "cuánto gasté en comida este mes?"
• "a cómo está el blue?"

¡Probá y te entiendo! 🚀`;

  ctx.reply(message, { parse_mode: 'Markdown' });
});

bot.on(message('text'), async (ctx) => {
  const user = await getUserFromTelegramId(ctx.chat.id);
  if (!user) {
    return ctx.reply(
      'No estás vinculado todavía. Usá /start para vincular tu cuenta.'
    );
  }

  const userMessage = ctx.message.text;

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

    const systemPrompt = buildBotSystemPrompt(financialContext);

    const tier = geminiClient.getTierForRequest(userMessage, false);

    const aiResponse = await geminiClient.chat(userMessage, {
      tier,
      systemInstruction: systemPrompt,
      maxTokens: 1024,
    });

    console.log('[BOT] AI Response:', aiResponse.substring(0, 200));

    let parsedResponse: {
      action: string;
      transaction?: any;
      response: string;
    };

    try {
      const cleaned = aiResponse.trim().replace(/^```json\s*/, '').replace(/```\s*$/, '');
      parsedResponse = JSON.parse(cleaned);
      console.log('[BOT] Parsed action:', parsedResponse.action);
    } catch (parseError) {
      console.error('[BOT] JSON parse error:', parseError);
      return ctx.reply(aiResponse);
    }

    if (parsedResponse.action === 'create_transaction' && parsedResponse.transaction) {
      const txData = parsedResponse.transaction;

      if (!txData.amount || txData.amount <= 0) {
        return ctx.reply(parsedResponse.response || 'No pude entender el monto. ¿Podés ser más específico?');
      }

      let accountId = '';
      let accountName = '';
      
      if (txData.account) {
        const fuzzyResult = await accountsService.findByNameFuzzy(user.id, txData.account);
        
        if (fuzzyResult.confidence === 'exact' || fuzzyResult.confidence === 'high') {
          accountId = fuzzyResult.account!.id;
          accountName = fuzzyResult.account!.name;
        } else if (fuzzyResult.confidence === 'medium' && fuzzyResult.account) {
          accountId = fuzzyResult.account.id;
          accountName = fuzzyResult.account.name;
        } else if (fuzzyResult.confidence === 'low' && fuzzyResult.suggestions && fuzzyResult.suggestions.length > 0) {
          const suggestionList = fuzzyResult.suggestions
            .map(s => `• ${s.icon || '💳'} ${s.name}`)
            .join('\n');
          
          return ctx.reply(
            `No encontré "${txData.account}" exactamente. ¿Quisiste decir alguna de estas?\n\n${suggestionList}\n\n` +
            `Respondé con el nombre exacto o decime "crear ${txData.account}" si querés crear una cuenta nueva.`
          );
        } else {
          const accountsList = financialContext.accounts
            .slice(0, 5)
            .map(a => `• ${a.icon || '💳'} ${a.name}`)
            .join('\n');
          
          return ctx.reply(
            `No encontré la cuenta "${txData.account}". Tus cuentas son:\n\n${accountsList}\n\n` +
            `¿Querés crear la cuenta "${txData.account}"? Respondé "crear ${txData.account}" o usá una de las existentes.`
          );
        }
      }

      if (!accountId) {
        const defaultAccount = financialContext.accounts.find(
          (a) => a.currency === txData.currency && a.type !== 'credit_card'
        );
        if (!defaultAccount) {
          return ctx.reply(
            `No tenés cuentas en ${txData.currency}. ¿Querés crear una? Decime "crear cuenta ${txData.currency.toLowerCase()}".`
          );
        }
        accountId = defaultAccount.id;
        accountName = defaultAccount.name;
      }

      let categoryId: string | undefined;
      if (txData.category) {
        const category = financialContext.categories.find(
          (c) => c.name.toLowerCase() === txData.category.toLowerCase()
        );
        if (category) {
          categoryId = category.id;
        }
      }

      let destinationAccountId: string | undefined;
      if (txData.destinationAccount) {
        const destResult = await accountsService.findByNameFuzzy(
          user.id,
          txData.destinationAccount
        );
        if (destResult.account) {
          destinationAccountId = destResult.account.id;
        }
      }

      try {
        await transactionsService.create({
          userId: user.id,
          type: txData.type,
          accountId,
          destinationAccountId,
          amount: txData.amount,
          currency: txData.currency,
          categoryId,
          description: txData.description,
        });

        const responseWithAccount = parsedResponse.response.includes(accountName) 
          ? parsedResponse.response 
          : `${parsedResponse.response} (desde ${accountName})`;

        return ctx.reply(responseWithAccount);
      } catch (txError: any) {
        console.error('Transaction error:', txError);
        
        if (txError.code === '23514' && txError.message?.includes('positive_balance')) {
          const account = financialContext.accounts.find(a => a.id === accountId);
          const currentBalance = account?.balance || 0;
          
          return ctx.reply(
            `No pude registrar el gasto porque tu cuenta "${accountName}" quedaría en negativo.\n\n` +
            `Saldo actual: $${currentBalance.toLocaleString('es-AR')}\n` +
            `Gasto: $${txData.amount.toLocaleString('es-AR')}\n\n` +
            `Opciones:\n` +
            `• Usá otra cuenta con más saldo\n` +
            `• Agregá fondos a esta cuenta primero\n` +
            `• Usá una tarjeta de crédito para este gasto`
          );
        }
        
        return ctx.reply('Hubo un error al registrar la transacción. ¿Podés intentar de nuevo?');
      }
    }

    if (parsedResponse.action === 'create_account' && parsedResponse.transaction) {
      const accData = parsedResponse.transaction;
      
      try {
        await accountsService.create({
          userId: user.id,
          name: accData.account || accData.name,
          type: accData.type || 'cash',
          currency: accData.currency || 'ARS',
          initialBalance: 0,
          icon: accData.type === 'bank' ? '🏦' : '💵',
        });
        
        return ctx.reply(`Listo! Creé la cuenta "${accData.account || accData.name}". Ahora podés usarla para registrar gastos.`);
      } catch (error) {
        return ctx.reply('No pude crear la cuenta. ¿Podés intentar de nuevo?');
      }
    }

    ctx.reply(parsedResponse.response);
  } catch (error: any) {
    console.error('Bot error:', error);
    
    if (error.message?.includes('404') || error.message?.includes('not found')) {
      return ctx.reply('El servicio de IA no está disponible temporalmente. Probá de nuevo en unos minutos.');
    }
    
    if (error.message?.includes('account')) {
      return ctx.reply('No encontré esa cuenta. Usá /cuentas para ver cuáles tenés disponibles.');
    }
    
    ctx.reply('Hubo un error procesando tu mensaje. ¿Podés reformularlo? Por ejemplo: "gasté 500 en almacén"');
  }
});

bot.on(message('photo'), async (ctx) => {
  const user = await getUserFromTelegramId(ctx.chat.id);
  if (!user) {
    return ctx.reply('No estás vinculado. Usá /start primero.');
  }

  try {
    const photo = ctx.message.photo[ctx.message.photo.length - 1];
    const fileLink = await ctx.telegram.getFileLink(photo.file_id);

    const imageResponse = await fetch(fileLink.href);
    const imageBuffer = await imageResponse.arrayBuffer();
    const imageBase64 = Buffer.from(imageBuffer).toString('base64');

    const caption = ctx.message.caption || 'Analizá este ticket y registrá el gasto';

    const financialContext = await getFinancialContext(user.id);
    const systemPrompt = buildBotSystemPrompt(financialContext);

    const aiResponse = await geminiClient.chatWithImage(
      caption,
      imageBase64,
      'image/jpeg',
      {
        systemInstruction: systemPrompt,
        maxTokens: 1024,
      }
    );

    let parsedResponse: {
      action: string;
      transaction?: any;
      response: string;
    };

    try {
      const cleaned = aiResponse.trim().replace(/^```json\s*/, '').replace(/```\s*$/, '');
      parsedResponse = JSON.parse(cleaned);
    } catch {
      return ctx.reply(aiResponse);
    }

    if (parsedResponse.action === 'create_transaction' && parsedResponse.transaction) {
      const txData = parsedResponse.transaction;

      if (!txData.amount || txData.amount <= 0) {
        return ctx.reply(parsedResponse.response || 'No pude leer bien el monto del ticket. ¿Me lo decís vos?');
      }

      let accountId = '';
      const defaultAccount = financialContext.accounts.find(
        (a) => a.currency === txData.currency && a.type !== 'credit_card'
      );
      if (defaultAccount) {
        accountId = defaultAccount.id;
      } else {
        return ctx.reply('No encontré una cuenta para esta moneda.');
      }

      let categoryId: string | undefined;
      if (txData.category) {
        const category = financialContext.categories.find(
          (c) => c.name.toLowerCase() === txData.category.toLowerCase()
        );
        if (category) {
          categoryId = category.id;
        }
      }

      await transactionsService.create({
        userId: user.id,
        type: txData.type,
        accountId,
        amount: txData.amount,
        currency: txData.currency,
        categoryId,
        description: txData.description,
      });

      return ctx.reply(parsedResponse.response);
    }

    ctx.reply(parsedResponse.response);
  } catch (error) {
    console.error('Photo processing error:', error);
    ctx.reply('No pude procesar la imagen. Probá con otra más clara.');
  }
});

export { bot };

export async function handleTelegramUpdate(update: any) {
  await bot.handleUpdate(update);
}
