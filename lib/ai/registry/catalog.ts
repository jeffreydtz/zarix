import type { RegistryTool } from './types';
import { TOOL_SCHEMAS } from './schemas';

const read = { readOnlyHint: true as const, openWorldHint: false as const };
const write = { readOnlyHint: false as const, openWorldHint: false as const };

export const TOOL_CATALOG: readonly RegistryTool[] = [
  {
    name: 'create_transaction',
    description:
      'Registra UN movimiento (gasto, ingreso o transferencia). MCP/REST: no escribas el libro hasta que el usuario confirme. Primero llamá sin confirm (queda en la bandeja de pendientes) y, si el usuario acepta, volvé a llamar con confirm=true. Gemini debe mostrar el preview y pedir confirmación.',
    schema: TOOL_SCHEMAS.create_transaction,
    readOnly: false,
    scopes: ['write'],
    annotations: { ...write, destructiveHint: false, idempotentHint: false },
  },
  {
    name: 'create_transactions',
    description:
      'Registra VARIOS movimientos de un mismo mensaje. MCP/REST: no escribas el libro hasta confirm=true del usuario; si no, se estacionan en pendientes.',
    schema: TOOL_SCHEMAS.create_transactions,
    readOnly: false,
    scopes: ['write'],
    annotations: { ...write, destructiveHint: false, idempotentHint: false },
  },
  {
    name: 'create_account',
    description: 'Crea una cuenta nueva cuando el usuario lo pide explícitamente.',
    schema: TOOL_SCHEMAS.create_account,
    readOnly: false,
    scopes: ['write'],
    annotations: { ...write, destructiveHint: false, idempotentHint: false },
  },
  {
    name: 'delete_last_transaction',
    description:
      'Borra el último movimiento registrado. Usar para "borrá el último", "deshacé eso", "cancelá lo que acabo de cargar". Requiere confirm=true.',
    schema: TOOL_SCHEMAS.delete_last_transaction,
    readOnly: false,
    scopes: ['write'],
    annotations: { ...write, destructiveHint: true, idempotentHint: false },
  },
  {
    name: 'edit_last_transaction',
    description:
      'Corrige el último movimiento (gasto/ingreso). Crea uno nuevo y borra el anterior. Requiere confirm=true. Usar para "eran 5000 no 500", "ponelo en transporte", "era con la visa".',
    schema: TOOL_SCHEMAS.edit_last_transaction,
    readOnly: false,
    scopes: ['write'],
    annotations: { ...write, destructiveHint: true, idempotentHint: false },
  },
  {
    name: 'get_spending',
    description:
      'Cuánto gastó el usuario en un período, total y por categoría. Para "cuánto gasté en comida este mes", "en qué se me va la plata".',
    schema: TOOL_SCHEMAS.get_spending,
    readOnly: true,
    scopes: ['read'],
    annotations: read,
  },
  {
    name: 'list_transactions',
    description:
      'Lista movimientos recientes con filtros. Para "mostrame mis últimos gastos", "qué cargué hoy", "movimientos de la visa".',
    schema: TOOL_SCHEMAS.list_transactions,
    readOnly: true,
    scopes: ['read'],
    annotations: read,
  },
  {
    name: 'get_budget_status',
    description: 'Estado de los presupuestos del mes (gastado vs límite por categoría). Para "cómo voy con el presupuesto".',
    schema: TOOL_SCHEMAS.get_budget_status,
    readOnly: true,
    scopes: ['read'],
    annotations: read,
  },
  {
    name: 'get_portfolio',
    description:
      'Resumen de inversiones: valor actual, ganancia/pérdida total y del día. Para "cómo va mi cartera", "cuánto rindieron mis inversiones".',
    schema: TOOL_SCHEMAS.get_portfolio,
    readOnly: true,
    scopes: ['read'],
    annotations: read,
  },
  {
    name: 'get_net_worth',
    description: 'Patrimonio total: líquido + inversiones, en ARS (blue) y USD. Para "cuánta plata tengo en total", "mi patrimonio".',
    schema: TOOL_SCHEMAS.get_net_worth,
    readOnly: true,
    scopes: ['read'],
    annotations: read,
  },
  {
    name: 'get_accounts',
    description: 'Saldos de todas las cuentas del usuario. Para "cuánto tengo en cada cuenta", "saldo de la visa".',
    schema: TOOL_SCHEMAS.get_accounts,
    readOnly: true,
    scopes: ['read'],
    annotations: read,
  },
  {
    name: 'get_quotes',
    description: 'Cotizaciones de mercado: dólar (blue, oficial, MEP, CCL) y cripto (BTC, ETH, USDT). Para "a cómo está el blue".',
    schema: TOOL_SCHEMAS.get_quotes,
    readOnly: true,
    scopes: ['read'],
    annotations: read,
  },
  {
    name: 'list_recurring',
    description:
      'Lista las reglas recurrentes activas (gastos/ingresos fijos, suscripciones). Para "qué pagos automáticos tengo", "mis gastos fijos", "mis suscripciones".',
    schema: TOOL_SCHEMAS.list_recurring,
    readOnly: true,
    scopes: ['read'],
    annotations: read,
  },
  {
    name: 'create_recurring',
    description:
      'Crea una regla recurrente que registra un movimiento automáticamente. Para "cargame el alquiler todos los meses", "Netflix 15000 por mes", "mi sueldo cada mes".',
    schema: TOOL_SCHEMAS.create_recurring,
    readOnly: false,
    scopes: ['write'],
    annotations: { ...write, destructiveHint: false, idempotentHint: false },
  },
];

export const WRITE_TOOL_NAMES: ReadonlySet<string> = new Set(
  TOOL_CATALOG.filter((t) => !t.readOnly).map((t) => t.name)
);

/** MCP/REST v1 write surface. Gemini and Telegram keep the full catalog. */
export const REMOTE_WRITE_TOOLS: ReadonlySet<string> = new Set([
  'create_transaction',
  'create_transactions',
]);

export function getRegistryTool(name: string): RegistryTool | undefined {
  return TOOL_CATALOG.find((t) => t.name === name);
}

export function isRemoteWriteTool(name: string): boolean {
  return REMOTE_WRITE_TOOLS.has(name);
}

export function remoteToolCatalog(): RegistryTool[] {
  return TOOL_CATALOG.filter((t) => t.readOnly || REMOTE_WRITE_TOOLS.has(t.name));
}

function remoteDescription(tool: RegistryTool): string {
  if (tool.name === 'create_transaction') {
    return 'Registra UN movimiento. Primera llamada: queda en pendientes. Confirmá solo con {confirm:true, pendingId} (payload congelado). write para estacionar; write:confirm para confirmar por MCP/REST.';
  }
  if (tool.name === 'create_transactions') {
    return 'Registra VARIOS movimientos. Primera llamada: pendientes. Confirmá solo con {confirm:true, pendingIds}. write para estacionar; write:confirm para confirmar por MCP/REST.';
  }
  return tool.description;
}

/** PAT/MCP/REST list. In-app Gemini still uses TOOL_CATALOG. */
export function toolsVisibleToScopes(scopes: readonly string[] | null | undefined): RegistryTool[] {
  const allowed = new Set(scopes ?? []);
  return remoteToolCatalog()
    .filter((t) => t.scopes.every((s) => allowed.has(s)))
    .map((t) => (t.readOnly ? t : { ...t, description: remoteDescription(t) }));
}
