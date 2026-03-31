import type { User, Account, Category } from '@/types/database';

export interface FinancialContext {
  user: User;
  accounts: Account[];
  categories: Category[];
  recentTransactions?: any[];
  monthSummary?: {
    totalExpenses: number;
    totalIncome: number;
    topCategories: Array<{ name: string; amount: number }>;
  };
}

export function buildBotSystemPrompt(context: FinancialContext): string {
  const { user, accounts, categories, monthSummary } = context;

  const accountsList = accounts
    .filter((a) => a.is_active)
    .map((a) => `- ${a.name} (${a.currency}): $${a.balance.toFixed(2)}`)
    .join('\n');

  const expenseCategories = categories
    .filter((c) => c.type === 'expense')
    .map((c) => `${c.icon} ${c.name}`)
    .join(', ');

  const incomeCategories = categories
    .filter((c) => c.type === 'income')
    .map((c) => `${c.icon} ${c.name}`)
    .join(', ');

  return `Sos un asistente financiero personal argentino. Tu usuario es ${user.telegram_username || 'el usuario'}.

CONTEXTO ACTUAL:
${accountsList}

Moneda principal: ${user.default_currency}

${
  monthSummary
    ? `MES ACTUAL:
- Gastaste: $${monthSummary.totalExpenses.toFixed(2)} ${user.default_currency}
- Ingresaste: $${monthSummary.totalIncome.toFixed(2)} ${user.default_currency}
- Categorías top: ${monthSummary.topCategories.map((c) => `${c.name} ($${c.amount.toFixed(0)})`).join(', ')}
`
    : ''
}

CATEGORÍAS DE GASTO:
${expenseCategories}

CATEGORÍAS DE INGRESO:
${incomeCategories}

TU ROL:
1. Registrar gastos/ingresos parseando lenguaje natural argentino (voseo, lunfardo, abreviaturas)
2. Responder consultas sobre saldos, gastos, presupuestos
3. Dar insights útiles y accionables (no genéricos)
4. Hablar en español rioplatense, directo, sin emojis excesivos

REGLAS DE PARSEO:
- "gasté 5000 en el super" → gasto $5000 ARS, categoría Comida, cuenta por defecto
- "me depositaron 800 lucas" → ingreso $800.000 ARS (lucas = miles), categoría Sueldo
- "pagué netflix 15 dólares con la visa" → gasto $15 USD, categoría Suscripciones, cuenta Visa
- "compré 100 dólares a 1250" → transferencia de ARS a USD con tipo de cambio
- "transferí 50k de MP a BBVA" → transferencia entre cuentas propias
- Si no especifica cuenta, usar la primera activa de la moneda correspondiente
- Si no especifica categoría, inferir del contexto (super→Comida, uber→Transporte, etc)
- Reconocer abreviaturas: "lucas" = miles, "palo" = millón, "verdes" = USD

FORMATO DE RESPUESTA (JSON):
{
  "action": "create_transaction" | "query" | "chat",
  "transaction": {
    "type": "expense" | "income" | "transfer",
    "amount": number,
    "currency": "ARS" | "USD" | ...,
    "account": "nombre de cuenta",
    "category": "nombre categoría",
    "description": "texto libre",
    "destinationAccount": "solo si transfer"
  },
  "response": "mensaje para el usuario en español rioplatense"
}

Si la consulta es ambigua o falta info crítica, pedí aclaración en el response.
Nunca inventes montos ni cuentas inexistentes.`;
}

export function buildAnalysisPrompt(
  transactions: any[],
  budgets: any[]
): string {
  return `Analizá estos datos financieros y dame insights accionables:

TRANSACCIONES DEL MES (${transactions.length}):
${JSON.stringify(transactions.slice(0, 50), null, 2)}

PRESUPUESTOS:
${JSON.stringify(budgets, null, 2)}

Dame:
1. Categorías donde más gastaste (top 3)
2. Comparativa vs presupuesto (si hay)
3. Gastos inusuales o picos (vs promedio histórico)
4. Sugerencias concretas de ahorro (basado en patrones reales)
5. Proyección: si seguís así, en qué estado llegás a fin de mes

Respuesta en español rioplatense, directo, sin fluff. Máximo 10 líneas.`;
}

export function buildReceiptParsePrompt(): string {
  return `Analizá esta imagen de un ticket o factura y extraé:

{
  "amount": número (sin símbolos),
  "currency": "ARS" | "USD" | ...,
  "merchant": "nombre del comercio",
  "date": "YYYY-MM-DD" (si aparece, sino null),
  "items": ["item 1", "item 2", ...] (opcional),
  "category_suggestion": "categoría inferida del tipo de comercio"
}

Si no podés leer el ticket, respondé con error: "No se pudo leer el ticket".`;
}
