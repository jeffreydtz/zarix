export const WRITE_CHANNELS = ['web', 'telegram', 'wallet', 'api', 'mcp'] as const;
export type WriteChannel = (typeof WRITE_CHANNELS)[number];

export const TOOL_SCOPES = ['read', 'write', 'ingest'] as const;
export type ToolScope = (typeof TOOL_SCOPES)[number];

export type ToolArgs = Record<string, unknown>;

export type RegistryToolResult = {
  /** JSON object returned to the model / MCP / REST caller. */
  response: Record<string, unknown>;
  executed?: import('@/types/internal-ai-chat').ExecutedTransactionSummary[];
};

export type RegistryToolContext = {
  userId: string;
  financialContext: import('@/lib/ai/prompts').FinancialContext;
  /** Channel that originated the write. Read tools ignore it. */
  source?: WriteChannel;
  /** If set, the executor rejects tools whose scopes are not a subset. */
  allowedScopes?: readonly ToolScope[];
  /** Durable request id, e.g. wallet:{pendingItemId}. Never taken from tool args. */
  requestId?: string;
};

export type RegistryTool = {
  name: string;
  description: string;
  /** Zod schema used for validation and JSON-schema export. */
  schema: import('zod').ZodTypeAny;
  readOnly: boolean;
  scopes: readonly ToolScope[];
  /** MCP annotations (PR B consumes these; the registry is the source of truth). */
  annotations: {
    readOnlyHint: boolean;
    destructiveHint?: boolean;
    idempotentHint?: boolean;
    openWorldHint?: boolean;
  };
};
