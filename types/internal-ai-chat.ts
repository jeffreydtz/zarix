export type InternalAiChatRole = 'user' | 'model';

export interface InternalAiChatHistoryItem {
  role: InternalAiChatRole;
  text: string;
}

export interface InternalAiChatRequest {
  message: string;
  history?: InternalAiChatHistoryItem[];
}

export interface ExecutedTransactionSummary {
  id?: string;
  summary: string;
  amount: number;
  currency: string;
  accountName: string;
  categoryName?: string;
}

export interface InternalAiChatSuccessResponse {
  mode: 'chat' | 'executed';
  assistant_message: string;
  executed?: ExecutedTransactionSummary[];
  raw_response?: string;
}

export interface InternalAiChatErrorResponse {
  error: string;
  code?: 'subscription_required' | 'missing_gemini_key';
  status?: 'ACTIVE' | 'GRACE_PERIOD' | 'PAST_DUE' | 'CANCELED' | null;
}
