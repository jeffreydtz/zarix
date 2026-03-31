import { Telegraf, Context } from 'telegraf';
import { message } from 'telegraf/filters';
import { geminiClient } from '@/lib/ai/gemini';
import { buildBotSystemPrompt } from '@/lib/ai/prompts';
import { transactionsService } from '@/lib/services/transactions';
import { accountsService } from '@/lib/services/accounts';
import { cotizacionesService } from '@/lib/services/cotizaciones';
import { createServiceClient } from '@/lib/supabase/server';
import type { FinancialContext } from '@/lib/ai/prompts';

interface BotContext extends Context {
  userId?: string;
}

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN!);

async function getUserFromTelegramId(telegramChatId: number) {
  const supabase = await createServiceClient();

  const { data: user, error } = await supabase
    .from('users')
    .select('*')
    .eq('telegram_chat_id', telegramChatId)
    .single();

  if (error || !user) return null;
  return user;
}

async function linkUserToTelegram(userId: string, telegramChatId: number, username?: string) {
  const supabase = await createServiceClient();

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
  const supabase = await createServiceClient();

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

  try {
    const financialContext = await getFinancialContext(user.id);

    const systemPrompt = buildBotSystemPrompt(financialContext);

    const tier = geminiClient.getTierForRequest(userMessage, false);

    const aiResponse = await geminiClient.chat(userMessage, {
      tier,
      systemInstruction: systemPrompt,
      maxTokens: 1024,
    });

    let parsedResponse: {
      action: string;
      transaction?: any;
      response: string;
    };

    try {
      parsedResponse = JSON.parse(aiResponse);
    } catch {
      return ctx.reply(aiResponse);
    }

    if (parsedResponse.action === 'create_transaction' && parsedResponse.transaction) {
      const txData = parsedResponse.transaction;

      let accountId = '';
      if (txData.account) {
        const account = await accountsService.findByName(user.id, txData.account);
        if (account) {
          accountId = account.id;
        }
      }

      if (!accountId) {
        const defaultAccount = financialContext.accounts.find(
          (a) => a.currency === txData.currency && a.type !== 'credit_card'
        );
        if (!defaultAccount) {
          return ctx.reply(
            'No encontré la cuenta. ¿Podés especificar cuál usar?'
          );
        }
        accountId = defaultAccount.id;
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
        const destAccount = await accountsService.findByName(
          user.id,
          txData.destinationAccount
        );
        if (destAccount) {
          destinationAccountId = destAccount.id;
        }
      }

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

      return ctx.reply(parsedResponse.response);
    }

    ctx.reply(parsedResponse.response);
  } catch (error) {
    console.error('Bot error:', error);
    ctx.reply('Hubo un error procesando tu mensaje. Probá de nuevo.');
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
      parsedResponse = JSON.parse(aiResponse);
    } catch {
      return ctx.reply(aiResponse);
    }

    if (parsedResponse.action === 'create_transaction' && parsedResponse.transaction) {
      const txData = parsedResponse.transaction;

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
