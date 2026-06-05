import { SchemaType, type FunctionDeclaration } from '@google/generative-ai';
import type { FinancialContext } from '@/lib/ai/prompts';
import { executeBotTransaction, type BotTxPayload } from '@/lib/telegram/executeBotTransaction';
import { transactionsService } from '@/lib/services/transactions';
import { accountsService } from '@/lib/services/accounts';
import { budgetsService } from '@/lib/services/budgets';
import { investmentsService } from '@/lib/services/investments';
import { analyticsService } from '@/lib/services/analytics';
import { cotizacionesService } from '@/lib/services/cotizaciones';
import type { ExecutedTransactionSummary } from '@/types/internal-ai-chat';

/**
 * Capa de herramientas del asistente financiero (Telegram + chat web).
 *
 * Function calling de Gemini: el modelo elige una de estas tools, nosotros la
 * ejecutamos contra los servicios de la app (SIEMPRE scoped por `userId`) y le
 * devolvemos el resultado para que redacte la respuesta. Todo lo que el bot
 * puede hacer vive acá — el modelo no tiene otra vía de tocar datos.
 */

export type BotToolContext = {
  userId: string;
  financialContext: FinancialContext;
};

export type BotToolResult = {
  /** Objeto JSON que se le devuelve al modelo como functionResponse. */
  response: Record<string, unknown>;
  /** Movimientos creados/editados, para que el caller arme el resumen. */
  executed?: ExecutedTransactionSummary[];
};

/** Tools que escriben datos (mutan estado del usuario). */
export const BOT_WRITE_TOOLS: ReadonlySet<string> = new Set([
  'create_transaction',
  'create_transactions',
  'create_account',
  'delete_last_transaction',
  'edit_last_transaction',
]);

const MAX_BATCH = 12;

function round(n: number, decimals = 0): number {
  const f = 10 ** decimals;
  return Math.round((Number(n) || 0) * f) / f;
}

// ─── Resolución de períodos (calendario argentino) ───────────────────────────

const AR_TZ = 'America/Argentina/Buenos_Aires';

function arTodayParts(): { y: number; m: number; d: number } {
  const ymd = new Intl.DateTimeFormat('en-CA', {
    timeZone: AR_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  const [y, m, d] = ymd.split('-').map(Number);
  return { y, m, d };
}

/** Medianoche AR (UTC-3) como instante UTC. */
function arMidnightUtc(y: number, mIndex: number, d: number): Date {
  return new Date(Date.UTC(y, mIndex, d, 3, 0, 0, 0));
}

function toYMD(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: AR_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

type ResolvedPeriod = { start: Date; end: Date; label: string };

function resolvePeriod(period?: string): ResolvedPeriod {
  const { y, m, d } = arTodayParts();
  const mIndex = m - 1;
  const now = new Date();
  const startOfToday = arMidnightUtc(y, mIndex, d);

  switch ((period || 'this_month').toLowerCase()) {
    case 'last_month': {
      const start = arMidnightUtc(y, mIndex - 1, 1);
      const end = new Date(arMidnightUtc(y, mIndex, 1).getTime() - 1);
      return { start, end, label: 'el mes pasado' };
    }
    case 'this_week': {
      const dow = new Date(Date.UTC(y, mIndex, d)).getUTCDay(); // 0=dom
      const backToMonday = dow === 0 ? 6 : dow - 1;
      const start = arMidnightUtc(y, mIndex, d - backToMonday);
      return { start, end: now, label: 'esta semana' };
    }
    case 'last_7_days': {
      const start = new Date(startOfToday.getTime() - 6 * 86400000);
      return { start, end: now, label: 'los últimos 7 días' };
    }
    case 'last_30_days': {
      const start = new Date(startOfToday.getTime() - 29 * 86400000);
      return { start, end: now, label: 'los últimos 30 días' };
    }
    case 'this_year': {
      const start = arMidnightUtc(y, 0, 1);
      return { start, end: now, label: 'este año' };
    }
    case 'this_month':
    default: {
      const start = arMidnightUtc(y, mIndex, 1);
      return { start, end: now, label: 'este mes' };
    }
  }
}

// ─── Declaraciones de funciones para Gemini ──────────────────────────────────

const TX_PROPS = {
  type: {
    type: SchemaType.STRING,
    format: 'enum',
    enum: ['expense', 'income', 'transfer'],
    description: 'Tipo: gasto (expense), ingreso (income) o transferencia (transfer).',
  },
  amount: { type: SchemaType.NUMBER, description: 'Monto, siempre > 0.' },
  currency: { type: SchemaType.STRING, description: 'ARS, USD, EUR. Default ARS.' },
  account: {
    type: SchemaType.STRING,
    description: 'Nombre de cuenta tal como lo dijo el usuario (el sistema busca similitudes). Omitir si no la mencionó.',
  },
  category: { type: SchemaType.STRING, description: 'Nombre de categoría.' },
  description: { type: SchemaType.STRING, description: 'Texto libre corto.' },
  destinationAccount: { type: SchemaType.STRING, description: 'Solo para transfer: cuenta destino.' },
  transactionDate: {
    type: SchemaType.STRING,
    description: 'YYYY-MM-DD. SOLO si el usuario dijo cuándo ocurrió (ayer, el lunes, 15/3...). Omitir si no.',
  },
} as const;

export const BOT_FUNCTION_DECLARATIONS: FunctionDeclaration[] = [
  {
    name: 'create_transaction',
    description: 'Registra UN movimiento (gasto, ingreso o transferencia) parseado del mensaje del usuario.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: TX_PROPS as any,
      required: ['type', 'amount'],
    },
  },
  {
    name: 'create_transactions',
    description: 'Registra VARIOS movimientos de un mismo mensaje (listas, viñetas, "y también", varios montos).',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        transactions: {
          type: SchemaType.ARRAY,
          description: `Hasta ${MAX_BATCH} movimientos.`,
          items: { type: SchemaType.OBJECT, properties: TX_PROPS as any, required: ['type', 'amount'] },
        },
      },
      required: ['transactions'],
    },
  },
  {
    name: 'create_account',
    description: 'Crea una cuenta nueva cuando el usuario lo pide explícitamente.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        name: { type: SchemaType.STRING, description: 'Nombre de la cuenta.' },
        type: { type: SchemaType.STRING, description: 'cash, bank, credit_card, wallet... Default cash.' },
        currency: { type: SchemaType.STRING, description: 'ARS, USD, EUR. Default ARS.' },
      },
      required: ['name'],
    },
  },
  {
    name: 'delete_last_transaction',
    description: 'Borra el último movimiento registrado. Usar para "borrá el último", "deshacé eso", "cancelá lo que acabo de cargar".',
    parameters: { type: SchemaType.OBJECT, properties: {} },
  },
  {
    name: 'edit_last_transaction',
    description: 'Corrige el último movimiento (gasto/ingreso). Usar para "eran 5000 no 500", "ponelo en transporte", "era con la visa".',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        amount: { type: SchemaType.NUMBER, description: 'Nuevo monto.' },
        category: { type: SchemaType.STRING, description: 'Nueva categoría.' },
        account: { type: SchemaType.STRING, description: 'Nueva cuenta.' },
        description: { type: SchemaType.STRING, description: 'Nueva descripción.' },
        type: { type: SchemaType.STRING, format: 'enum', enum: ['expense', 'income'] },
      },
    },
  },
  {
    name: 'get_spending',
    description: 'Cuánto gastó el usuario en un período, total y por categoría. Para "cuánto gasté en comida este mes", "en qué se me va la plata".',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        period: {
          type: SchemaType.STRING,
          format: 'enum',
          enum: ['this_month', 'last_month', 'this_week', 'last_7_days', 'last_30_days', 'this_year'],
          description: 'Período. Default this_month.',
        },
        category: { type: SchemaType.STRING, description: 'Filtrar por una categoría puntual (opcional).' },
      },
    },
  },
  {
    name: 'list_transactions',
    description: 'Lista movimientos recientes con filtros. Para "mostrame mis últimos gastos", "qué cargué hoy", "movimientos de la visa".',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        limit: { type: SchemaType.NUMBER, description: 'Cantidad (1-20). Default 8.' },
        type: { type: SchemaType.STRING, format: 'enum', enum: ['expense', 'income', 'transfer'] },
        category: { type: SchemaType.STRING },
        account: { type: SchemaType.STRING },
        search: { type: SchemaType.STRING, description: 'Texto a buscar en la descripción.' },
        period: {
          type: SchemaType.STRING,
          format: 'enum',
          enum: ['this_month', 'last_month', 'this_week', 'last_7_days', 'last_30_days', 'this_year'],
        },
      },
    },
  },
  {
    name: 'get_budget_status',
    description: 'Estado de los presupuestos del mes (gastado vs límite por categoría). Para "cómo voy con el presupuesto".',
    parameters: { type: SchemaType.OBJECT, properties: {} },
  },
  {
    name: 'get_portfolio',
    description: 'Resumen de inversiones: valor actual, ganancia/pérdida total y del día. Para "cómo va mi cartera", "cuánto rindieron mis inversiones".',
    parameters: { type: SchemaType.OBJECT, properties: {} },
  },
  {
    name: 'get_net_worth',
    description: 'Patrimonio total: líquido + inversiones, en ARS (blue) y USD. Para "cuánta plata tengo en total", "mi patrimonio".',
    parameters: { type: SchemaType.OBJECT, properties: {} },
  },
  {
    name: 'get_accounts',
    description: 'Saldos de todas las cuentas del usuario. Para "cuánto tengo en cada cuenta", "saldo de la visa".',
    parameters: { type: SchemaType.OBJECT, properties: {} },
  },
  {
    name: 'get_quotes',
    description: 'Cotizaciones de mercado: dólar (blue, oficial, MEP, CCL) y cripto (BTC, ETH, USDT). Para "a cómo está el blue".',
    parameters: { type: SchemaType.OBJECT, properties: {} },
  },
];

// ─── Ejecución ───────────────────────────────────────────────────────────────

type ToolArgs = Record<string, unknown>;

function str(v: unknown): string | undefined {
  if (v === null || v === undefined) return undefined;
  const s = String(v).trim();
  return s ? s : undefined;
}

function num(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

export async function executeBotTool(
  name: string,
  args: ToolArgs,
  ctx: BotToolContext
): Promise<BotToolResult> {
  const { userId, financialContext } = ctx;

  switch (name) {
    case 'create_transaction': {
      const res = await executeBotTransaction(userId, financialContext, args as BotTxPayload, {});
      if (res.kind === 'abort') return { response: { success: false, error: res.reply } };
      return {
        response: { success: true, summary: res.reply },
        executed: res.executed ? [res.executed] : undefined,
      };
    }

    case 'create_transactions': {
      const rawList = Array.isArray(args.transactions) ? (args.transactions as BotTxPayload[]) : [];
      const txs = rawList
        .filter((t) => t && typeof t.amount === 'number' && t.amount > 0)
        .slice(0, MAX_BATCH);
      if (txs.length === 0) return { response: { success: false, error: 'No encontré montos válidos.' } };

      const executed: ExecutedTransactionSummary[] = [];
      const results: Array<{ ok: boolean; detail: string }> = [];
      for (const tx of txs) {
        const res = await executeBotTransaction(userId, financialContext, tx, {});
        if (res.kind === 'abort') {
          results.push({ ok: false, detail: res.reply });
        } else {
          results.push({ ok: true, detail: res.reply });
          if (res.executed) executed.push(res.executed);
        }
      }
      return {
        response: { executedCount: executed.length, total: txs.length, results },
        executed: executed.length ? executed : undefined,
      };
    }

    case 'create_account': {
      const accountName = str(args.name) || str(args.account);
      if (!accountName) return { response: { success: false, error: 'Falta el nombre de la cuenta.' } };
      try {
        const type = str(args.type) || 'cash';
        await accountsService.create({
          userId,
          name: accountName,
          type,
          currency: str(args.currency) || 'ARS',
          initialBalance: 0,
          icon: type === 'bank' ? '🏦' : '💵',
        });
        return { response: { success: true, name: accountName } };
      } catch {
        return { response: { success: false, error: 'No pude crear la cuenta.' } };
      }
    }

    case 'delete_last_transaction': {
      // "El último" = el último que el usuario cargó (orden de creación), no el de
      // fecha más reciente: si cargó un gasto de ayer, "borrá el último" debe
      // borrar ESE, no otro movimiento con transaction_date más nuevo.
      const [last] = await transactionsService.list(userId, { limit: 1, orderByCreated: true });
      if (!last) return { response: { success: false, error: 'No hay movimientos para borrar.' } };
      await transactionsService.delete(last.id, userId);
      return {
        response: {
          success: true,
          deleted: {
            type: last.type,
            amount: last.amount,
            currency: last.currency,
            description: last.description,
            account: (last.account as { name?: string } | null)?.name ?? null,
          },
        },
      };
    }

    case 'edit_last_transaction': {
      // Mismo criterio que delete: el último cargado (orden de creación).
      const [last] = await transactionsService.list(userId, { limit: 1, orderByCreated: true });
      if (!last) return { response: { success: false, error: 'No encontré un movimiento reciente para editar.' } };
      if (last.type === 'transfer') {
        return { response: { success: false, error: 'No puedo editar transferencias desde acá. Borrala y recreala.' } };
      }
      const merged: BotTxPayload = {
        type: str(args.type) || last.type,
        amount: num(args.amount) ?? last.amount,
        currency: last.currency,
        account: str(args.account) || (last.account as { name?: string } | null)?.name || null,
        category: str(args.category) || (last.category as { name?: string } | null)?.name,
        description: str(args.description) || last.description || undefined,
        transactionDate: last.transaction_date,
      };
      // Crear primero; recién si salió bien borramos el viejo (no perder datos).
      const res = await executeBotTransaction(userId, financialContext, merged, {});
      if (res.kind === 'abort') return { response: { success: false, error: res.reply } };
      try {
        await transactionsService.delete(last.id, userId);
      } catch (e) {
        // El nuevo ya quedó; si no pudimos borrar el viejo, avisamos para evitar duplicado silencioso.
        console.error('edit_last_transaction: no se pudo borrar el movimiento anterior', e);
        return {
          response: {
            success: true,
            warning: 'Registré la corrección pero no pude borrar el movimiento anterior; revisalo en la app.',
            summary: res.reply,
          },
          executed: res.executed ? [res.executed] : undefined,
        };
      }
      return {
        response: { success: true, summary: res.reply },
        executed: res.executed ? [res.executed] : undefined,
      };
    }

    case 'get_spending': {
      const { start, end, label } = resolvePeriod(str(args.period));
      const breakdown = await analyticsService.getCategoryBreakdown(userId, start, end, 'expense');
      const total = breakdown.reduce((s, c) => s + c.amount, 0);
      const category = str(args.category);
      if (category) {
        const c = breakdown.find((x) => x.name.toLowerCase().includes(category.toLowerCase()));
        return {
          response: {
            period: label,
            category: c?.name ?? category,
            total: round(c?.amount ?? 0),
            count: c?.count ?? 0,
            found: Boolean(c),
          },
        };
      }
      return {
        response: {
          period: label,
          total: round(total),
          top: breakdown.slice(0, 6).map((c) => ({ category: c.name, amount: round(c.amount), count: c.count })),
        },
      };
    }

    case 'list_transactions': {
      const limit = Math.min(Math.max(num(args.limit) ?? 8, 1), 20);
      const opts: Parameters<typeof transactionsService.list>[1] = { limit };
      const type = str(args.type);
      if (type) opts.type = type;
      const search = str(args.search);
      if (search) opts.search = search;
      const category = str(args.category);
      if (category) {
        const cat = financialContext.categories.find((c) => c.name.toLowerCase() === category.toLowerCase());
        if (cat) opts.categoryId = cat.id;
      }
      const account = str(args.account);
      if (account) {
        const fuzzy = await accountsService.findByNameFuzzy(userId, account);
        if (fuzzy.account) opts.accountId = fuzzy.account.id;
      }
      const period = str(args.period);
      if (period) {
        const { start, end } = resolvePeriod(period);
        opts.startDate = toYMD(start);
        opts.endDate = toYMD(end);
      }
      const txs = await transactionsService.list(userId, opts);
      return {
        response: {
          count: txs.length,
          transactions: txs.map((t) => ({
            date: t.transaction_date?.slice(0, 10),
            type: t.type,
            amount: t.amount,
            currency: t.currency,
            category: (t.category as { name?: string } | null)?.name ?? null,
            account: (t.account as { name?: string } | null)?.name ?? null,
            description: t.description,
          })),
        },
      };
    }

    case 'get_budget_status': {
      const rows = await budgetsService.getStatus(userId, new Date());
      if (!rows?.length) return { response: { budgets: [], note: 'No hay presupuestos configurados.' } };
      return {
        response: {
          budgets: rows.map((b) => ({
            category: b.category_name,
            budget: round(b.budget_amount),
            spent: round(b.spent_amount),
            remaining: round(b.remaining_amount),
            percentUsed: round(b.percent_used),
          })),
        },
      };
    }

    case 'get_portfolio': {
      const p = await investmentsService.getPortfolioSummary(userId, { skipDailySnapshot: true });
      return {
        response: {
          totalValueUSD: round(p.totalCurrentValue, 2),
          totalValueARSBlue: round(p.totalCurrentValueArsBlue),
          pnlUSD: round(p.totalPnL, 2),
          pnlPercent: round(p.totalPnLPercent, 1),
          dailyPnlUSD: round(p.totalDailyPnLUsd, 2),
          dailyPnlPercent: round(p.totalDailyPnLPercent, 1),
          byType: p.byType.map((t) => ({ type: t.type, value: round(t.value, 2), pnl: round(t.pnl, 2) })),
        },
      };
    }

    case 'get_net_worth': {
      const t = await accountsService.getTotalBalanceWithInvestments(userId);
      return {
        response: {
          liquidARSBlue: round(t.liquidARSBlue),
          liquidUSD: round(t.liquidUSD, 2),
          investmentsARSBlue: round(t.investmentsARSBlue),
          investmentsUSD: round(t.investmentsUSD, 2),
          totalARSBlue: round(t.totalARSBlue),
          totalUSD: round(t.totalUSD, 2),
        },
      };
    }

    case 'get_accounts': {
      const accs = await accountsService.list(userId);
      return {
        response: {
          accounts: accs.map((a) => ({
            name: a.name,
            currency: a.currency,
            balance: round(a.balance, 2),
            isDebt: a.is_debt,
          })),
        },
      };
    }

    case 'get_quotes': {
      const q = await cotizacionesService.getAllQuotes();
      return {
        response: {
          dolar: {
            blue: round(q.dolar.blue.sell, 2),
            oficial: round(q.dolar.oficial.sell, 2),
            mep: round(q.dolar.mep.sell, 2),
            ccl: round(q.dolar.ccl.sell, 2),
          },
          crypto: {
            btcUSD: round(q.crypto.btc.priceUSD),
            ethUSD: round(q.crypto.eth.priceUSD),
            usdtUSD: round(q.crypto.usdt.priceUSD, 4),
          },
        },
      };
    }

    default:
      return { response: { error: `Herramienta desconocida: ${name}` } };
  }
}
