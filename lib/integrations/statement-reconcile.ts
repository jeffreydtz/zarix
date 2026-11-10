export type LedgerCandidate = {
  id: string;
  amount: number;
  currency: string;
  transaction_date: string;
  description: string | null;
  installment_number?: number | null;
  installment_total?: number | null;
};

export type ReconcileMatch = {
  kind: 'none' | 'duplicate' | 'installment';
  existingId?: string;
  reason?: string;
};

export type ReconcileSubject = {
  amount: number;
  currency: string;
  merchant: string;
  date: string | null;
  installments: number;
  installmentNumber: number | null;
};

function cents(n: number): number {
  return Math.round(n * 100);
}

export function normalizeMerchantKey(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function merchantsOverlap(a: string, b: string): boolean {
  const left = normalizeMerchantKey(a);
  const right = normalizeMerchantKey(b);
  if (!left || !right) return true;
  if (left === right) return true;
  if (left.includes(right) || right.includes(left)) return true;
  const aTokens = new Set(left.split(' ').filter((t) => t.length > 2));
  const bTokens = right.split(' ').filter((t) => t.length > 2);
  if (aTokens.size === 0 || bTokens.length === 0) return false;
  return bTokens.some((t) => aTokens.has(t));
}

function civilDay(iso: string): string | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10) || null;
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Cordoba',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

function daysApart(a: string, b: string): number | null {
  const da = Date.parse(`${a}T12:00:00Z`);
  const db = Date.parse(`${b}T12:00:00Z`);
  if (Number.isNaN(da) || Number.isNaN(db)) return null;
  return Math.abs(Math.round((da - db) / 86_400_000));
}

export function reconcileExtractedMovement(
  subject: ReconcileSubject,
  ledger: LedgerCandidate[]
): ReconcileMatch {
  const subjectDay = subject.date;
  for (const row of ledger) {
    if (row.currency !== subject.currency) continue;
    if (cents(Number(row.amount)) !== cents(subject.amount)) continue;
    const rowDay = civilDay(row.transaction_date);
    if (subjectDay && rowDay) {
      const gap = daysApart(subjectDay, rowDay);
      if (gap == null || gap > 1) continue;
    }
    if (!merchantsOverlap(subject.merchant, row.description || '')) continue;

    const instTotal = row.installment_total ?? 0;
    const instNum = row.installment_number ?? 0;
    if (
      (subject.installments > 1 || instTotal > 1) &&
      instTotal === subject.installments &&
      (subject.installmentNumber == null || instNum === subject.installmentNumber)
    ) {
      return {
        kind: 'installment',
        existingId: row.id,
        reason: `Coincide con cuota ${instNum || '?'}/${instTotal} ya cargada.`,
      };
    }
    return {
      kind: 'duplicate',
      existingId: row.id,
      reason: 'Mismo monto, fecha y comercio que un movimiento ya cargado.',
    };
  }
  return { kind: 'none' };
}
