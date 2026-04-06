export type AccountType =
  | 'cash'
  | 'bank'
  | 'credit_card'
  | 'investment'
  | 'crypto'
  | 'digital_wallet'
  | 'other';

export type TransactionType = 'expense' | 'income' | 'transfer' | 'adjustment';

export type CategoryType = 'expense' | 'income';

export type RecurrenceFrequency = 'daily' | 'weekly' | 'monthly' | 'yearly';

export type InvestmentType =
  | 'stock_arg'
  | 'cedear'
  | 'stock_us'
  | 'etf'
  | 'crypto'
  | 'plazo_fijo'
  | 'fci'
  | 'bond'
  | 'caucion'
  | 'real_estate'
  | 'other';

export interface Database {
  public: {
    Tables: {
      users: {
        Row: User;
        Insert: Omit<User, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<User, 'id' | 'created_at' | 'updated_at'>>;
      };
      accounts: {
        Row: Account;
        Insert: Omit<Account, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<Account, 'id' | 'created_at' | 'updated_at'>>;
      };
      transactions: {
        Row: Transaction;
        Insert: Omit<Transaction, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<Transaction, 'id' | 'created_at' | 'updated_at'>>;
      };
      categories: {
        Row: Category;
        Insert: Omit<Category, 'id' | 'created_at'>;
        Update: Partial<Omit<Category, 'id' | 'created_at'>>;
      };
      budgets: {
        Row: Budget;
        Insert: Omit<Budget, 'id' | 'created_at'>;
        Update: Partial<Omit<Budget, 'id' | 'created_at'>>;
      };
      investments: {
        Row: Investment;
        Insert: Omit<Investment, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<Investment, 'id' | 'created_at' | 'updated_at'>>;
      };
      recurring_rules: {
        Row: RecurringRule;
        Insert: Omit<RecurringRule, 'id' | 'created_at'>;
        Update: Partial<Omit<RecurringRule, 'id' | 'created_at'>>;
      };
      exchange_rates: {
        Row: ExchangeRate;
        Insert: Omit<ExchangeRate, 'id'>;
        Update: Partial<Omit<ExchangeRate, 'id'>>;
      };
      bot_sessions: {
        Row: BotSession;
        Insert: Omit<BotSession, 'id' | 'created_at'>;
        Update: Partial<Omit<BotSession, 'id' | 'created_at'>>;
      };
    };
  };
}

export interface User {
  id: string;
  telegram_chat_id: number | null;
  telegram_username: string | null;
  gemini_api_key: string | null;
  telegram_bot_token: string | null;
  telegram_webhook_secret: string | null;
  default_currency: string;
  timezone: string;
  notification_time: string;
  daily_summary_enabled: boolean;
  weekly_summary_enabled: boolean;
  monthly_summary_enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface Account {
  id: string;
  user_id: string;
  name: string;
  type: AccountType;
  currency: string;
  balance: number;
  icon: string | null;
  color: string;
  is_debt: boolean;
  include_in_total: boolean;
  min_balance: number | null;
  credit_limit: number | null;
  closing_day: number | null;
  due_day: number | null;
  last_4_digits: string | null;
  is_multicurrency: boolean;
  secondary_currency: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Transaction {
  id: string;
  user_id: string;
  type: TransactionType;
  account_id: string | null;
  destination_account_id: string | null;
  amount: number;
  currency: string;
  amount_in_account_currency: number;
  exchange_rate: number | null;
  category_id: string | null;
  description: string | null;
  notes: string | null;
  tags: string[] | null;
  transaction_date: string;
  receipt_url: string | null;
  location: {
    lat: number;
    lng: number;
    name?: string;
  } | null;
  is_recurring: boolean;
  recurring_rule_id: string | null;
  installment_number: number | null;
  installment_total: number | null;
  installment_group_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface Category {
  id: string;
  user_id: string | null;
  name: string;
  type: CategoryType;
  icon: string;
  parent_id: string | null;
  is_system: boolean;
  created_at: string;
}

export interface Budget {
  id: string;
  user_id: string;
  category_id: string | null;
  month: string;
  amount: number;
  currency: string;
  rollover_enabled: boolean;
  rollover_amount: number;
  alert_at_percent: number;
  created_at: string;
}

export interface Investment {
  id: string;
  user_id: string;
  account_id: string;
  type: InvestmentType;
  ticker: string | null;
  name: string;
  quantity: number;
  purchase_price: number;
  purchase_currency: string;
  purchase_date: string;
  current_price: number | null;
  current_price_updated_at: string | null;
  maturity_date: string | null;
  interest_rate: number | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface RecurringRule {
  id: string;
  user_id: string;
  account_id: string;
  type: TransactionType;
  amount: number;
  currency: string;
  category_id: string | null;
  description: string;
  frequency: RecurrenceFrequency;
  start_date: string;
  end_date: string | null;
  last_executed_date: string | null;
  is_active: boolean;
  created_at: string;
}

export interface ExchangeRate {
  id: string;
  source: string;
  from_currency: string;
  to_currency: string;
  rate: number;
  timestamp: string;
}

export interface BotSession {
  id: string;
  user_id: string;
  telegram_chat_id: number;
  context: any[];
  last_message_at: string;
  created_at: string;
}

export interface BudgetStatus {
  category_id: string;
  category_name: string;
  budget_amount: number;
  spent_amount: number;
  remaining_amount: number;
  percent_used: number;
}

export interface BalanceSummary {
  total_accounts: number;
  total_balance_usd: number;
  total_balance_ars_blue: number;
}

export interface AccountPreset {
  name: string;
  type: AccountType;
  currency: string;
  icon: string;
  color: string;
  is_debt: boolean;
}

export const ACCOUNT_PRESETS: AccountPreset[] = [
  { name: 'Efectivo ARS', type: 'cash', currency: 'ARS', icon: '💵', color: '#10B981', is_debt: false },
  { name: 'Efectivo USD', type: 'cash', currency: 'USD', icon: '💵', color: '#059669', is_debt: false },
  { name: 'Mercado Pago', type: 'digital_wallet', currency: 'ARS', icon: '📱', color: '#0099FF', is_debt: false },
  { name: 'BBVA', type: 'bank', currency: 'ARS', icon: '🏦', color: '#004481', is_debt: false },
  { name: 'Galicia', type: 'bank', currency: 'ARS', icon: '🏦', color: '#F37021', is_debt: false },
  { name: 'Santander', type: 'bank', currency: 'ARS', icon: '🏦', color: '#EC0000', is_debt: false },
  { name: 'Macro', type: 'bank', currency: 'ARS', icon: '🏦', color: '#FFD100', is_debt: false },
  { name: 'Visa', type: 'credit_card', currency: 'ARS', icon: '💳', color: '#1A1F71', is_debt: true },
  { name: 'Mastercard', type: 'credit_card', currency: 'ARS', icon: '💳', color: '#EB001B', is_debt: true },
  { name: 'Naranja', type: 'credit_card', currency: 'ARS', icon: '💳', color: '#FF6600', is_debt: true },
  { name: 'American Express', type: 'credit_card', currency: 'ARS', icon: '💳', color: '#006FCF', is_debt: true },
  { name: 'Wise', type: 'digital_wallet', currency: 'USD', icon: '🌐', color: '#9FE870', is_debt: false },
  { name: 'Payoneer', type: 'digital_wallet', currency: 'USD', icon: '🌐', color: '#FF6600', is_debt: false },
  { name: 'Crypto Wallet', type: 'crypto', currency: 'USDT', icon: '₿', color: '#F7931A', is_debt: false },
  { name: 'IOL', type: 'investment', currency: 'ARS', icon: '📈', color: '#0066CC', is_debt: false },
  { name: 'Balanz', type: 'investment', currency: 'ARS', icon: '📈', color: '#00D4AA', is_debt: false },
  { name: 'Cocos Capital', type: 'investment', currency: 'ARS', icon: '📈', color: '#FF4785', is_debt: false },
  { name: 'PPI', type: 'investment', currency: 'ARS', icon: '📈', color: '#0A2463', is_debt: false },
];

export const SUPPORTED_CURRENCIES = [
  'ARS', 'USD', 'USDT', 'BTC', 'ETH'
] as const;

export type SupportedCurrency = typeof SUPPORTED_CURRENCIES[number];
