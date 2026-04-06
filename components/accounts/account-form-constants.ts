export const ACCOUNT_FORM_ICONS = [
  '💳', '🏦', '💰', '💵', '💸', '🪙',
  '📱', '🏧', '💎', '🎯', '🔐', '📊',
  '💼', '🏠', '🚗', '✈️', '🎓', '⚡',
];

export const ACCOUNT_FORM_TYPES = [
  { value: 'bank', label: 'Banco', icon: '🏦', color: '#3B82F6' },
  { value: 'cash', label: 'Efectivo', icon: '💵', color: '#10B981' },
  { value: 'investment', label: 'Inversion', icon: '📈', color: '#8B5CF6' },
  { value: 'credit_card', label: 'Tarjeta de Credito', icon: '💳', color: '#F59E0B' },
  { value: 'crypto', label: 'Crypto', icon: '₿', color: '#EF4444' },
  { value: 'digital_wallet', label: 'Billetera Digital', icon: '📱', color: '#06B6D4' },
  { value: 'other', label: 'Otro', icon: '🔁', color: '#6B7280' },
] as const;

export const ACCOUNT_FORM_CURRENCIES = [
  { value: 'ARS', label: 'ARS', flag: '🇦🇷' },
  { value: 'USD', label: 'USD', flag: '🇺🇸' },
  { value: 'BTC', label: 'BTC', flag: '₿' },
  { value: 'ETH', label: 'ETH', flag: 'Ξ' },
  { value: 'USDT', label: 'USDT', flag: '₮' },
] as const;
