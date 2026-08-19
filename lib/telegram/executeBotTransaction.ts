import type { FinancialContext } from '@/lib/ai/prompts';
import { parseBotTransactionDateInput } from '@/lib/transaction-date';
import { coerceTransactionCurrency } from '@/lib/constants/transaction-currencies';
import { accountsService } from '@/lib/services/accounts';
import { cotizacionesService } from '@/lib/services/cotizaciones';
import { transactionsService } from '@/lib/services/transactions';
import type { ExecutedTransactionSummary } from '@/types/internal-ai-chat';

export type BotTxPayload = {
  type?: string;
  amount?: number;
  currency?: string;
  account?: string | null;
  category?: string;
  description?: string;
  destinationAccount?: string;
  /** ISO o YYYY-MM-DD; el modelo también puede mandar `date` (alias). */
  transactionDate?: string;
  date?: string;
};

export type ExecuteBotTxResult =
  | { kind: 'success'; reply: string; executed?: ExecutedTransactionSummary }
  | { kind: 'abort'; reply: string };

function normalizeTxType(raw?: string): 'expense' | 'income' | 'transfer' {
  const t = (raw || 'expense').toLowerCase();
  if (t === 'income' || t === 'transfer') return t;
  return 'expense';
}

/**
 * Crea un movimiento a partir del JSON del modelo (Telegram / voz).
 * Devuelve el texto a mostrar o un abort con mensaje ya listo para el usuario.
 */
export async function executeBotTransaction(
  userId: string,
  financialContext: FinancialContext,
  txData: BotTxPayload,
  options?: { summaryResponse?: string }
): Promise<ExecuteBotTxResult> {
  const summaryResponse = options?.summaryResponse ?? '';

  if (!txData.amount || txData.amount <= 0) {
    return {
      kind: 'abort',
      reply: summaryResponse || 'No pude entender el monto. ¿Podés ser más específico?',
    };
  }

  const txType = normalizeTxType(txData.type);
  const txCurrency = coerceTransactionCurrency(txData.currency);

  let accountId = '';
  let accountName = '';
  let selectedAccount: (typeof financialContext.accounts)[0] | null = null;

  if (txData.account) {
    const fuzzyResult = await accountsService.findByNameFuzzy(userId, txData.account, {
      currency: txCurrency,
    });

    if (fuzzyResult.confidence === 'exact' || fuzzyResult.confidence === 'high') {
      accountId = fuzzyResult.account!.id;
      accountName = fuzzyResult.account!.name;
      selectedAccount = fuzzyResult.account;
    } else if (
      fuzzyResult.confidence === 'low' &&
      fuzzyResult.suggestions &&
      fuzzyResult.suggestions.length > 0
    ) {
      const suggestionList = fuzzyResult.suggestions
        .map((s) => `• ${s.icon || '💳'} ${s.name}`)
        .join('\n');

      return {
        kind: 'abort',
        reply:
          `No encontré "${txData.account}" exactamente. ¿Quisiste decir alguna de estas?\n\n${suggestionList}\n\n` +
          `Respondé con el nombre exacto o decime "crear ${txData.account}" si querés crear una cuenta nueva.`,
      };
    } else {
      const accountsList = financialContext.accounts
        .slice(0, 5)
        .map((a) => `• ${a.icon || '💳'} ${a.name}`)
        .join('\n');

      return {
        kind: 'abort',
        reply:
          `No encontré la cuenta "${txData.account}". Tus cuentas son:\n\n${accountsList}\n\n` +
          `¿Querés crear la cuenta "${txData.account}"? Respondé "crear ${txData.account}" o usá una de las existentes.`,
      };
    }
  }

  if (!accountId) {
    const defaultAccount = financialContext.accounts.find(
      (a) => a.currency === txCurrency && a.type !== 'credit_card'
    );
    if (!defaultAccount) {
      return {
        kind: 'abort',
        reply: `No tenés cuentas en ${txCurrency}. ¿Querés crear una? Decime "crear cuenta ${txCurrency.toLowerCase()}".`,
      };
    }
    accountId = defaultAccount.id;
    accountName = defaultAccount.name;
    selectedAccount = defaultAccount;
  }

  let finalCurrency: string = txCurrency;
  let finalAmount = txData.amount;
  let conversionNote = '';

  if (selectedAccount && txCurrency !== selectedAccount.currency) {
    const isMulticurrency =
      selectedAccount.is_multicurrency &&
      (selectedAccount.secondary_currency === txCurrency ||
        selectedAccount.currency === txCurrency);

    if (!isMulticurrency && selectedAccount.type === 'credit_card') {
      try {
        const rate = await cotizacionesService.getExchangeRate(txCurrency, selectedAccount.currency);
        if (rate > 0) {
          finalAmount = txData.amount * rate;
          finalCurrency = selectedAccount.currency;
          conversionNote = ` (${txData.amount} ${txCurrency} × $${rate.toFixed(2)} = $${finalAmount.toFixed(2)} ${finalCurrency})`;
        }
      } catch {
        console.log('Could not get exchange rate, using original currency');
      }
    }
  }

  let categoryId: string | undefined;
  if (txData.category) {
    const category = financialContext.categories.find(
      (c) => c.name.toLowerCase() === txData.category!.toLowerCase()
    );
    if (category) {
      categoryId = category.id;
    }
  }

  let destinationAccountId: string | undefined;
  if (txData.destinationAccount) {
    const destResult = await accountsService.findByNameFuzzy(userId, txData.destinationAccount);
    if (destResult.account) {
      destinationAccountId = destResult.account.id;
    } else if (txType === 'transfer') {
      // Sin destino resuelto, la transferencia se crearía de un solo lado y la
      // plata "desaparecería" del origen. Abortamos con mensaje claro.
      const accountsList = financialContext.accounts
        .slice(0, 5)
        .map((a) => `• ${a.icon || '💳'} ${a.name}`)
        .join('\n');

      return {
        kind: 'abort',
        reply:
          `No encontré la cuenta destino "${txData.destinationAccount}". Tus cuentas son:\n\n${accountsList}\n\n` +
          `Decime el nombre exacto de la cuenta a la que transferiste.`,
      };
    }
  }

  if (txType === 'transfer' && !destinationAccountId) {
    return {
      kind: 'abort',
      reply: 'Para registrar una transferencia necesito la cuenta destino. ¿A qué cuenta transferiste?',
    };
  }

  const resolvedDate =
    parseBotTransactionDateInput(txData.transactionDate) ??
    parseBotTransactionDateInput(txData.date);

  try {
    const createdTransaction = await transactionsService.create({
      userId,
      type: txType,
      accountId,
      destinationAccountId,
      amount: finalAmount,
      currency: finalCurrency,
      categoryId,
      description: txData.description,
      ...(resolvedDate ? { transactionDate: resolvedDate } : {}),
    });

    let responseWithAccount: string;
    if (summaryResponse.trim()) {
      responseWithAccount = summaryResponse.includes(accountName)
        ? summaryResponse
        : `${summaryResponse} (desde ${accountName})`;
    } else {
      const desc = txData.description || txType;
      responseWithAccount = `✓ ${desc} — ${accountName}`;
    }

    if (conversionNote) {
      responseWithAccount += conversionNote;
    }

    return {
      kind: 'success',
      reply: responseWithAccount,
      executed: {
        id: createdTransaction.id,
        summary: responseWithAccount,
        amount: finalAmount,
        currency: finalCurrency,
        accountName,
        categoryName: txData.category,
      },
    };
  } catch (txError: unknown) {
    console.error('Transaction error:', txError);
    // Nota: no bloqueamos saldos negativos — las cuentas de deuda / tarjetas de
    // crédito quedan en negativo por diseño. (Antes había un handler para un
    // constraint `positive_balance` que no existe en el schema: código muerto,
    // removido 2026-08-11.)
    return {
      kind: 'abort',
      reply: 'Hubo un error al registrar la transacción. ¿Podés intentar de nuevo?',
    };
  }
}
