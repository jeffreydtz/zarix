import type { AccountType } from '@/types/database';

/** Nombres genéricos (import/defaults en inglés o español) que no identifican la cuenta. */
const GENERIC_NAME_PATTERNS = [
  /^credit\s*card$/i,
  /^tarjeta(\s+de\s+cr[eé]dito)?$/i,
  /^bank$/i,
  /^banco$/i,
  /^cuenta$/i,
  /^account$/i,
  /^wallet$/i,
  /^digital\s*wallet$/i,
  /^billetera$/i,
  /^efectivo$/i,
  /^cash$/i,
  /^other$/i,
  /^otro$/i,
  /^otros?$/i,
];

const TYPE_LABEL_ES: Record<AccountType, string> = {
  cash: 'Efectivo',
  bank: 'Cuenta bancaria',
  credit_card: 'Tarjeta de crédito',
  investment: 'Inversión',
  crypto: 'Crypto',
  digital_wallet: 'Billetera digital',
  other: 'Otra cuenta',
};

export function getAccountTypeLabelEs(type: AccountType): string {
  return TYPE_LABEL_ES[type] ?? TYPE_LABEL_ES.other;
}

function isGenericName(name: string | null | undefined): boolean {
  const t = (name ?? '').trim();
  if (t.length === 0) return true;
  return GENERIC_NAME_PATTERNS.some((re) => re.test(t));
}

export function getAccountDisplayName(account: {
  name: string;
  type: AccountType;
  last_4_digits?: string | null;
}): string {
  const raw = (account.name ?? '').trim();
  if (!isGenericName(raw)) return raw;

  const typeLabel = getAccountTypeLabelEs(account.type);
  const last4 = account.last_4_digits?.trim();
  if (last4 && /^\d{4}$/.test(last4)) {
    return `${typeLabel} · ····${last4}`;
  }
  return typeLabel;
}
